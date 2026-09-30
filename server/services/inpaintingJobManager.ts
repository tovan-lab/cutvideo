import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { INPAINTING_CONFIG } from '../config/inpaintingConfig';
import { MaskArea, serverFFmpegService, VideoProbeData } from './ffmpegService';
import { inpaintingProvider } from './inpaintingProvider';

export type InpaintingJobStage =
  | 'queued'
  | 'preparing'
  | 'uploading'
  | 'processing'
  | 'encoding'
  | 'remuxing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface InpaintingJob {
  id: string;
  status: InpaintingJobStage;
  progress: number; // 0-100
  stageMessage: string;
  createdAt: number;
  updatedAt: number;
  isPreview: boolean;
  videoName: string;
  metadata?: VideoProbeData;
  area: MaskArea;
  feather: number;
  workingDir: string;
  inputVideoPath: string;
  resultPath?: string;
  error?: string;
  providerJobId?: string;
  abortController: AbortController;
}

export class InpaintingJobManager {
  private jobs = new Map<string, InpaintingJob>();

  constructor() {
    // Periodic cleanup of completed/failed job files after retention period
    setInterval(() => this.cleanupOldJobs(), INPAINTING_CONFIG.JOB_RETENTION_MS);
  }

  getJob(id: string): InpaintingJob | undefined {
    return this.jobs.get(id);
  }

