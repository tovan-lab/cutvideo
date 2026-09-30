import {
  AllInOnePlan,
  BoundingBox,
  OutputQuality,
  ProcessingProgress,
  UnifiedEditPlan,
  VideoMetadata,
  VideoOperationResult,
} from '../types/video';
import { videoProcessor } from './videoProcessor';
import { ffmpegProcessor } from './ffmpegVideoProcessor';

export class UnifiedRenderService {
  private activeUrls = new Set<string>();

  /**
   * Revoke temporary object URLs
   */
  revokeUrl(url: string): void {
    if (this.activeUrls.has(url)) {
      URL.revokeObjectURL(url);
      this.activeUrls.delete(url);
    }
  }

  /**
   * Check if Native Server FFmpeg is reachable and ready
   */
  async checkNativeFFmpegAvailable(): Promise<boolean> {
    try {
      const res = await fetch('/api/video/health');
      if (!res.ok) return false;
      const data = await res.json();
      return Boolean(data.nativeFFmpegAvailable);
    } catch {
      return false;
    }
  }

  /**
   * Main unified render execution:
   * 1. Try Native PC FFmpeg (fastest, lossless audio copy, supports delogo/blur)
   * 2. Fallback to browser FFmpeg WASM or Canvas if offline / server unavailable
   */
  async render(
    plan: UnifiedEditPlan,
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal
  ): Promise<VideoOperationResult> {
    const isNativeAvailable = await this.checkNativeFFmpegAvailable();

    if (isNativeAvailable) {
      try {
        onProgress?.({
          stage: 'analyzing',
          percent: 5,
          message: 'Đang chuẩn bị xử lý qua Native FFmpeg (Tốc độ cao)...',
        });

        return await this.renderWithNativeFFmpeg(plan, onProgress, signal);
      } catch (nativeErr: unknown) {
        if (signal?.aborted) throw nativeErr;
        console.warn('Native FFmpeg render failed, falling back to local client processor:', nativeErr);
        onProgress?.({
          stage: 'analyzing',
          percent: 15,
          message: 'Chuyển sang bộ xử lý dự phòng trình duyệt...',
        });
      }
    }

    // Client-side fallback:
    return await this.renderWithClientFallback(plan, onProgress, signal);
  }

