import {
  BoundingBox,
  InpaintingAvailability,
  ObjectMask,
  ObjectRemovalConfig,
  ObjectTrackingResult,
  OutputQuality,
  ProcessingProgress,
  VideoItem,
  VideoMetadata,
  VideoOperationResult,
} from '../types/video';
import { videoProcessor } from './videoProcessor';
import { aiInpaintingClientService } from './aiInpaintingService';
import { unifiedRenderService } from './unifiedRenderService';

export interface IVideoInpaintingEngine {
  isAvailable(): Promise<InpaintingAvailability>;
  removeObject(
    video: VideoItem,
    config: ObjectRemovalConfig,
    quality: OutputQuality,
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal,
    previewDurationSec?: number
  ): Promise<VideoOperationResult>;
}

/**
 * Real AI Inpainting Engine connecting to backend GPU pipeline
 */
export class RealAIInpaintingEngine implements IVideoInpaintingEngine {
  async isAvailable(): Promise<InpaintingAvailability> {
    const health = await aiInpaintingClientService.checkHealth();
    return {
      available: health.available,
      reason: health.reason || 'AI Inpainting Engine',
      engineName: `${health.provider.toUpperCase()} (${health.model})`,
    };
  }

  async removeObject(
    video: VideoItem,
    config: ObjectRemovalConfig,
    quality: OutputQuality,
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal,
    previewDurationSec?: number
  ): Promise<VideoOperationResult> {
    if (previewDurationSec && previewDurationSec > 0) {
      return aiInpaintingClientService.processPreview3s(video, config, onProgress, signal);
    }
    return aiInpaintingClientService.processInpaintingJob(video, config, quality, onProgress, signal);
  }
}

export interface IObjectRemovalProcessor {
  createMask(selection: BoundingBox, feather?: number): ObjectMask;
  trackObject(video: VideoItem, mask: ObjectMask): Promise<ObjectTrackingResult>;
  getInpaintingStatus(): Promise<InpaintingAvailability>;
  processRemoval(
    params: {
      video: VideoItem;
      config: ObjectRemovalConfig;
      quality: OutputQuality;
      previewDurationSec?: number;
    },
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal
  ): Promise<VideoOperationResult>;
}

export class ObjectRemovalProcessor implements IObjectRemovalProcessor {
  private inpaintingEngine: IVideoInpaintingEngine = new RealAIInpaintingEngine();

  createMask(selection: BoundingBox, feather = 5): ObjectMask {
    return {
      shape: 'rectangle',
      boundingBox: { ...selection },
      feather: Math.max(0, Math.min(30, feather)),
      tracking: false,
    };
  }

  async trackObject(video: VideoItem, mask: ObjectMask): Promise<ObjectTrackingResult> {
    const totalFrames = Math.max(1, Math.round((video.metadata.duration || 5) * 30));
    // In Phase 2/6A, tracking architecture is modeled for static watermark anchor
    return {
      supported: true,
      frameCount: totalFrames,
      trackedFrames: totalFrames,
      message: 'Vùng chọn được cố định qua toàn bộ thời lượng video (Static Watermark Mode).',
    };
  }

  async getInpaintingStatus(): Promise<InpaintingAvailability> {
    return this.inpaintingEngine.isAvailable();
  }

