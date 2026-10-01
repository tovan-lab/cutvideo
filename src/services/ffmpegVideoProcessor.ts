import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import {
  EngineInfo,
  MergeItem,
  OutputQuality,
  ProcessingProgress,
  TrimConfig,
  VideoItem,
  VideoMetadata,
  VideoOperationResult,
} from '../types/video';

export interface FFmpegTrimParams {
  video: VideoItem;
  trimConfig: TrimConfig;
  quality: OutputQuality;
}

export interface FFmpegMergeParams {
  items: MergeItem[];
  quality: OutputQuality;
}

export class FFmpegVideoProcessor {
  private ffmpeg: FFmpeg | null = null;
  private isLoaded = false;
  private isLoading = false;
  private activeBlobUrls = new Set<string>();

  /**
   * Check if the browser environment can theoretically run FFmpeg WASM
   */
  canRunInEnvironment(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof WebAssembly !== 'undefined' &&
      typeof Worker !== 'undefined'
    );
  }

  /**
   * Lazy load the FFmpeg single-thread WebAssembly core from CDN
   */
  async loadFFmpeg(onProgress?: (msg: string) => void): Promise<boolean> {
    if (this.isLoaded && this.ffmpeg) return true;
    if (this.isLoading) {
      while (this.isLoading) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return this.isLoaded;
    }

    if (!this.canRunInEnvironment()) {
      return false;
    }

    try {
      this.isLoading = true;
      onProgress?.('Đang tải mô-đun FFmpeg WebAssembly...');

      this.ffmpeg = new FFmpeg();

      // Log progress from FFmpeg
      this.ffmpeg.on('log', ({ message }) => {
        // quiet logging in console for debug
        if (message.includes('Error') || message.includes('failed')) {
          console.warn('[FFmpeg Core]', message);
        }
      });

      // Use single-threaded core (does not require SharedArrayBuffer or COOP/COEP isolation)
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');

      await this.ffmpeg.load({
        coreURL,
        wasmURL,
      });

      this.isLoaded = true;
      return true;
    } catch (err) {
      console.warn('Could not initialize FFmpeg WASM, will use browser media engine fallback:', err);
      this.isLoaded = false;
      this.ffmpeg = null;
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  getEngineInfo(): EngineInfo {
    return {
      activeEngine: this.isLoaded ? 'ffmpeg' : 'browser',
      ffmpegLoaded: this.isLoaded,
      isStreamCopyCapable: true,
      message: this.isLoaded
        ? 'FFmpeg WASM sẵn sàng (Hỗ trợ Fast Stream Copy -c copy)'
        : 'Sẵn sàng nạp FFmpeg theo yêu cầu (On-Demand)',
    };
  }

  /**
   * Terminate and reset FFmpeg instance (used for cancel or OOM)
   */
  terminate(): void {
    if (this.ffmpeg) {
      try {
        this.ffmpeg.terminate();
      } catch {}
      this.ffmpeg = null;
      this.isLoaded = false;
      this.isLoading = false;
    }
  }

  /**
   * Revoke temporary blob URL
   */
  revokeUrl(url: string): void {
    if (this.activeBlobUrls.has(url)) {
      URL.revokeObjectURL(url);
      this.activeBlobUrls.delete(url);
    }
  }

  /**
   * Helper to write a video file or blob to FFmpeg virtual FS
   */
  private async writeVideoToFS(name: string, video: VideoItem): Promise<void> {
    if (!this.ffmpeg) throw new Error('FFmpeg chưa được nạp.');
    if (video.file) {
      const data = await fetchFile(video.file);
      await this.ffmpeg.writeFile(name, data);
    } else if (video.blob) {
      const data = await fetchFile(video.blob);
      await this.ffmpeg.writeFile(name, data);
    } else {
      const data = await fetchFile(video.url);
      await this.ffmpeg.writeFile(name, data);
    }
  }

  /**
   * REAL TRIM WITH FFMPEG:
   * Supports Stream Copy (-c copy) for instant lossless trim, or Precise Re-encode
   */
  async trimVideo(
    params: FFmpegTrimParams,
    probeFn: (blob: Blob) => Promise<VideoMetadata>,
    onProgress?: (p: ProcessingProgress) => void,
    signal?: AbortSignal
  ): Promise<VideoOperationResult> {
    const { video, trimConfig, quality } = params;
    const startTime = Math.max(0, trimConfig.startTime);
    const endTime = Math.min(video.metadata.duration, trimConfig.endTime);
    const targetDuration = Math.max(0.5, endTime - startTime);

    const isLoaded = await this.loadFFmpeg((msg) => {
      onProgress?.({
        stage: 'analyzing',
        percent: 5,
        message: msg,
      });
    });

    if (!isLoaded || !this.ffmpeg) {
      throw new Error('FFMPEG_UNAVAILABLE');
    }

    if (signal?.aborted) {
      throw new Error('Thao tác đã bị hủy.');
    }

    const inputName = `input_${Date.now()}.mp4`;
    const outputName = `output_${Date.now()}.mp4`;

    try {
      onProgress?.({
        stage: 'analyzing',
        percent: 15,
        message: 'Đang tải video vào bộ nhớ ảo FFmpeg...',
      });

      await this.writeVideoToFS(inputName, video);

      if (signal?.aborted) throw new Error('Thao tác đã bị hủy.');

      // Check trim mode: Fast Stream Copy vs Precise Re-encode
      const isFastStreamCopy =
        (trimConfig.mode === 'fast_stream_copy' || !trimConfig.mode) &&
        quality === 'original';

      // Setup progress listener
      const onProgressCallback = ({ progress }: { progress: number }) => {
        if (signal?.aborted) return;
        const percent = Math.min(95, Math.max(20, Math.round(20 + progress * 75)));
        onProgress?.({
          stage: 'processing',
          percent,
          message: isFastStreamCopy
            ? 'FFmpeg đang Stream Copy phân đoạn không cần re-encode...'
            : 'FFmpeg đang mã hóa khung hình chính xác (Precise Trim)...',
        });
      };

      this.ffmpeg.on('progress', onProgressCallback);

      let command: string[] = [];

      if (isFastStreamCopy) {
        onProgress?.({
          stage: 'processing',
          percent: 30,
          message: 'Chạy chế độ Fast Trim (Stream Copy: -c copy không nén lại)...',
        });
        // Fast Stream Copy: puts -ss before -i for fast seek
        command = [
          '-ss',
          String(startTime),
          '-to',
          String(endTime),
          '-i',
          inputName,
          '-c',
          'copy',
          '-map',
          '0',
          '-avoid_negative_ts',
          'make_zero',
          outputName,
        ];
      } else {
        onProgress?.({
          stage: 'encoding',
          percent: 30,
          message: 'Chạy chế độ Precise Trim (Frame-accurate re-encode)...',
        });

        const scaleFilter =
          quality === '1080p'
            ? 'scale=w=1920:h=1080:force_original_aspect_ratio=decrease'
            : quality === '720p'
            ? 'scale=w=1280:h=720:force_original_aspect_ratio=decrease'
            : 'scale=trunc(iw/2)*2:trunc(ih/2)*2';

        command = [
          '-ss',
          String(startTime),
          '-to',
          String(endTime),
          '-i',
          inputName,
          '-vf',
          scaleFilter,
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-crf',
          '22',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          outputName,
        ];
      }

      try {
        await this.ffmpeg.exec(command);

        if (signal?.aborted) throw new Error('Thao tác đã bị hủy.');

        onProgress?.({
          stage: 'finalizing',
          percent: 98,
          message: 'Đang trích xuất file kết quả từ FFmpeg...',
        });

        const outputData = await this.ffmpeg.readFile(outputName);
        const rawData = typeof outputData === 'string' ? new TextEncoder().encode(outputData) : outputData;
        const safeBuffer = new Uint8Array(rawData).buffer;
        const outBlob = new Blob([safeBuffer], { type: 'video/mp4' });

        const realMeta = await probeFn(outBlob);
        const outputUrl = URL.createObjectURL(outBlob);
        this.activeBlobUrls.add(outputUrl);

        onProgress?.({
          stage: 'completed',
          percent: 100,
          message: isFastStreamCopy
            ? 'Hoàn tất cắt video bằng FFmpeg Stream Copy (Không re-encode)!'
            : 'Hoàn tất cắt video chính xác bằng FFmpeg!',
        });

        return {
          success: true,
          videoUrl: outputUrl,
          videoName: `trimmed_${video.name.replace(/\.[^/.]+$/, '')}.mp4`,
          downloadName: isFastStreamCopy ? 'video_trimmed_streamcopy.mp4' : 'video_trimmed_precise.mp4',
          duration: realMeta.duration || targetDuration,
          sizeBytes: outBlob.size,
          quality,
          operation: 'trim',
          metadata: realMeta,
          blob: outBlob,
          reencodeStatus: isFastStreamCopy ? 'no_reencode' : 'reencoded',
          engineUsed: 'ffmpeg',
        };
      } finally {
        this.ffmpeg.off('progress', onProgressCallback);
        await this.ffmpeg.deleteFile(inputName).catch(() => {});
        await this.ffmpeg.deleteFile(outputName).catch(() => {});
      }
    } catch (err) {
      throw err;
    }
  }

  /**
   * REAL MERGE WITH FFMPEG:
   * Concat multiple video clips with stream copy or normalize re-encode
   */
  async mergeVideos(
    params: FFmpegMergeParams,
    probeFn: (blob: Blob) => Promise<VideoMetadata>,
    onProgress?: (p: ProcessingProgress) => void,
    signal?: AbortSignal
  ): Promise<VideoOperationResult> {
    const { items, quality } = params;
    if (items.length === 0) {
      throw new Error('Danh sách video để ghép không được để trống.');
    }

    const isLoaded = await this.loadFFmpeg((msg) => {
      onProgress?.({
        stage: 'analyzing',
        percent: 5,
        message: msg,
      });
    });

    if (!isLoaded || !this.ffmpeg) {
      throw new Error('FFMPEG_UNAVAILABLE');
    }

    const first = items[0].video;
    const sameResolution = items.every(
      (it) =>
        it.video.metadata.width === first.metadata.width &&
        it.video.metadata.height === first.metadata.height &&
        it.video.metadata.hasAudio === first.metadata.hasAudio
    );

    const hasTrim = items.some(
      (it) =>
        it.trimConfig &&
        (it.trimConfig.startTime > 0 ||
          (it.trimConfig.endTime > 0 && it.trimConfig.endTime < (it.video.metadata.duration || 999999)))
    );
    const isStreamCopyConcat = !hasTrim && sameResolution && quality === 'original';
    const outputName = `merged_${Date.now()}.mp4`;
    const inputNames: string[] = [];

    try {
      onProgress?.({
        stage: 'analyzing',
        percent: 15,
        message: `Đang nạp ${items.length} video vào FFmpeg...`,
      });

      for (let i = 0; i < items.length; i++) {
        if (signal?.aborted) throw new Error('Thao tác đã bị hủy.');
        const name = `clip_${i}.mp4`;
        inputNames.push(name);
        await this.writeVideoToFS(name, items[i].video);
      }

      if (isStreamCopyConcat) {
        onProgress?.({
          stage: 'processing',
          percent: 35,
          message: 'Ghép video siêu tốc (FFmpeg Concat Stream Copy không re-encode)...',
        });

        // Write concat list file
        const listContent = inputNames.map((n) => `file '${n}'`).join('\n');
        await this.ffmpeg.writeFile('concat.txt', new TextEncoder().encode(listContent));

        await this.ffmpeg.exec([
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          'concat.txt',
          '-c',
          'copy',
          outputName,
        ]);

        await this.ffmpeg.deleteFile('concat.txt').catch(() => {});
      } else {
        onProgress?.({
          stage: 'encoding',
          percent: 30,
          message: 'Chuẩn hóa tỉ lệ & ghép khung hình FFmpeg complex filter...',
        });

        // Normalize each clip with scale + pad letterboxing to target dimensions
        const targetW = quality === '720p' ? 1280 : quality === '1080p' ? 1920 : first.metadata.width;
        const targetH = quality === '720p' ? 720 : quality === '1080p' ? 1080 : first.metadata.height;

        const inputsArgs: string[] = [];
        const filterParts: string[] = [];
        const concatInputs: string[] = [];

        for (let i = 0; i < items.length; i++) {
          const tc = items[i].trimConfig;
          if (tc && tc.startTime > 0) {
            inputsArgs.push('-ss', tc.startTime.toString());
          }
          if (tc && tc.endTime > 0 && tc.endTime < (items[i].video.metadata.duration || 999999)) {
            inputsArgs.push('-to', tc.endTime.toString());
          }
          inputsArgs.push('-i', inputNames[i]);
          filterParts.push(
            `[${i}:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`
          );
          concatInputs.push(`[v${i}]`);
          if (items[i].video.metadata.hasAudio) {
            concatInputs.push(`[${i}:a]`);
          } else {
            // Generate silent audio stream for clips without audio
            const dur = tc ? (tc.endTime - tc.startTime) : (items[i].video.metadata.duration || 5);
            filterParts.push(`aevalsrc=0:d=${dur}[a${i}]`);
            concatInputs.push(`[a${i}]`);
          }
        }

        const filterComplex = `${filterParts.join(';')};${concatInputs.join('')}concat=n=${items.length}:v=1:a=1[outv][outa]`;

        const command = [
          ...inputsArgs,
          '-filter_complex',
          filterComplex,
          '-map',
          '[outv]',
          '-map',
          '[outa]',
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-crf',
          '23',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          outputName,
        ];

        await this.ffmpeg.exec(command);
      }

      if (signal?.aborted) throw new Error('Thao tác đã bị hủy.');

      onProgress?.({
        stage: 'finalizing',
        percent: 98,
        message: 'Hoàn tất trích xuất video tổng từ FFmpeg...',
      });

      const outputData = await this.ffmpeg.readFile(outputName);
      const rawData = typeof outputData === 'string' ? new TextEncoder().encode(outputData) : outputData;
      const safeBuffer = new Uint8Array(rawData).buffer;
      const outBlob = new Blob([safeBuffer], { type: 'video/mp4' });

      // Clean up files
      for (const n of inputNames) {
        await this.ffmpeg.deleteFile(n).catch(() => {});
      }
      await this.ffmpeg.deleteFile(outputName).catch(() => {});

      const realMeta = await probeFn(outBlob);
      const outputUrl = URL.createObjectURL(outBlob);
      this.activeBlobUrls.add(outputUrl);

      onProgress?.({
        stage: 'completed',
        percent: 100,
        message: isStreamCopyConcat
          ? 'Hoàn tất ghép video bằng FFmpeg Stream Copy!'
          : 'Hoàn tất ghép và chuẩn hóa video bằng FFmpeg!',
      });

      return {
        success: true,
        videoUrl: outputUrl,
        videoName: `merged_${items.length}_clips.mp4`,
        downloadName: isStreamCopyConcat ? 'video_merged_streamcopy.mp4' : 'video_merged_normalized.mp4',
        duration: realMeta.duration,
        sizeBytes: outBlob.size,
        quality,
        operation: 'merge',
        metadata: realMeta,
        blob: outBlob,
        reencodeStatus: isStreamCopyConcat ? 'no_reencode' : 'reencoded',
        engineUsed: 'ffmpeg',
      };
    } catch (err) {
      for (const n of inputNames) {
        try {
          await this.ffmpeg.deleteFile(n);
        } catch {}
      }
      try {
        await this.ffmpeg.deleteFile(outputName);
      } catch {}
      throw err;
    }
  }
}

export const ffmpegProcessor = new FFmpegVideoProcessor();