  getAllJobs(): InpaintingJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Creates and initializes a new inpainting job
   */
  async createJob(params: {
    videoFile: Express.Multer.File;
    area: MaskArea;
    feather?: number;
    isPreview?: boolean;
  }): Promise<InpaintingJob> {
    const jobId = `job_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const workingDir = path.join(INPAINTING_CONFIG.TEMP_DIR, jobId);
    await fs.mkdir(workingDir, { recursive: true });

    const inputVideoPath = path.join(workingDir, `input_${params.videoFile.originalname}`);
    await fs.writeFile(inputVideoPath, params.videoFile.buffer);

    const abortController = new AbortController();

    const job: InpaintingJob = {
      id: jobId,
      status: 'queued',
      progress: 0,
      stageMessage: 'Đang xếp hàng chờ xử lý...',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPreview: Boolean(params.isPreview),
      videoName: params.videoFile.originalname,
      area: params.area,
      feather: params.feather || 5,
      workingDir,
      inputVideoPath,
      abortController,
    };

    this.jobs.set(jobId, job);

    // Launch pipeline in background
    this.executeJob(job).catch((err) => {
      console.error(`Error executing job ${jobId}:`, err);
      job.status = 'failed';
      job.error = err.message || 'Lỗi không xác định trong quá trình AI Inpainting.';
      job.updatedAt = Date.now();
    });

    return job;
  }

  /**
   * Main asynchronous pipeline runner
   */
  private async executeJob(job: InpaintingJob): Promise<void> {
    const signal = job.abortController.signal;

    try {
      // 1. Check AI Provider Availability first
      const availability = await inpaintingProvider.checkAvailability();
      if (!availability.configured) {
        throw new Error(
          availability.reason ||
            'Chưa cấu hình REPLICATE_API_TOKEN. Vui lòng thêm token vào Settings > Secrets của AI Studio để thực hiện AI Inpainting thật.'
        );
      }

      // 2. STAGE: PREPARING
      job.status = 'preparing';
      job.progress = 10;
      job.stageMessage = 'Đang phân tích thông số video & trích xuất kênh âm thanh...';
      job.updatedAt = Date.now();

      if (signal.aborted) throw new Error('Canceled');

      // Probe metadata
      const metadata = await serverFFmpegService.probeVideo(job.inputVideoPath);
      job.metadata = metadata;

      // Validate video limits
      if (metadata.duration > INPAINTING_CONFIG.MAX_DURATION_SECONDS) {
        throw new Error(
          `Video quá dài (${Math.round(metadata.duration)}s). Giới hạn tối đa là ${INPAINTING_CONFIG.MAX_DURATION_SECONDS}s.`
        );
      }
      if (metadata.width > INPAINTING_CONFIG.MAX_WIDTH || metadata.height > INPAINTING_CONFIG.MAX_HEIGHT) {
        // We allow up to 1080p
      }

      // If preview, trim to 3s first
      let targetVideoPath = job.inputVideoPath;
      if (job.isPreview) {
        const previewVideoPath = path.join(job.workingDir, 'preview_3s_input.mp4');
        const durationSec = Math.min(3, metadata.duration);
        await serverFFmpegService.trimClip(job.inputVideoPath, 0, durationSec, previewVideoPath);
        targetVideoPath = previewVideoPath;
      }

      // Extract original audio track for later remuxing
      let extractedAudioPath: string | null = null;
      if (metadata.hasAudio) {
        extractedAudioPath = path.join(job.workingDir, 'original_audio.aac');
        const audioExtracted = await serverFFmpegService.extractAudio(targetVideoPath, extractedAudioPath);
        if (!audioExtracted) {
          extractedAudioPath = null;
        }
      }

      // Generate Binary Mask (black background, white box)
      job.progress = 20;
      job.stageMessage = 'Đang tạo Binary Mask theo tọa độ vùng chọn...';
      job.updatedAt = Date.now();

      const maskPath = path.join(job.workingDir, 'mask.png');
      await serverFFmpegService.generateMask(
        metadata.width,
        metadata.height,
        job.area,
        job.feather,
        maskPath
      );

      // 3. STAGE: UPLOADING
      job.status = 'uploading';
      job.progress = 30;
      job.stageMessage = 'Đang gửi dữ liệu video và mask lên GPU AI Inference Provider...';
      job.updatedAt = Date.now();

      if (signal.aborted) throw new Error('Canceled');

      const { providerJobId } = await inpaintingProvider.createJob(
        {
          videoPath: targetVideoPath,
          maskPath,
          width: metadata.width,
          height: metadata.height,
          duration: job.isPreview ? Math.min(3, metadata.duration) : metadata.duration,
          fps: metadata.fps,
        },
        signal
      );

      job.providerJobId = providerJobId;

      // 4. STAGE: PROCESSING (POLLING GPU INFERENCE)
      job.status = 'processing';
      job.progress = 50;
      job.stageMessage = 'Mô hình AI đang tái tạo bối cảnh (ProPainter GPU Inference)...';
      job.updatedAt = Date.now();

      let outputUrl: string | undefined;
      const startTime = Date.now();

      while (!outputUrl) {
        if (signal.aborted) throw new Error('Canceled');

        if (Date.now() - startTime > INPAINTING_CONFIG.JOB_TIMEOUT_MS) {
          throw new Error('Thời gian xử lý GPU vượt quá giới hạn cho phép (Timeout).');
        }

        await new Promise((r) => setTimeout(r, 2500));

        const statusData = await inpaintingProvider.getJobStatus(providerJobId);

        if (statusData.status === 'succeeded' && statusData.outputUrl) {
          outputUrl = statusData.outputUrl;
          break;
        } else if (statusData.status === 'failed') {
          throw new Error(statusData.error || 'GPU inference failed on provider.');
        } else if (statusData.status === 'canceled') {
          throw new Error('Job was canceled on provider.');
        }

        // Keep stage-based message without fake arbitrary percentages
        job.stageMessage = 'Mô hình ProPainter GPU đang tái tạo điểm ảnh bị che khuất...';
        job.updatedAt = Date.now();
      }

      // 5. STAGE: ENCODING / DOWNLOADING RESULT
      job.status = 'encoding';
      job.progress = 75;
      job.stageMessage = 'Đang tải video kết quả đã tái tạo từ GPU...';
      job.updatedAt = Date.now();

      const downloadedVideoPath = path.join(job.workingDir, 'ai_output_raw.mp4');
      const response = await fetch(outputUrl);
      if (!response.ok) {
        throw new Error(`Không thể tải video từ provider: ${response.statusText}`);
      }
      const buffer = await response.arrayBuffer();
      await fs.writeFile(downloadedVideoPath, Buffer.from(buffer));

      // 6. STAGE: REMUXING AUDIO
      let finalVideoPath = downloadedVideoPath;
      if (extractedAudioPath) {
        job.status = 'remuxing';
        job.progress = 90;
        job.stageMessage = 'Đang ghép lại track âm thanh gốc (FFmpeg Audio Remux)...';
        job.updatedAt = Date.now();

        const remuxedPath = path.join(job.workingDir, 'final_inpainted_with_audio.mp4');
        await serverFFmpegService.remuxAudio(downloadedVideoPath, extractedAudioPath, remuxedPath);
        finalVideoPath = remuxedPath;
      }

      // 7. STAGE: COMPLETED
      job.status = 'completed';
      job.progress = 100;
      job.stageMessage = 'AI Inpainting hoàn tất thành công!';
      job.resultPath = finalVideoPath;
      job.updatedAt = Date.now();
    } catch (err: unknown) {
      if (signal.aborted) {
        job.status = 'cancelled';
        job.stageMessage = 'Đã hủy tác vụ AI Inpainting.';
      } else {
        job.status = 'failed';
        job.error = err instanceof Error ? err.message : 'Xử lý AI Inpainting thất bại.';
        job.stageMessage = `Thất bại: ${job.error}`;
      }
      job.updatedAt = Date.now();
    }
  }

  /**
   * Cancels a running job
   */
  async cancelJob(id: string): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job) return false;

    job.abortController.abort();
    job.status = 'cancelled';
    job.stageMessage = 'Đã hủy tác vụ.';
    job.updatedAt = Date.now();

    if (job.providerJobId) {
      inpaintingProvider.cancelJob(job.providerJobId).catch(() => {});
    }

    // Cleanup working directory
    serverFFmpegService.cleanupDir(job.workingDir).catch(() => {});

    return true;
  }

  /**
   * Deletes and cleans up a specific job
   */
  async removeJob(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (job) {
      await serverFFmpegService.cleanupDir(job.workingDir);
      this.jobs.delete(id);
    }
  }

  /**
   * Cleanup jobs older than retention window
   */
  private async cleanupOldJobs(): Promise<void> {
    const now = Date.now();
    for (const [id, job] of this.jobs.entries()) {
      if (now - job.updatedAt > INPAINTING_CONFIG.JOB_RETENTION_MS) {
        await serverFFmpegService.cleanupDir(job.workingDir);
        this.jobs.delete(id);
      }
    }
  }
}

export const inpaintingJobManager = new InpaintingJobManager();