  /**
   * Real video processing for object removal (Blur, Cover, or Real AI Inpaint).
   * If AI Inpaint is selected, connects to backend GPU pipeline.
   */
  async processRemoval(
    params: {
      video: VideoItem;
      config: ObjectRemovalConfig;
      quality: OutputQuality;
      previewDurationSec?: number;
    },
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal
  ): Promise<VideoOperationResult> {
    const { video, config, quality, previewDurationSec } = params;

    // Direct to AI Inpainting Engine if selected
    if (config.method === 'ai_inpaint') {
      const status = await this.inpaintingEngine.isAvailable();
      if (!status.available) {
        throw new Error(status.reason);
      }
      return this.inpaintingEngine.removeObject(
        video,
        config,
        quality,
        onProgress,
        signal,
        previewDurationSec
      );
    }

    // 1. Prioritize Native Server FFmpeg for 50x faster processing and frame-accurate filters
    const isNativeAvailable = await unifiedRenderService.checkNativeFFmpegAvailable();
    if (isNativeAvailable) {
      try {
        const method: 'delogo' | 'blur' | 'cover' =
          config.method === 'cover' ? 'cover' : config.method === 'delogo' ? 'delogo' : 'blur';

        return await unifiedRenderService.render(
          {
            video,
            watermark: {
              enabled: true,
              method,
              area: config.area,
              coverColor: config.coverColor,
              feather: config.feather,
            },
            trim:
              previewDurationSec && previewDurationSec > 0
                ? {
                    enabled: true,
                    startSec: 0,
                    endSec: Math.min(previewDurationSec, video.metadata.duration),
                  }
                : undefined,
            quality,
          },
          onProgress,
          signal
        );
      } catch (err: unknown) {
        if (signal?.aborted) throw err;
        console.warn('Native unified render failed, falling back to browser canvas:', err);
      }
    }

    const isPreview = Boolean(previewDurationSec && previewDurationSec > 0);
    const targetDuration = isPreview
      ? Math.min(previewDurationSec || 3, video.metadata.duration)
      : video.metadata.duration;

    onProgress?.({
      stage: 'analyzing',
      percent: 5,
      message: isPreview
        ? `Khởi tạo bản xem trước ${targetDuration.toFixed(1)}s cho vùng chọn...`
        : 'Khởi tạo luồng xử lý xóa vật thể (Trình duyệt Fallback)...',
    });

    // Calculate target dimensions
    const isPortrait = video.metadata.height > video.metadata.width;
    let targetWidth = video.metadata.width;
    let targetHeight = video.metadata.height;

    if (quality === '1080p') {
      const maxDim = 1920;
      const primary = isPortrait ? targetHeight : targetWidth;
      if (primary > maxDim) {
        const scale = maxDim / primary;
        targetWidth = Math.round(targetWidth * scale);
        targetHeight = Math.round(targetHeight * scale);
      }
    } else if (quality === '720p') {
      const maxDim = 1280;
      const primary = isPortrait ? targetHeight : targetWidth;
      if (primary > maxDim) {
        const scale = maxDim / primary;
        targetWidth = Math.round(targetWidth * scale);
        targetHeight = Math.round(targetHeight * scale);
      }
    }

    targetWidth = Math.floor(targetWidth / 2) * 2;
    targetHeight = Math.floor(targetHeight / 2) * 2;

    const processVideo = document.createElement('video');
    processVideo.crossOrigin = 'anonymous';
    processVideo.playsInline = true;
    processVideo.preload = 'auto';
    processVideo.src = video.url;

    await new Promise<void>((resolve, reject) => {
      processVideo.onloadeddata = () => resolve();
      processVideo.onerror = () => reject(new Error('Không thể tải video để xử lý.'));
    });

    // Setup Canvas
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { alpha: false })!;

    const fps = video.metadata.fps || 30;
    const canvasStream = canvas.captureStream(fps);

