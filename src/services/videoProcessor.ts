import {
  BoundingBox,
  EngineInfo,
  MergeItem,
  ObjectRemovalConfig,
  OutputQuality,
  ProcessingProgress,
  TextOverlayItem,
  TrimConfig,
  VideoItem,
  VideoMetadata,
  VideoOperationResult,
} from '../types/video';
import { ffmpegProcessor } from './ffmpegVideoProcessor';

export interface TrimParams {
  video: VideoItem;
  trimConfig: TrimConfig;
  quality: OutputQuality;
}

export interface MergeParams {
  items: MergeItem[];
  quality: OutputQuality;
  autoTransitions?: boolean;
}

export interface TextOverlayParams {
  video: VideoItem;
  textItems: TextOverlayItem[];
  quality: OutputQuality;
}

export interface ObjectRemovalParams {
  video: VideoItem;
  config: ObjectRemovalConfig;
  quality: OutputQuality;
}

export interface IVideoProcessor {
  probeVideo(fileOrBlob: File | Blob): Promise<VideoMetadata>;
  trimVideo(
    params: TrimParams,
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal
  ): Promise<VideoOperationResult>;
  mergeVideos(
    params: MergeParams,
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal
  ): Promise<VideoOperationResult>;
  renderTextOverlay(
    params: TextOverlayParams,
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal
  ): Promise<VideoOperationResult>;
  removeObject(
    params: ObjectRemovalParams,
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal
  ): Promise<VideoOperationResult>;
  revokeUrl(url: string): void;
  getEngineInfo(): EngineInfo;
}

class BrowserMediaProcessor implements IVideoProcessor {
  private activeUrls = new Set<string>();

  /**
   * Cleans up an object URL created by this service
   */
  revokeUrl(url: string): void {
    if (this.activeUrls.has(url)) {
      URL.revokeObjectURL(url);
      this.activeUrls.delete(url);
    }
  }

