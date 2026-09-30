import {
  BoundingBox,
  ObjectRemovalConfig,
  OutputQuality,
  ProcessingProgress,
  VideoItem,
  VideoMetadata,
  VideoOperationResult,
} from '../types/video';

export interface InpaintingHealthStatus {
  available: boolean;
  provider: string;
  configured: boolean;
  model: string;
  version?: string;
  reason?: string;
  providerReady: boolean;
}

export interface IAIInpaintingClientService {
  checkHealth(): Promise<InpaintingHealthStatus>;
  processPreview3s(
    video: VideoItem,
    config: ObjectRemovalConfig,
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal
  ): Promise<VideoOperationResult>;
  processInpaintingJob(
    video: VideoItem,
    config: ObjectRemovalConfig,
    quality: OutputQuality,
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal
  ): Promise<VideoOperationResult>;
}

export class AIInpaintingClientService implements IAIInpaintingClientService {
  private cachedHealth: InpaintingHealthStatus | null = null;
  private lastHealthCheckTime = 0;

  /**
   * Queries server health for AI inpainting provider & secrets status
   */
  async checkHealth(): Promise<InpaintingHealthStatus> {
    const now = Date.now();
    // Cache for 10 seconds to avoid spamming endpoint
    if (this.cachedHealth && now - this.lastHealthCheckTime < 10000) {
      return this.cachedHealth;
    }

    try {
      const res = await fetch('/api/inpainting/health');
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      const data: InpaintingHealthStatus = await res.json();
      this.cachedHealth = data;
      this.lastHealthCheckTime = now;
      return data;
    } catch {
      const fallback: InpaintingHealthStatus = {
        available: false,
        provider: 'replicate',
        configured: false,
        model: 'sczhou/propainter',
        reason: 'Không thể kết nối với dịch vụ AI Inpainting trên server.',
        providerReady: false,
      };
      this.cachedHealth = fallback;
      return fallback;
    }
  }

  /**
   * Helper to get video Blob from VideoItem
   */
  private async getVideoBlob(video: VideoItem): Promise<Blob> {
    if (video.file) return video.file;
    if (video.blob) return video.blob;
    const res = await fetch(video.url);
    return await res.blob();
  }

  /**
   * Polls job progress until completed, failed or aborted
   */
  private async pollJob(
    jobId: string,
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal
  ): Promise<void> {
    while (true) {
      if (signal?.aborted) {
        // Trigger server-side job cancellation
        fetch(`/api/inpainting/jobs/${jobId}`, { method: 'DELETE' }).catch(() => {});
        throw new Error('Đã hủy tác vụ AI Inpainting theo yêu cầu.');
      }

      await new Promise((r) => setTimeout(r, 1200));

      const res = await fetch(`/api/inpainting/jobs/${jobId}/progress`);
      if (!res.ok) {
        throw new Error('Mất kết nối kiểm tra tiến trình job trên server.');
      }

      const data = await res.json();

      let stage: 'analyzing' | 'processing' | 'encoding' | 'finalizing' | 'completed' = 'processing';
      if (data.status === 'preparing') stage = 'analyzing';
      else if (data.status === 'uploading' || data.status === 'processing') stage = 'processing';
      else if (data.status === 'encoding' || data.status === 'remuxing') stage = 'encoding';
      else if (data.status === 'completed') stage = 'completed';

      onProgress?.({
        stage,
        percent: data.progress || 50,
        message: data.stageMessage || 'AI Inpainting đang xử lý...',
      });

      if (data.status === 'completed') {
        break;
      } else if (data.status === 'failed') {
        throw new Error(data.error || 'Tác vụ AI Inpainting thất bại.');
      } else if (data.status === 'cancelled') {
        throw new Error('Tác vụ đã bị hủy.');
      }
    }
  }

