import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import { inpaintingProvider } from '../services/inpaintingProvider';
import { inpaintingJobManager } from '../services/inpaintingJobManager';
import { INPAINTING_CONFIG } from '../config/inpaintingConfig';
import { MaskArea } from '../services/ffmpegService';

export const inpaintingRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: INPAINTING_CONFIG.MAX_FILE_SIZE_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('video/')) {
      return cb(new Error('Tập tin tải lên phải là video hợp lệ (MP4, WebM, MOV,...).'));
    }
    cb(null, true);
  },
});

/**
 * 1. Health check endpoint for AI inpainting provider & credentials
 */
inpaintingRouter.get('/health', async (_req: Request, res: Response) => {
  try {
    const availability = await inpaintingProvider.checkAvailability();
    return res.json(availability);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi kiểm tra trạng thái provider.';
    return res.status(500).json({
      available: false,
      provider: inpaintingProvider.name,
      configured: false,
      reason: msg,
      providerReady: false,
    });
  }
});

/**
 * 2. Preview 3s endpoint
 */
inpaintingRouter.post('/preview-3s', upload.single('video'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'NO_FILE',
        message: 'Vui lòng cung cấp tập tin video để xem trước.',
      });
    }

    // Check availability first
    const availability = await inpaintingProvider.checkAvailability();
    if (!availability.configured) {
      return res.status(400).json({
        success: false,
        error: 'PROVIDER_NOT_CONFIGURED',
        message: availability.reason || 'Chưa cấu hình REPLICATE_API_TOKEN trong Settings > Secrets.',
        availability,
      });
    }

    let area: MaskArea = { x: 72, y: 5, width: 23, height: 12 };
    if (req.body.area) {
      try {
        area = typeof req.body.area === 'string' ? JSON.parse(req.body.area) : req.body.area;
      } catch {}
    }

    const feather = Number(req.body.feather) || 5;

    const job = await inpaintingJobManager.createJob({
      videoFile: file,
      area,
      feather,
      isPreview: true,
    });

    return res.json({
      success: true,
      jobId: job.id,
      isPreview: true,
      message: 'Đã khởi tạo tác vụ xem trước 3s.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi khởi tạo xem trước.';
    return res.status(500).json({
      success: false,
      error: 'PREVIEW_INIT_FAILED',
      message: msg,
    });
  }
});

/**
 * 3. Create full inpainting job
 */
inpaintingRouter.post('/jobs', upload.single('video'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'NO_FILE',
        message: 'Vui lòng tải lên tập tin video để xử lý.',
      });
    }

    const availability = await inpaintingProvider.checkAvailability();
    if (!availability.configured) {
      return res.status(400).json({
        success: false,
        error: 'PROVIDER_NOT_CONFIGURED',
        message: availability.reason || 'Chưa cấu hình REPLICATE_API_TOKEN trong Settings > Secrets.',
        availability,
      });
    }

    let area: MaskArea = { x: 72, y: 5, width: 23, height: 12 };
    if (req.body.area) {
      try {
        area = typeof req.body.area === 'string' ? JSON.parse(req.body.area) : req.body.area;
      } catch {}
    }

    const feather = Number(req.body.feather) || 5;

    const job = await inpaintingJobManager.createJob({
      videoFile: file,
      area,
      feather,
      isPreview: false,
    });

    return res.json({
      success: true,
      jobId: job.id,
      message: 'Đã khởi tạo tác vụ AI Inpainting.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi khởi tạo job.';
    return res.status(500).json({
      success: false,
      error: 'JOB_CREATION_FAILED',
      message: msg,
    });
  }
});

/**
 * 4. Get job details
 */
inpaintingRouter.get('/jobs/:id', (req: Request, res: Response) => {
  const job = inpaintingJobManager.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({
      success: false,
      error: 'JOB_NOT_FOUND',
      message: 'Không tìm thấy tác vụ xử lý.',
    });
  }

  return res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    stageMessage: job.stageMessage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    isPreview: job.isPreview,
    videoName: job.videoName,
    metadata: job.metadata,
    error: job.error,
  });
});

/**
 * 5. Get job progress
 */
inpaintingRouter.get('/jobs/:id/progress', (req: Request, res: Response) => {
  const job = inpaintingJobManager.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({
      success: false,
      error: 'JOB_NOT_FOUND',
      message: 'Không tìm thấy tác vụ.',
    });
  }

  return res.json({
    status: job.status,
    progress: job.progress,
    stageMessage: job.stageMessage,
    error: job.error,
    isPreview: job.isPreview,
  });
});

/**
 * 6. Get job result video stream
 */
inpaintingRouter.get('/jobs/:id/result', async (req: Request, res: Response) => {
  const job = inpaintingJobManager.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({
      success: false,
      error: 'JOB_NOT_FOUND',
      message: 'Không tìm thấy tác vụ.',
    });
  }

  if (job.status !== 'completed' || !job.resultPath) {
    return res.status(400).json({
      success: false,
      error: 'NOT_COMPLETED',
      status: job.status,
      message: 'Tác vụ chưa hoàn thành hoặc chưa có tệp kết quả.',
    });
  }

  try {
    const stat = await fs.promises.stat(job.resultPath);
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="inpainted_${job.videoName}"`,
    });

    const readStream = fs.createReadStream(job.resultPath);
    readStream.pipe(res);
  } catch (err) {
    console.error('Error streaming result video:', err);
    return res.status(500).json({
      success: false,
      error: 'STREAM_FAILED',
      message: 'Không thể truyền tải tệp kết quả video.',
    });
  }
});

/**
 * 7. Cancel job
 */
inpaintingRouter.delete('/jobs/:id', async (req: Request, res: Response) => {
  const cancelled = await inpaintingJobManager.cancelJob(req.params.id);
  if (!cancelled) {
    return res.status(404).json({
      success: false,
      message: 'Không tìm thấy tác vụ để hủy.',
    });
  }

  return res.json({
    success: true,
    message: 'Đã hủy tác vụ AI Inpainting thành công.',
  });
});