    // Audio setup
    let audioCtx: AudioContext | null = null;
    let audioDestination: MediaStreamAudioDestinationNode | null = null;
    let combinedStream: MediaStream = canvasStream;

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }
        const sourceNode = audioCtx.createMediaElementSource(processVideo);
        audioDestination = audioCtx.createMediaStreamDestination();
        sourceNode.connect(audioDestination);
        const audioTracks = audioDestination.stream.getAudioTracks();
        if (audioTracks.length > 0) {
          combinedStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...audioTracks,
          ]);
        }
      }
    } catch {
      combinedStream = canvasStream;
    }

    // Determine MIME
    let mimeType = 'video/mp4;codecs=avc1.42E01E,mp4a.40.2';
    if (typeof MediaRecorder !== 'undefined' && !MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = MediaRecorder.isTypeSupported('video/mp4')
        ? 'video/mp4'
        : 'video/webm;codecs=vp9,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }
    }

    const recorder = new MediaRecorder(combinedStream, {
      mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : undefined,
      videoBitsPerSecond: quality === '720p' ? 2500000 : 6000000,
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const recordingDone = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: recorder.mimeType || 'video/mp4' }));
      };
    });

    recorder.start(100);

    try {
      await processVideo.play();
    } catch {
      processVideo.muted = true;
      await processVideo.play();
    }

    // Pixel coordinates for bounding box
    const boxX = Math.round((config.area.x / 100) * targetWidth);
    const boxY = Math.round((config.area.y / 100) * targetHeight);
    const boxW = Math.round((config.area.width / 100) * targetWidth);
    const boxH = Math.round((config.area.height / 100) * targetHeight);
    const feather = config.feather || 0;

    await new Promise<void>((resolve, reject) => {
      let isDone = false;

      const loop = () => {
        if (signal?.aborted) {
          isDone = true;
          processVideo.pause();
          try {
            recorder.stop();
          } catch {}
          reject(new Error('Thao tác xóa logo đã bị hủy.'));
          return;
        }

        if (isDone) return;

        // 1. Draw base video frame
        ctx.drawImage(processVideo, 0, 0, targetWidth, targetHeight);

        // 2. Apply removal method
        if (boxW > 0 && boxH > 0) {
          ctx.save();

          if (config.method === 'blur') {
            // Real Blur with optional feather softness
            if (feather > 0) {
              ctx.filter = `blur(${Math.max(12, feather * 2)}px)`;
            } else {
              ctx.filter = 'blur(16px)';
            }

            // Draw blurred patch
            ctx.drawImage(
              processVideo,
              (boxX / targetWidth) * processVideo.videoWidth,
              (boxY / targetHeight) * processVideo.videoHeight,
              (boxW / targetWidth) * processVideo.videoWidth,
              (boxH / targetHeight) * processVideo.videoHeight,
              boxX,
              boxY,
              boxW,
              boxH
            );
          } else if (config.method === 'cover') {
            // Real Cover with matte/solid fill
            ctx.fillStyle = config.coverColor || '#020617'; // default slate-950
            if (feather > 0) {
              ctx.shadowColor = config.coverColor || '#020617';
              ctx.shadowBlur = feather;
            }
            ctx.fillRect(boxX, boxY, boxW, boxH);
          }

          ctx.restore();
        }

        const currentPos = processVideo.currentTime;
        const progressRatio = Math.min(1, currentPos / targetDuration);
        const percent = Math.min(96, Math.max(10, Math.round(10 + progressRatio * 85)));

        onProgress?.({
          stage: 'encoding',
          percent,
          message: isPreview
            ? `Đang kết xuất bản xem trước 3s: ${currentPos.toFixed(1)}s / ${targetDuration.toFixed(1)}s...`
            : `Đang xử lý ${config.method === 'cover' ? 'che phủ' : 'làm mờ'} vật thể: ${currentPos.toFixed(1)}s / ${targetDuration.toFixed(1)}s...`,
        });

        if (processVideo.ended || currentPos >= targetDuration) {
          isDone = true;
          processVideo.pause();
          try {
            recorder.stop();
          } catch {}
          resolve();
          return;
        }

        if ('requestVideoFrameCallback' in processVideo) {
          (processVideo as unknown as { requestVideoFrameCallback: (cb: () => void) => void }).requestVideoFrameCallback(loop);
        } else {
          requestAnimationFrame(loop);
        }
      };

      if ('requestVideoFrameCallback' in processVideo) {
        (processVideo as unknown as { requestVideoFrameCallback: (cb: () => void) => void }).requestVideoFrameCallback(loop);
      } else {
        requestAnimationFrame(loop);
      }
    });

    const outputBlob = await recordingDone;

    // Cleanup resources
    combinedStream.getTracks().forEach((t) => t.stop());
    canvasStream.getTracks().forEach((t) => t.stop());
    if (audioCtx) {
      audioCtx.close().catch(() => {});
    }
    processVideo.src = '';

    const realMeta: VideoMetadata = await videoProcessor.probeVideo(outputBlob);
    const outputUrl = URL.createObjectURL(outputBlob);

    onProgress?.({
      stage: 'completed',
      percent: 100,
      message: isPreview ? 'Bản xem trước 3s đã sẵn sàng!' : 'Hoàn tất xử lý video!',
    });

    return {
      success: true,
      videoUrl: outputUrl,
      videoName: isPreview
        ? `preview_${video.name.replace(/\.[^/.]+$/, '')}.mp4`
        : `cleaned_${video.name.replace(/\.[^/.]+$/, '')}.mp4`,
      downloadName: isPreview ? `preview_object_removal.mp4` : `video_object_removed.mp4`,
      duration: realMeta.duration,
      sizeBytes: outputBlob.size,
      quality,
      operation: 'watermark',
      metadata: realMeta,
      blob: outputBlob,
    };
  }
}

export const objectRemovalProcessor: IObjectRemovalProcessor = new ObjectRemovalProcessor();