  /**
   * Executes 3s Preview via AI Inpainting pipeline
   */
  async processPreview3s(
    video: VideoItem,
    config: ObjectRemovalConfig,
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal
  ): Promise<VideoOperationResult> {
    // Check credentials first
    const health = await this.checkHealth();
    if (!health.configured) {
      throw new Error(
        health.reason ||
          'Chưa cấu hình REPLICATE_API_TOKEN. Vui lòng thêm token vào Settings > Secrets của AI Studio để thực hiện AI Inpainting thật.'
      );
    }

    onProgress?.({
      stage: 'analyzing',
      percent: 5,
      message: 'Đang chuẩn bị tệp xem trước 3 giây gửi lên AI Server...',
    });

    const blob = await this.getVideoBlob(video);
    const formData = new FormData();
    formData.append('video', blob, video.name || 'video.mp4');
    formData.append('area', JSON.stringify(config.area));
    formData.append('feather', config.feather.toString());

    const initRes = await fetch('/api/inpainting/preview-3s', {
      method: 'POST',
      body: formData,
      signal,
    });

    const initData = await initRes.json();
    if (!initRes.ok || !initData.success) {
      throw new Error(initData.message || 'Không thể khởi tạo xem trước AI Inpainting.');
    }

    const jobId: string = initData.jobId;

    // Poll until completed
    await this.pollJob(jobId, onProgress, signal);

    onProgress?.({
      stage: 'finalizing',
      percent: 98,
      message: 'Đang tải bản xem trước hoàn thiện...',
    });

    const resultRes = await fetch(`/api/inpainting/jobs/${jobId}/result`);
    if (!resultRes.ok) {
      throw new Error('Không thể tải tệp video xem trước từ server.');
    }

    const resultBlob = await resultRes.blob();
    const videoUrl = URL.createObjectURL(resultBlob);

    const previewDuration = Math.min(3, video.metadata.duration);

    return {
      success: true,
      videoUrl,
      videoName: `preview_3s_${video.name}`,
      downloadName: `preview_ai_inpaint_${video.name}`,
      duration: previewDuration,
      sizeBytes: resultBlob.size,
      quality: 'original',
      operation: 'watermark',
      blob: resultBlob,
      reencodeStatus: 'reencoded',
      engineUsed: 'ai_inpaint',
      metadata: {
        ...video.metadata,
        duration: previewDuration,
        sizeBytes: resultBlob.size,
      },
    };
  }

  /**
   * Executes Full Video Inpainting Job
   */
  async processInpaintingJob(
    video: VideoItem,
    config: ObjectRemovalConfig,
    quality: OutputQuality,
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal
  ): Promise<VideoOperationResult> {
    const health = await this.checkHealth();
    if (!health.configured) {
      throw new Error(
        health.reason ||
          'Chưa cấu hình REPLICATE_API_TOKEN. Vui lòng thêm token vào Settings > Secrets của AI Studio để thực hiện AI Inpainting thật.'
      );
    }

    onProgress?.({
      stage: 'analyzing',
      percent: 5,
      message: 'Đang tải video lên server để khởi tạo luồng AI Inpainting...',
    });

    const blob = await this.getVideoBlob(video);
    const formData = new FormData();
    formData.append('video', blob, video.name || 'video.mp4');
    formData.append('area', JSON.stringify(config.area));
    formData.append('feather', config.feather.toString());

    const initRes = await fetch('/api/inpainting/jobs', {
      method: 'POST',
      body: formData,
      signal,
    });

    const initData = await initRes.json();
    if (!initRes.ok || !initData.success) {
      throw new Error(initData.message || 'Không thể khởi tạo tác vụ AI Inpainting.');
    }

    const jobId: string = initData.jobId;

    // Poll until completed
    await this.pollJob(jobId, onProgress, signal);

    onProgress?.({
      stage: 'finalizing',
      percent: 98,
      message: 'Đang hoàn tất tệp video...',
    });

    const resultRes = await fetch(`/api/inpainting/jobs/${jobId}/result`);
    if (!resultRes.ok) {
      throw new Error('Không thể tải tệp video kết quả từ server.');
    }

    const resultBlob = await resultRes.blob();
    const videoUrl = URL.createObjectURL(resultBlob);

    return {
      success: true,
      videoUrl,
      videoName: `inpainted_${video.name}`,
      downloadName: `inpainted_${video.name}`,
      duration: video.metadata.duration,
      sizeBytes: resultBlob.size,
      quality,
      operation: 'watermark',
      blob: resultBlob,
      reencodeStatus: 'reencoded',
      engineUsed: 'ai_inpaint',
      metadata: {
        ...video.metadata,
        sizeBytes: resultBlob.size,
      },
    };
  }
}

export const aiInpaintingClientService = new AIInpaintingClientService();