  /**
   * Render using Native Server FFmpeg (/api/video/render-unified)
   */
  private async renderWithNativeFFmpeg(
    plan: UnifiedEditPlan,
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal
  ): Promise<VideoOperationResult> {
    const { video, trim, watermark, quality } = plan;

    // Get the video Blob
    let fileBlob: Blob | File;
    if (video.file) {
      fileBlob = video.file;
    } else if (video.blob) {
      fileBlob = video.blob;
    } else {
      const resp = await fetch(video.url);
      fileBlob = await resp.blob();
    }

    const formData = new FormData();
    formData.append('video', fileBlob, video.name || 'input.mp4');

    const renderOptions: {
      trim?: { startSec: number; endSec: number };
      watermark?: {
        method: 'delogo' | 'blur' | 'cover';
        area: BoundingBox;
        color?: string;
        feather?: number;
      };
      quality: OutputQuality;
    } = {
      quality,
    };

    if (trim && trim.enabled) {
      renderOptions.trim = {
        startSec: trim.startSec,
        endSec: trim.endSec,
      };
    }

    if (watermark && watermark.enabled) {
      renderOptions.watermark = {
        method: watermark.method,
        area: watermark.area,
        color: watermark.coverColor,
        feather: watermark.feather,
      };
    }

    formData.append('options', JSON.stringify(renderOptions));

    const startTime = performance.now();

    return new Promise<VideoOperationResult>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/video/render-unified');
      xhr.responseType = 'blob';

      if (signal) {
        signal.addEventListener('abort', () => {
          xhr.abort();
          reject(new Error('Thao tác render video đã bị hủy.'));
        });
      }

      // Track upload progress (0% - 40%)
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const uploadPercent = Math.round((e.loaded / e.total) * 40);
          onProgress?.({
            stage: 'processing',
            percent: Math.max(5, uploadPercent),
            message: `Đang tải video lên bộ xử lý FFmpeg: ${uploadPercent * 2}%...`,
            elapsedSeconds: Number(((performance.now() - startTime) / 1000).toFixed(1)),
          });
        }
      };

      // When upload finishes, processing is happening (40% - 90%)
      xhr.upload.onload = () => {
        onProgress?.({
          stage: 'encoding',
          percent: 50,
          message: 'Native FFmpeg đang xử lý ghép luồng & bộ lọc trong 1 lần duy nhất...',
          elapsedSeconds: Number(((performance.now() - startTime) / 1000).toFixed(1)),
        });
      };

      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const outBlob = xhr.response as Blob;
          const reencodeStatusHeader = xhr.getResponseHeader('X-Reencode-Status');
          const durationHeader = Number(xhr.getResponseHeader('X-Duration')) || video.metadata.duration;

          const reencodeStatus = reencodeStatusHeader === 'stream_copied' ? 'no_reencode' : 'reencoded';
          const outUrl = URL.createObjectURL(outBlob);
          this.activeUrls.add(outUrl);

          const probedMeta = await videoProcessor.probeVideo(outBlob).catch(() => ({
            ...video.metadata,
            duration: durationHeader,
            sizeBytes: outBlob.size,
          }));

          onProgress?.({
            stage: 'completed',
            percent: 100,
            message: 'Hoàn tất xử lý video bằng Native FFmpeg!',
            elapsedSeconds: Number(((performance.now() - startTime) / 1000).toFixed(1)),
          });

          resolve({
            success: true,
            videoUrl: outUrl,
            videoName: `cleaned_${video.name.replace(/\.[^/.]+$/, '')}.mp4`,
            downloadName: `video_cleaned.mp4`,
            duration: probedMeta.duration,
            sizeBytes: outBlob.size,
            quality,
            operation: 'unified',
            metadata: probedMeta,
            blob: outBlob,
            reencodeStatus,
            engineUsed: 'native_ffmpeg',
          });
        } else {
          try {
            const errReader = new FileReader();
            errReader.onload = () => {
              try {
                const parsed = JSON.parse(errReader.result as string);
                reject(new Error(parsed.message || 'Lỗi xử lý render Native FFmpeg'));
              } catch {
                reject(new Error(`Server FFmpeg báo lỗi HTTP ${xhr.status}`));
              }
            };
            errReader.readAsText(xhr.response);
          } catch {
            reject(new Error(`Server FFmpeg báo lỗi HTTP ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => {
        reject(new Error('Lỗi kết nối tới Server Native FFmpeg.'));
      };

      xhr.send(formData);
    });
  }

  /**
   * Fallback for browser client when native server is offline
   */
  private async renderWithClientFallback(
    plan: UnifiedEditPlan,
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal
  ): Promise<VideoOperationResult> {
    const { video, trim, watermark, quality } = plan;

    // If only trim is needed, use standard trim
    if (trim?.enabled && (!watermark || !watermark.enabled)) {
      return await videoProcessor.trimVideo(
        {
          video,
          trimConfig: {
            startTime: trim.startSec,
            endTime: trim.endSec,
            mode: 'fast_stream_copy',
          },
          quality,
        },
        onProgress,
        signal
      );
    }

    // If watermark removal is needed
    if (watermark?.enabled) {
      return await videoProcessor.removeObject(
        {
          video,
          config: {
            area: watermark.area,
            method: watermark.method === 'delogo' ? 'blur' : watermark.method,
            feather: watermark.feather ?? 10,
            coverColor: watermark.coverColor,
            tracking: false,
            applyEntireVideo: true,
          },
          quality,
        },
        onProgress,
        signal
      );
    }

    // If neither is enabled, return original video reference
    return {
      success: true,
      videoUrl: video.url,
      videoName: video.name,
      downloadName: video.name,
      duration: video.metadata.duration,
      sizeBytes: video.metadata.sizeBytes,
      quality,
      operation: 'unified',
      metadata: video.metadata,
      blob: video.blob,
      reencodeStatus: 'no_reencode',
      engineUsed: 'browser',
    };
  }

  /**
   * ALL-IN-ONE SINGLE-PASS PIPELINE:
   * Merges clips (with transitions) + Trims + Removes Watermark + Overlays Texts in 1 single pass!
   */
  async renderAllInOne(
    plan: AllInOnePlan,
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal
  ): Promise<VideoOperationResult> {
    const isNativeAvailable = await this.checkNativeFFmpegAvailable();

    if (isNativeAvailable) {
      try {
        onProgress?.({
          stage: 'analyzing',
          percent: 5,
          message: 'Đang chuẩn bị xuất video trọn gói All-in-One (Native FFmpeg)...',
        });

        return await this.renderAllInOneNative(plan, onProgress, signal);
      } catch (nativeErr: unknown) {
        if (signal?.aborted) throw nativeErr;
        console.warn('Native FFmpeg renderAllInOne failed, trying step fallback:', nativeErr);
      }
    }

    // Fallback: run sequential unified steps on client
    return await this.renderAllInOneFallback(plan, onProgress, signal);
  }

  private async renderAllInOneNative(
    plan: AllInOnePlan,
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal
  ): Promise<VideoOperationResult> {
    const { videos, trim, watermark, textItems, merge, quality } = plan;
    if (!videos || videos.length === 0) {
      throw new Error('Chưa có video để xuất.');
    }

    const formData = new FormData();
    for (let i = 0; i < videos.length; i++) {
      const v = videos[i];
      let fileBlob: Blob | File;
      if (v.file) {
        fileBlob = v.file;
      } else if (v.blob) {
        fileBlob = v.blob;
      } else {
        const resp = await fetch(v.url);
        fileBlob = await resp.blob();
      }
      formData.append('videos', fileBlob, v.name || `clip_${i}.mp4`);
    }

    const options = {
      trim: trim?.enabled
        ? {
            enabled: true,
            startSec: trim.startSec,
            endSec: trim.endSec,
          }
        : undefined,
      watermark: watermark?.enabled
        ? {
            enabled: true,
            method: watermark.method,
            area: watermark.area,
            color: watermark.coverColor,
            feather: watermark.feather,
          }
        : undefined,
      textItems: textItems && textItems.length > 0 ? textItems : undefined,
      merge: merge?.enabled
        ? {
            enabled: true,
            transitions: merge.transitions,
            autoTransitions: merge.autoTransitions,
          }
        : undefined,
      quality: quality || 'original',
    };

    formData.append('options', JSON.stringify(options));

    const startTime = performance.now();

    return new Promise<VideoOperationResult>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/video/render-all-in-one');
      xhr.responseType = 'blob';

      if (signal) {
        signal.addEventListener('abort', () => {
          xhr.abort();
          reject(new Error('Thao tác xuất video All-in-One đã bị hủy.'));
        });
      }

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const uploadPercent = Math.round((e.loaded / e.total) * 35);
          onProgress?.({
            stage: 'processing',
            percent: Math.max(5, uploadPercent),
            message: `Đang tải ${videos.length} video lên bộ xử lý FFmpeg: ${Math.round((e.loaded / e.total) * 100)}%...`,
            elapsedSeconds: Number(((performance.now() - startTime) / 1000).toFixed(1)),
          });
        }
      };

      xhr.upload.onload = () => {
        onProgress?.({
          stage: 'encoding',
          percent: 50,
          message: 'Native FFmpeg đang tổng hợp (Cắt + Xóa Watermark + Ghép Clip + Chèn Chữ) trong 1 lần duy nhất...',
          elapsedSeconds: Number(((performance.now() - startTime) / 1000).toFixed(1)),
        });
      };

      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const outBlob = xhr.response as Blob;
          const durationHeader = Number(xhr.getResponseHeader('X-Duration')) || videos[0].metadata.duration;
          const outUrl = URL.createObjectURL(outBlob);
          this.activeUrls.add(outUrl);

          const probedMeta = await videoProcessor.probeVideo(outBlob).catch(() => ({
            ...videos[0].metadata,
            duration: durationHeader,
            sizeBytes: outBlob.size,
          }));

          onProgress?.({
            stage: 'completed',
            percent: 100,
            message: 'Đã xuất thành công video trọn gói hoàn chỉnh!',
            elapsedSeconds: Number(((performance.now() - startTime) / 1000).toFixed(1)),
          });

          resolve({
            success: true,
            videoUrl: outUrl,
            videoName: `all_in_one_${Date.now()}.mp4`,
            downloadName: `video_all_in_one.mp4`,
            duration: probedMeta.duration,
            sizeBytes: outBlob.size,
            quality,
            operation: 'unified',
            metadata: probedMeta,
            blob: outBlob,
            reencodeStatus: 'reencoded',
            engineUsed: 'native_ffmpeg',
          });
        } else {
          try {
            const errReader = new FileReader();
            errReader.onload = () => {
              try {
                const parsed = JSON.parse(errReader.result as string);
                reject(new Error(parsed.message || 'Lỗi xử lý All-in-One trên server FFmpeg'));
              } catch {
                reject(new Error(`Server FFmpeg báo lỗi HTTP ${xhr.status}`));
              }
            };
            errReader.readAsText(xhr.response);
          } catch {
            reject(new Error(`Server FFmpeg báo lỗi HTTP ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => {
        reject(new Error('Lỗi kết nối tới Server Native FFmpeg.'));
      };

      xhr.send(formData);
    });
  }

  private async renderAllInOneFallback(
    plan: AllInOnePlan,
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal
  ): Promise<VideoOperationResult> {
    const { videos, trim, watermark, textItems, quality } = plan;
    let currentVideo = videos[0];

    // Fallback: If merge enabled with multiple videos
    if (plan.merge?.enabled && videos.length > 1) {
      onProgress?.({
        stage: 'processing',
        percent: 20,
        message: 'Đang ghép các clip video...',
      });
      const mergeRes = await videoProcessor.mergeVideos(
        {
          items: videos.map((v, i) => ({ video: v, order: i })),
          quality,
          autoTransitions: plan.merge.autoTransitions,
        },
        onProgress,
        signal
      );
      currentVideo = {
        ...videos[0],
        url: mergeRes.videoUrl,
        blob: mergeRes.blob,
        metadata: mergeRes.metadata,
      };
    }

    // Step 2: Trim & Watermark
    if (trim?.enabled || watermark?.enabled) {
      onProgress?.({
        stage: 'processing',
        percent: 50,
        message: 'Đang cắt và xử lý watermark...',
      });
      const cleanRes = await this.render(
        {
          video: currentVideo,
          trim,
          watermark,
          quality,
        },
        onProgress,
        signal
      );
      currentVideo = {
        ...currentVideo,
        url: cleanRes.videoUrl,
        blob: cleanRes.blob,
        metadata: cleanRes.metadata,
      };
    }

    // Step 3: Text items
    if (textItems && textItems.length > 0) {
      onProgress?.({
        stage: 'processing',
        percent: 80,
        message: 'Đang chèn các lớp chữ...',
      });
      return await videoProcessor.renderTextOverlay(
        {
          video: currentVideo,
          textItems,
          quality,
        },
        onProgress,
        signal
      );
    }

    return {
      success: true,
      videoUrl: currentVideo.url,
      videoName: currentVideo.name,
      downloadName: `video_all_in_one.mp4`,
      duration: currentVideo.metadata.duration,
      sizeBytes: currentVideo.metadata.sizeBytes,
      quality,
      operation: 'unified',
      metadata: currentVideo.metadata,
      blob: currentVideo.blob,
      reencodeStatus: 'reencoded',
      engineUsed: 'browser',
    };
  }
}

export const unifiedRenderService = new UnifiedRenderService();