  /**
   * Accurately probes a video File or Blob to extract real metadata
   */
  async probeVideo(fileOrBlob: File | Blob): Promise<VideoMetadata> {
    const tempUrl = URL.createObjectURL(fileOrBlob);
    try {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.src = tempUrl;

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('Không thể đọc dữ liệu video từ file.'));
      });

      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
      const sizeBytes = fileOrBlob.size;

      // Determine aspect ratio and orientation
      const orientation: VideoMetadata['orientation'] =
        height > width ? 'portrait' : width === height ? 'square' : 'landscape';

      const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
      const divisor = gcd(width, height);
      const ratioW = width / divisor;
      const ratioH = height / divisor;
      const aspectRatio =
        (ratioW === 16 && ratioH === 9) || (width === 1920 && height === 1080)
          ? '16:9'
          : (ratioW === 9 && ratioH === 16) || (width === 1080 && height === 1920)
          ? '9:16'
          : (ratioW === 4 && ratioH === 3)
          ? '4:3'
          : ratioW === ratioH
          ? '1:1'
          : `${ratioW}:${ratioH}`;

      // Detect audio presence
      let hasAudio = false;
      try {
        if ('mozHasAudio' in video) {
          hasAudio = Boolean((video as unknown as { mozHasAudio: boolean }).mozHasAudio);
        } else if ('webkitAudioDecodedByteCount' in video) {
          hasAudio = Boolean((video as unknown as { webkitAudioDecodedByteCount: number }).webkitAudioDecodedByteCount > 0);
        } else if (typeof (video as unknown as { captureStream?: () => MediaStream }).captureStream === 'function') {
          const stream = (video as unknown as { captureStream: () => MediaStream }).captureStream();
          hasAudio = stream.getAudioTracks().length > 0;
          stream.getTracks().forEach((t) => t.stop());
        }
      } catch {
        hasAudio = true; // safe fallback assumption
      }

      const bitrateKbps = duration > 0 ? Math.round((sizeBytes * 8) / (duration * 1000)) : undefined;

      return {
        duration,
        width,
        height,
        aspectRatio,
        orientation,
        fps: 30,
        sizeBytes,
        format: fileOrBlob.type.includes('webm') ? 'WebM' : 'MP4',
        hasAudio,
        bitrateKbps,
      };
    } finally {
      URL.revokeObjectURL(tempUrl);
    }
  }

  /**
   * Determine best supported MediaRecorder MIME type on this browser
   */
  private getSupportedMimeType(): { mimeType: string; extension: string } {
    const candidates = [
      { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
      { mime: 'video/mp4', ext: 'mp4' },
      { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
      { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
      { mime: 'video/webm', ext: 'webm' },
    ];

    for (const c of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mime)) {
        return { mimeType: c.mime, extension: c.ext };
      }
    }

    return { mimeType: '', extension: 'mp4' };
  }

  /**
   * Calculates target resolution based on input dimensions and desired quality profile
   */
  private calculateTargetDimensions(
    sourceWidth: number,
    sourceHeight: number,
    quality: OutputQuality
  ): { targetWidth: number; targetHeight: number } {
    if (quality === 'original') {
      return {
        targetWidth: Math.floor(sourceWidth / 2) * 2,
        targetHeight: Math.floor(sourceHeight / 2) * 2,
      };
    }

    const isPortrait = sourceHeight > sourceWidth;
    let maxDimension = 1920;
    if (quality === '720p') {
      maxDimension = 1280;
    }

    let targetWidth = sourceWidth;
    let targetHeight = sourceHeight;

    const primaryDim = isPortrait ? sourceHeight : sourceWidth;
    if (primaryDim > maxDimension) {
      const scale = maxDimension / primaryDim;
      targetWidth = Math.round(sourceWidth * scale);
      targetHeight = Math.round(sourceHeight * scale);
    }

    // Ensure even dimensions for video codecs
    targetWidth = Math.floor(targetWidth / 2) * 2;
    targetHeight = Math.floor(targetHeight / 2) * 2;

    return { targetWidth, targetHeight };
  }

  /**
   * REAL TRIM: Extracts exact frame segment from startTime to endTime into a newly encoded video
   */
  async trimVideo(
    params: TrimParams,
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal
  ): Promise<VideoOperationResult> {
    const { video, trimConfig, quality } = params;
    const startTime = Math.max(0, trimConfig.startTime);
    const endTime = Math.min(video.metadata.duration, trimConfig.endTime);
    const targetDuration = Math.max(0.5, endTime - startTime);

    onProgress?.({
      stage: 'analyzing',
      percent: 5,
      message: 'Đang khởi tạo bộ giải mã và chuẩn bị khung hình...',
    });

    const { targetWidth, targetHeight } = this.calculateTargetDimensions(
      video.metadata.width,
      video.metadata.height,
      quality
    );

    // Setup processing video element
    const processVideo = document.createElement('video');
    processVideo.crossOrigin = 'anonymous';
    processVideo.playsInline = true;
    processVideo.preload = 'auto';
    processVideo.src = video.url;

    // Wait until video can seek
    await new Promise<void>((resolve, reject) => {
      processVideo.onloadeddata = () => resolve();
      processVideo.onerror = () => reject(new Error('Không thể tải luồng video để xử lý.'));
    });

    // Seek to start position
    processVideo.currentTime = startTime;
    await new Promise<void>((resolve) => {
      const onSeeked = () => {
        processVideo.removeEventListener('seeked', onSeeked);
        resolve();
      };
      processVideo.addEventListener('seeked', onSeeked);
    });

    // Setup Canvas
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { alpha: false })!;

    const fps = video.metadata.fps || 30;
    const canvasStream = canvas.captureStream(fps);

    // Setup Audio
    let audioCtx: AudioContext | null = null;
    let audioDestination: MediaStreamAudioDestinationNode | null = null;
    let combinedStream: MediaStream = canvasStream;

    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
      // Audio capture fallback (e.g. if video has no audio or browser restricts WebAudio)
      combinedStream = canvasStream;
    }

    const { mimeType } = this.getSupportedMimeType();
    const bitRate = quality === '720p' ? 2500000 : quality === '1080p' ? 5000000 : 8000000;

    const recorder = new MediaRecorder(combinedStream, {
      mimeType: mimeType || undefined,
      videoBitsPerSecond: bitRate,
    });

    const recordedChunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    const recordingDone = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const outBlob = new Blob(recordedChunks, {
          type: recorder.mimeType || 'video/mp4',
        });
        resolve(outBlob);
      };
    });

    recorder.start(100);

    onProgress?.({
      stage: 'processing',
      percent: 15,
      message: 'Đang trích xuất và mã hóa các khung hình đã chọn...',
    });

    // Start video playback
    try {
      await processVideo.play();
    } catch (e) {
      // On some mobile browsers, muting is required to play automatically
      processVideo.muted = true;
      await processVideo.play();
    }

    const startTimeStamp = performance.now();
    let isFinished = false;

    // Render loop
    await new Promise<void>((resolve, reject) => {
      const checkFrame = () => {
        if (signal?.aborted) {
          isFinished = true;
          processVideo.pause();
          try {
            recorder.stop();
          } catch {}
          reject(new Error('Thao tác cắt video đã bị hủy.'));
          return;
        }

        if (isFinished) return;

        // Draw current video frame to canvas
        ctx.drawImage(processVideo, 0, 0, targetWidth, targetHeight);

        const currentPos = processVideo.currentTime;
        const processedSec = Math.max(0, currentPos - startTime);
        const progressRatio = Math.min(1, processedSec / targetDuration);
        const percent = Math.min(96, Math.max(15, Math.round(15 + progressRatio * 80)));

        onProgress?.({
          stage: 'encoding',
          percent,
          message: `Đang mã hóa video: ${processedSec.toFixed(1)}s / ${targetDuration.toFixed(1)}s...`,
          elapsedSeconds: Number(((performance.now() - startTimeStamp) / 1000).toFixed(1)),
        });

        if (currentPos >= endTime || processVideo.ended) {
          isFinished = true;
          processVideo.pause();
          try {
            recorder.stop();
          } catch {}
          resolve();
          return;
        }

        if ('requestVideoFrameCallback' in processVideo) {
          (processVideo as unknown as { requestVideoFrameCallback: (cb: () => void) => void }).requestVideoFrameCallback(checkFrame);
        } else {
          requestAnimationFrame(checkFrame);
        }
      };

      if ('requestVideoFrameCallback' in processVideo) {
        (processVideo as unknown as { requestVideoFrameCallback: (cb: () => void) => void }).requestVideoFrameCallback(checkFrame);
      } else {
        requestAnimationFrame(checkFrame);
      }
    });

    onProgress?.({
      stage: 'finalizing',
      percent: 98,
      message: 'Đang hoàn tất đóng gói tập tin video xuất...',
    });

    const outputBlob = await recordingDone;

    // Cleanup resources
    combinedStream.getTracks().forEach((t) => t.stop());
    canvasStream.getTracks().forEach((t) => t.stop());
    if (audioCtx) {
      audioCtx.close().catch(() => {});
    }
    processVideo.src = '';

    // Probe real output metadata
    const realMeta = await this.probeVideo(outputBlob);
    const outputUrl = URL.createObjectURL(outputBlob);
    this.activeUrls.add(outputUrl);

    onProgress?.({
      stage: 'completed',
      percent: 100,
      message: 'Hoàn tất cắt video thật!',
    });

    return {
      success: true,
      videoUrl: outputUrl,
      videoName: `trimmed_${video.name.replace(/\.[^/.]+$/, '')}.mp4`,
      downloadName: `video_trimmed.mp4`,
      duration: realMeta.duration,
      sizeBytes: outputBlob.size,
      quality,
      operation: 'trim',
      metadata: realMeta,
      blob: outputBlob,
    };
  }

  /**
   * REAL MERGE: Sequentially renders multiple clips into ONE continuous single video stream
   */
  async mergeVideos(
    params: MergeParams,
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal
  ): Promise<VideoOperationResult> {
    const { items, quality } = params;
    if (items.length === 0) {
      throw new Error('Danh sách video để ghép không được để trống.');
    }

    // Determine target canvas dimensions from first clip, adjusted for target quality
    const primaryVideo = items[0].video;
    const { targetWidth, targetHeight } = this.calculateTargetDimensions(
      primaryVideo.metadata.width,
      primaryVideo.metadata.height,
      quality
    );

    const totalDuration = items.reduce(
      (acc, it) => acc + (it.video.metadata.duration || 5),
      0
    );

    onProgress?.({
      stage: 'analyzing',
      percent: 5,
      message: `Chuẩn bị ghép ${items.length} phân đoạn video (Tổng: ${Math.round(totalDuration)}s)...`,
    });

    // Master Canvas
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { alpha: false })!;

    const fps = primaryVideo.metadata.fps || 30;
    const canvasStream = canvas.captureStream(fps);

    // Master Web Audio Destination
    let audioCtx: AudioContext | null = null;
    let audioDestination: MediaStreamAudioDestinationNode | null = null;
    let combinedStream: MediaStream = canvasStream;

    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }
        audioDestination = audioCtx.createMediaStreamDestination();
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

    const { mimeType } = this.getSupportedMimeType();
    const bitRate = quality === '720p' ? 2500000 : quality === '1080p' ? 5000000 : 8000000;

    const recorder = new MediaRecorder(combinedStream, {
      mimeType: mimeType || undefined,
      videoBitsPerSecond: bitRate,
    });

    const recordedChunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    const recordingDone = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const outBlob = new Blob(recordedChunks, {
          type: recorder.mimeType || 'video/mp4',
        });
        resolve(outBlob);
      };
    });

    recorder.start(100);

    const startTimeStamp = performance.now();
    let accumulatedSeconds = 0;

    // Sequentially process each clip into the master recording session
    for (let i = 0; i < items.length; i++) {
      if (signal?.aborted) {
        try {
          recorder.stop();
        } catch {}
        throw new Error('Thao tác ghép video đã bị hủy.');
      }

      const item = items[i];
      const clipDuration = item.video.metadata.duration || 5;

      onProgress?.({
        stage: 'processing',
        percent: Math.min(95, Math.max(10, Math.round((accumulatedSeconds / totalDuration) * 90))),
        message: `Đang ghép clip ${i + 1}/${items.length}: "${item.video.name}"...`,
        elapsedSeconds: Number(((performance.now() - startTimeStamp) / 1000).toFixed(1)),
      });

      const clipVideo = document.createElement('video');
      clipVideo.crossOrigin = 'anonymous';
      clipVideo.playsInline = true;
      clipVideo.preload = 'auto';
      clipVideo.src = item.video.url;

      await new Promise<void>((resolve, reject) => {
        clipVideo.onloadeddata = () => resolve();
        clipVideo.onerror = () => reject(new Error(`Không thể phát clip ${item.video.name}`));
      });

      // Connect clip audio to master audio destination if available
      let clipSourceNode: MediaElementAudioSourceNode | null = null;
      if (audioCtx && audioDestination) {
        try {
          clipSourceNode = audioCtx.createMediaElementSource(clipVideo);
          clipSourceNode.connect(audioDestination);
        } catch {}
      }

      try {
        await clipVideo.play();
      } catch {
        clipVideo.muted = true;
        await clipVideo.play();
      }

      // Render clip frames to canvas with letterboxing/pillarboxing to preserve exact aspect ratio
      await new Promise<void>((resolve, reject) => {
        let clipDone = false;

        const renderFrame = () => {
          if (signal?.aborted) {
            clipDone = true;
            clipVideo.pause();
            try {
              recorder.stop();
            } catch {}
            reject(new Error('Thao tác ghép video đã bị hủy.'));
            return;
          }

          if (clipDone) return;

          // Black background
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, targetWidth, targetHeight);

          // Aspect-ratio preserving draw (Letterbox/Pillarbox)
          const scale = Math.min(
            targetWidth / (clipVideo.videoWidth || targetWidth),
            targetHeight / (clipVideo.videoHeight || targetHeight)
          );
          const drawW = (clipVideo.videoWidth || targetWidth) * scale;
          const drawH = (clipVideo.videoHeight || targetHeight) * scale;
          const drawX = (targetWidth - drawW) / 2;
          const drawY = (targetHeight - drawH) / 2;

          ctx.drawImage(clipVideo, drawX, drawY, drawW, drawH);

          const currentElapsed = accumulatedSeconds + clipVideo.currentTime;
          const progressPercent = Math.min(96, Math.max(10, Math.round((currentElapsed / totalDuration) * 90)));

          onProgress?.({
            stage: 'encoding',
            percent: progressPercent,
            message: `Đang kết xuất clip ${i + 1}/${items.length} (${Math.round(currentElapsed)}s / ${Math.round(totalDuration)}s)...`,
            elapsedSeconds: Number(((performance.now() - startTimeStamp) / 1000).toFixed(1)),
          });

          if (clipVideo.ended || clipVideo.currentTime >= clipDuration) {
            clipDone = true;
            clipVideo.pause();
            if (clipSourceNode) {
              try {
                clipSourceNode.disconnect();
              } catch {}
            }
            clipVideo.src = '';
            resolve();
            return;
          }

          if ('requestVideoFrameCallback' in clipVideo) {
            (clipVideo as unknown as { requestVideoFrameCallback: (cb: () => void) => void }).requestVideoFrameCallback(renderFrame);
          } else {
            requestAnimationFrame(renderFrame);
          }
        };

        if ('requestVideoFrameCallback' in clipVideo) {
          (clipVideo as unknown as { requestVideoFrameCallback: (cb: () => void) => void }).requestVideoFrameCallback(renderFrame);
        } else {
          requestAnimationFrame(renderFrame);
        }
      });

      accumulatedSeconds += clipDuration;
    }

    onProgress?.({
      stage: 'finalizing',
      percent: 98,
      message: 'Đang kết hợp các luồng và đóng gói video tổng...',
    });

    try {
      recorder.stop();
    } catch {}

    const outputBlob = await recordingDone;

    // Cleanup resources
    combinedStream.getTracks().forEach((t) => t.stop());
    canvasStream.getTracks().forEach((t) => t.stop());
    if (audioCtx) {
      audioCtx.close().catch(() => {});
    }

    // Probe real output metadata
    const realMeta = await this.probeVideo(outputBlob);
    const outputUrl = URL.createObjectURL(outputBlob);
    this.activeUrls.add(outputUrl);

    onProgress?.({
      stage: 'completed',
      percent: 100,
      message: 'Hoàn tất ghép video thật!',
    });

    return {
      success: true,
      videoUrl: outputUrl,
      videoName: `merged_${items.length}_clips.mp4`,
      downloadName: `video_merged.mp4`,
      duration: realMeta.duration,
      sizeBytes: outputBlob.size,
      quality,
      operation: 'merge',
      metadata: realMeta,
      blob: outputBlob,
    };
  }

  /**
   * REAL TEXT OVERLAY: Renders video with styled text layers onto video frames
   */
  async renderTextOverlay(
    params: TextOverlayParams,
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal
  ): Promise<VideoOperationResult> {
    const { video, textItems, quality } = params;
    const { targetWidth, targetHeight } = this.calculateTargetDimensions(
      video.metadata.width,
      video.metadata.height,
      quality
    );

    const processVideo = document.createElement('video');
    processVideo.crossOrigin = 'anonymous';
    processVideo.playsInline = true;
    processVideo.preload = 'auto';
    processVideo.src = video.url;

    await new Promise<void>((resolve, reject) => {
      processVideo.onloadeddata = () => resolve();
      processVideo.onerror = () => reject(new Error('Không thể tải video để thêm chữ.'));
    });

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
        audioDestination = audioCtx.createMediaStreamDestination();
        const sourceNode = audioCtx.createMediaElementSource(processVideo);
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

    const { mimeType } = this.getSupportedMimeType();
    const bitRate = quality === '720p' ? 2500000 : quality === '1080p' ? 5000000 : 8000000;

    const recorder = new MediaRecorder(combinedStream, {
      mimeType: mimeType || undefined,
      videoBitsPerSecond: bitRate,
    });

    const recordedChunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    const recordingDone = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const outBlob = new Blob(recordedChunks, {
          type: recorder.mimeType || 'video/mp4',
        });
        resolve(outBlob);
      };
    });

    recorder.start(100);
    processVideo.currentTime = 0;

    try {
      await processVideo.play();
    } catch {
      processVideo.muted = true;
      await processVideo.play();
    }

    const duration = processVideo.duration || video.metadata.duration || 10;
    const startTimeStamp = performance.now();

    await new Promise<void>((resolve, reject) => {
      let isDone = false;

      const renderFrame = () => {
        if (signal?.aborted) {
          isDone = true;
          processVideo.pause();
          try {
            recorder.stop();
          } catch {}
          reject(new Error('Thao tác thêm chữ đã bị hủy.'));
          return;
        }

        if (isDone) return;

        // Draw current video frame
        ctx.drawImage(processVideo, 0, 0, targetWidth, targetHeight);

        const curT = processVideo.currentTime;

        // Draw active text items
        for (const item of textItems) {
          const isVisible =
            item.fullDuration || (curT >= item.startTime && curT <= item.endTime);
          if (!isVisible || !item.text.trim()) continue;

          ctx.save();

          // Position
          let posX = (item.x / 100) * targetWidth;
          let posY = (item.y / 100) * targetHeight;

          if (item.positionPreset === 'top') {
            posX = targetWidth / 2;
            posY = targetHeight * 0.1;
          } else if (item.positionPreset === 'center') {
            posX = targetWidth / 2;
            posY = targetHeight / 2;
          } else if (item.positionPreset === 'lower_third') {
            posX = targetWidth / 2;
            posY = targetHeight * 0.75;
          } else if (item.positionPreset === 'bottom') {
            posX = targetWidth / 2;
            posY = targetHeight * 0.88;
          }

          // Font configuration
          const fontSize = Math.round((item.fontSize || 32) * (targetHeight / 720));
          const fontWeight = item.isBold ? 'bold' : 'normal';
          const fontStyle = item.isItalic ? 'italic' : 'normal';
          ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px "${item.fontFamily || 'Montserrat'}", sans-serif`;
          ctx.textAlign = item.textAlign || 'center';
          ctx.textBaseline = 'middle';

          // Animation alpha/translation
          const timeFromStart = Math.max(0, curT - item.startTime);
          const timeToEnd = Math.max(0, item.endTime - curT);
          const animDur = item.animationDuration || 0.4;
          let alpha = (item.opacity ?? 100) / 100;

          if (item.animation === 'fade') {
            if (timeFromStart < animDur) {
              alpha *= timeFromStart / animDur;
            } else if (!item.fullDuration && timeToEnd < animDur) {
              alpha *= timeToEnd / animDur;
            }
          } else if (item.animation === 'slide_up') {
            const p = Math.min(1, timeFromStart / animDur);
            posY += (1 - p) * 30;
          } else if (item.animation === 'slide_left') {
            const p = Math.min(1, timeFromStart / animDur);
            posX += (1 - p) * 40;
          }

          ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

          let displayText = item.isUppercase ? item.text.toUpperCase() : item.text;
          if (item.animation === 'typewriter' && !item.fullDuration) {
            const frac = Math.min(1, timeFromStart / Math.min(2.0, (item.endTime - item.startTime) * 0.7));
            displayText = displayText.slice(0, Math.ceil(displayText.length * frac));
          }

          // Draw Box
          if (item.boxEnabled) {
            const textMetrics = ctx.measureText(displayText);
            const pad = item.boxPadding || 8;
            const boxW = textMetrics.width + pad * 3;
            const boxH = fontSize * 1.4 + pad * 1.5;
            let boxX = posX - boxW / 2;
            if (item.textAlign === 'left') boxX = posX - pad;
            if (item.textAlign === 'right') boxX = posX - boxW + pad;
            const boxY = posY - boxH / 2;

            ctx.fillStyle = item.boxColor || '#000000';
            ctx.save();
            ctx.globalAlpha = ((item.boxOpacity ?? 80) / 100) * alpha;
            ctx.fillRect(boxX, boxY, boxW, boxH);
            ctx.restore();
          }

          // Draw Shadow
          if (item.shadowEnabled) {
            ctx.shadowColor = item.shadowColor || '#000000';
            ctx.shadowBlur = item.shadowBlur || 4;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
          }

          // Draw Stroke
          if (item.strokeEnabled) {
            ctx.strokeStyle = item.strokeColor || '#000000';
            ctx.lineWidth = item.strokeWidth || 2;
            ctx.strokeText(displayText, posX, posY);
          }

          // Draw Text
          ctx.fillStyle = item.textColor || '#ffffff';
          ctx.fillText(displayText, posX, posY);

          ctx.restore();
        }

        const elapsedSec = (performance.now() - startTimeStamp) / 1000;
        const progressPct = Math.min(95, Math.max(5, Math.round((curT / duration) * 90)));

        onProgress?.({
          stage: 'processing',
          percent: progressPct,
          message: `Đang render text vào video (${Math.round(curT)}s / ${Math.round(duration)}s)...`,
          elapsedSeconds: Number(elapsedSec.toFixed(1)),
        });

        if (processVideo.ended || curT >= duration - 0.1) {
          isDone = true;
          processVideo.pause();
          resolve();
          return;
        }

        if ('requestVideoFrameCallback' in processVideo) {
          (processVideo as unknown as { requestVideoFrameCallback: (cb: () => void) => void }).requestVideoFrameCallback(renderFrame);
        } else {
          requestAnimationFrame(renderFrame);
        }
      };

      if ('requestVideoFrameCallback' in processVideo) {
        (processVideo as unknown as { requestVideoFrameCallback: (cb: () => void) => void }).requestVideoFrameCallback(renderFrame);
      } else {
        requestAnimationFrame(renderFrame);
      }

      processVideo.onended = () => {
        if (!isDone) {
          isDone = true;
          resolve();
        }
      };
    });

    onProgress?.({
      stage: 'encoding',
      percent: 98,
      message: 'Đang đóng gói video hoàn chỉnh...',
    });

    try {
      recorder.stop();
    } catch {}

    const outputBlob = await recordingDone;
    combinedStream.getTracks().forEach((t) => t.stop());
    canvasStream.getTracks().forEach((t) => t.stop());
    if (audioCtx) {
      audioCtx.close().catch(() => {});
    }

    const realMeta = await this.probeVideo(outputBlob);
    const outputUrl = URL.createObjectURL(outputBlob);
    this.activeUrls.add(outputUrl);

    return {
      success: true,
      videoUrl: outputUrl,
      videoName: `text_${video.name || 'video'}.mp4`,
      downloadName: `video_with_text.mp4`,
      duration: realMeta.duration,
      sizeBytes: outputBlob.size,
      quality,
      operation: 'text',
      metadata: realMeta,
      blob: outputBlob,
    };
  }

  /**
   * REAL OBJECT/LOGO REMOVAL: Renders video with specified region blurred/pixelated
   */
  async removeObject(
    params: ObjectRemovalParams,
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal
  ): Promise<VideoOperationResult> {
    const { video, config, quality } = params;
    const { targetWidth, targetHeight } = this.calculateTargetDimensions(
      video.metadata.width,
      video.metadata.height,
      quality
    );

    const processVideo = document.createElement('video');
    processVideo.crossOrigin = 'anonymous';
    processVideo.playsInline = true;
    processVideo.preload = 'auto';
    processVideo.src = video.url;

    await new Promise<void>((resolve, reject) => {
      processVideo.onloadeddata = () => resolve();
      processVideo.onerror = () => reject(new Error('Không thể tải video để xử lý.'));
    });

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
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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

    const { mimeType } = this.getSupportedMimeType();
    const recorder = new MediaRecorder(combinedStream, {
      mimeType: mimeType || undefined,
      videoBitsPerSecond: 6000000,
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

    const totalDur = video.metadata.duration || 5;

    // Convert percentage bounding box to pixel coordinates
    const boxX = Math.round((config.area.x / 100) * targetWidth);
    const boxY = Math.round((config.area.y / 100) * targetHeight);
    const boxW = Math.round((config.area.width / 100) * targetWidth);
    const boxH = Math.round((config.area.height / 100) * targetHeight);

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

        // Draw main frame
        ctx.drawImage(processVideo, 0, 0, targetWidth, targetHeight);

        // Apply removal method
        if (boxW > 0 && boxH > 0) {
          ctx.save();
          if (config.method === 'cover') {
            ctx.fillStyle = config.coverColor || '#020617';
            if (config.feather && config.feather > 0) {
              ctx.shadowColor = config.coverColor || '#020617';
              ctx.shadowBlur = config.feather;
            }
            ctx.fillRect(boxX, boxY, boxW, boxH);
          } else {
            // Default: Blur
            const feather = config.feather || 0;
            ctx.filter = `blur(${feather > 0 ? Math.max(12, feather * 2) : 16}px)`;
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
          }
          ctx.restore();
        }

        const currentPos = processVideo.currentTime;
        const percent = Math.min(96, Math.max(10, Math.round((currentPos / totalDur) * 90)));

        onProgress?.({
          stage: 'encoding',
          percent,
          message: `Đang xử lý làm mờ logo: ${currentPos.toFixed(1)}s / ${totalDur.toFixed(1)}s...`,
        });

        if (processVideo.ended || currentPos >= totalDur) {
          isDone = true;
          processVideo.pause();
          try {
            recorder.stop();
          } catch {}
          resolve();
          return;
        }

        requestAnimationFrame(loop);
      };

      requestAnimationFrame(loop);
    });

    const outputBlob = await recordingDone;

    // Cleanup
    combinedStream.getTracks().forEach((t) => t.stop());
    canvasStream.getTracks().forEach((t) => t.stop());
    if (audioCtx) {
      audioCtx.close().catch(() => {});
    }

    const realMeta = await this.probeVideo(outputBlob);
    const outputUrl = URL.createObjectURL(outputBlob);
    this.activeUrls.add(outputUrl);

    onProgress?.({
      stage: 'completed',
      percent: 100,
      message: 'Hoàn tất xóa logo!',
    });

    return {
      success: true,
      videoUrl: outputUrl,
      videoName: `cleaned_${video.name.replace(/\.[^/.]+$/, '')}.mp4`,
      downloadName: `video_cleaned.mp4`,
      duration: realMeta.duration,
      sizeBytes: outputBlob.size,
      quality,
      operation: 'watermark',
      metadata: realMeta,
      blob: outputBlob,
      reencodeStatus: 'reencoded',
      engineUsed: 'browser',
    };
  }

  getEngineInfo(): EngineInfo {
    return {
      activeEngine: 'browser',
      ffmpegLoaded: false,
      isStreamCopyCapable: false,
      message: 'Browser Media Processing Engine (Canvas + Web Audio + MediaRecorder)',
    };
  }
}

/**
 * Hybrid Engine Selector:
 * Prioritizes FFmpeg WASM for high performance & Stream Copy (-c copy),
 * with instant, resilient fallback to BrowserMediaProcessor on any failure or unsupported environment.
 */
class HybridVideoProcessor implements IVideoProcessor {
  private browserProcessor = new BrowserMediaProcessor();

  async probeVideo(fileOrBlob: File | Blob): Promise<VideoMetadata> {
    return this.browserProcessor.probeVideo(fileOrBlob);
  }

  getEngineInfo(): EngineInfo {
    return ffmpegProcessor.getEngineInfo();
  }

  revokeUrl(url: string): void {
    ffmpegProcessor.revokeUrl(url);
    this.browserProcessor.revokeUrl(url);
  }

  async trimVideo(
    params: TrimParams,
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal
  ): Promise<VideoOperationResult> {
    try {
      return await ffmpegProcessor.trimVideo(
        params,
        (blob) => this.browserProcessor.probeVideo(blob),
        onProgress,
        signal
      );
    } catch (err: unknown) {
      if (signal?.aborted) throw err;
      console.warn('FFmpeg trim not available or failed, falling back to BrowserMediaProcessor:', err);
      onProgress?.({
        stage: 'analyzing',
        percent: 10,
        message: 'Chuyển sang bộ xử lý Browser Media Engine...',
      });
      const res = await this.browserProcessor.trimVideo(params, onProgress, signal);
      return {
        ...res,
        reencodeStatus: 'reencoded',
        engineUsed: 'browser',
      };
    }
  }

  async mergeVideos(
    params: MergeParams,
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal
  ): Promise<VideoOperationResult> {
    // 1. Try Native PC Server FFmpeg (Fastest, xfade + acrossfade, auto smooth transitions)
    try {
      const isNative = await fetch('/api/video/health')
        .then((r) => r.json())
        .then((d) => Boolean(d.nativeFFmpegAvailable))
        .catch(() => false);

      if (isNative) {
        onProgress?.({
          stage: 'analyzing',
          percent: 10,
          message: 'Tải video lên Native FFmpeg Server để ghép chuyển cảnh mượt mà...',
        });

        const formData = new FormData();
        for (let i = 0; i < params.items.length; i++) {
          const it = params.items[i];
          let blob: Blob;
          if (it.video.file) {
            blob = it.video.file;
          } else if (it.video.blob) {
            blob = it.video.blob;
          } else {
            blob = await fetch(it.video.url).then((r) => r.blob());
          }
          formData.append('videos', blob, it.video.name || `clip_${i}.mp4`);
        }

        const options = {
          autoTransitions: Boolean(params.autoTransitions),
          transitions: params.items.map((it) =>
            it.transition
              ? it.transition
              : params.autoTransitions
              ? { type: 'fade', duration: 0.75 }
              : { type: 'none', duration: 0 }
          ),
          clipTrims: params.items
            .map((it, idx) => ({
              clipIndex: idx,
              startSec: it.trimConfig?.startTime ?? 0,
              endSec: it.trimConfig?.endTime ?? it.video.metadata.duration ?? 0,
            }))
            .filter(
              (ct) =>
                ct.startSec > 0 ||
                (ct.endSec > 0 &&
                  ct.endSec < (params.items[ct.clipIndex]?.video.metadata.duration || 999999))
            ),
          quality: params.quality,
        };
        formData.append('options', JSON.stringify(options));

        onProgress?.({
          stage: 'encoding',
          percent: 45,
          message: Boolean(params.autoTransitions)
            ? 'Native FFmpeg đang render hiệu ứng chuyển cảnh siêu tốc...'
            : 'Native FFmpeg đang ghép video siêu tốc (Fast Stream / Concat)...',
        });

        const res = await fetch('/api/video/merge', {
          method: 'POST',
          body: formData,
          signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || 'Lỗi ghép video trên server.');
        }

        onProgress?.({
          stage: 'finalizing',
          percent: 92,
          message: 'Đang nhận luồng video hoàn tất...',
        });

        const reencodeStatus = (res.headers.get('X-Reencode-Status') as 'no_reencode' | 'reencoded') || 'reencoded';
        const engineUsed = (res.headers.get('X-Engine-Used') as any) || 'native_ffmpeg';
        const isStreamCopy = reencodeStatus === 'no_reencode';

        const outBlob = await res.blob();
        const outUrl = URL.createObjectURL(outBlob);
        const metadata = await this.browserProcessor.probeVideo(outBlob);

        return {
          success: true,
          videoUrl: outUrl,
          videoName: `merged_${params.items.length}_clips.mp4`,
          downloadName: isStreamCopy ? 'video_merged_streamcopy.mp4' : 'video_merged.mp4',
          duration: metadata.duration,
          sizeBytes: outBlob.size,
          quality: params.quality,
          operation: 'merge',
          metadata,
          blob: outBlob,
          engineUsed,
          reencodeStatus,
        };
      }
    } catch (nativeErr: unknown) {
      if (signal?.aborted) throw nativeErr;
      console.warn('Native FFmpeg merge failed, falling back to local client processor:', nativeErr);
    }

    // 2. Client fallback
    try {
      return await ffmpegProcessor.mergeVideos(
        params,
        (blob) => this.browserProcessor.probeVideo(blob),
        onProgress,
        signal
      );
    } catch (err: unknown) {
      if (signal?.aborted) throw err;
      console.warn('FFmpeg merge failed, falling back to BrowserMediaProcessor:', err);
      onProgress?.({
        stage: 'analyzing',
        percent: 10,
        message: 'Chuyển sang bộ xử lý Browser Media Engine...',
      });
      const res = await this.browserProcessor.mergeVideos(params, onProgress, signal);
      return {
        ...res,
        reencodeStatus: 'reencoded',
        engineUsed: 'browser',
      };
    }
  }

  async renderTextOverlay(
    params: TextOverlayParams,
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal
  ): Promise<VideoOperationResult> {
    const { video, textItems, quality } = params;

    // 1. Try Native PC Server FFmpeg (Supports Vietnamese drawtext, hardware acceleration, lossless audio)
    try {
      const isNative = await fetch('/api/video/health')
        .then((r) => r.json())
        .then((d) => Boolean(d.nativeFFmpegAvailable))
        .catch(() => false);

      if (isNative) {
        onProgress?.({
          stage: 'analyzing',
          percent: 15,
          message: 'Chuẩn bị dữ liệu text và font chữ cho Native FFmpeg...',
        });

        let fileBlob: Blob | File;
        if (video.file) {
          fileBlob = video.file;
        } else if (video.blob) {
          fileBlob = video.blob;
        } else {
          fileBlob = await fetch(video.url).then((r) => r.blob());
        }

        const formData = new FormData();
        formData.append('video', fileBlob, video.name || 'input.mp4');
        formData.append('options', JSON.stringify({ textItems, quality }));

        onProgress?.({
          stage: 'encoding',
          percent: 50,
          message: 'Native FFmpeg đang render lớp chữ động và tối ưu âm thanh...',
        });

        const res = await fetch('/api/video/render-text', {
          method: 'POST',
          body: formData,
          signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || 'Lỗi render chữ vào video.');
        }

        const outBlob = await res.blob();
        const outUrl = URL.createObjectURL(outBlob);
        const metadata = await this.browserProcessor.probeVideo(outBlob);

        return {
          success: true,
          videoUrl: outUrl,
          videoName: `text_${video.name || 'video'}.mp4`,
          downloadName: `video_with_text.mp4`,
          duration: metadata.duration,
          sizeBytes: outBlob.size,
          quality,
          operation: 'text',
          metadata,
          blob: outBlob,
          engineUsed: 'native_ffmpeg',
          reencodeStatus: 'reencoded',
        };
      }
    } catch (err: unknown) {
      if (signal?.aborted) throw err;
      console.warn('Native FFmpeg renderText failed, falling back to BrowserMediaProcessor:', err);
    }

    // 2. Client Browser fallback
    return await this.browserProcessor.renderTextOverlay(params, onProgress, signal);
  }

  async removeObject(
    params: ObjectRemovalParams,
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal
  ): Promise<VideoOperationResult> {
    return this.browserProcessor.removeObject(params, onProgress, signal);
  }
}

export const videoProcessor: IVideoProcessor = new HybridVideoProcessor();
