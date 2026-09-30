import { Router, Request, Response } from 'express';
import multer from 'multer';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { promises as fsp } from 'fs';
import { serverFFmpegService } from '../services/ffmpegService';

export const videoRouter = Router();

// Store temporary uploads on disk instead of RAM to safely handle large videos
const tempDir = path.join(os.tmpdir(), 'video_tool_processing');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const diskUpload = multer({
  dest: tempDir,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2 GB
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('video/')) {
      return cb(new Error('Tập tin tải lên phải là video hợp lệ.'));
    }
    cb(null, true);
  },
});

/**
 * Health check for Native Server FFmpeg
 */
videoRouter.get('/health', async (_req: Request, res: Response) => {
  try {
    const isAvailable = await new Promise<boolean>((resolve) => {
      import('child_process').then((cp) => {
        cp.execFile(process.env.FFMPEG_PATH || 'ffmpeg', ['-version'], (err) => {
          resolve(!err);
        });
      });
    });

    return res.json({
      status: 'ok',
      nativeFFmpegAvailable: isAvailable,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error checking FFmpeg';
    return res.status(500).json({
      status: 'error',
      nativeFFmpegAvailable: false,
      message: msg,
    });
  }
});

/**
 * Unified single-pass video render endpoint:
 * Combines accurate trim, watermark removal (delogo/blur/cover), and resolution conversion
 * into a single fast FFmpeg invocation.
 */
videoRouter.post(
  '/render-unified',
  diskUpload.single('video'),
  async (req: Request, res: Response) => {
    const uploadedFile = req.file;
    if (!uploadedFile) {
      return res.status(400).json({
        success: false,
        error: 'NO_FILE',
        message: 'Vui lòng cung cấp tập tin video.',
      });
    }

    const inputPath = uploadedFile.path;
    const outputPath = path.join(tempDir, `rendered_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`);

    try {
      const optionsRaw = req.body.options;
      const options = optionsRaw ? JSON.parse(optionsRaw) : {};

      const result = await serverFFmpegService.renderUnified({
        inputPath,
        outputPath,
        trim: options.trim,
        watermark: options.watermark,
        quality: options.quality || 'original',
      });

      // Stream the output file back to client
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('X-Reencode-Status', result.reencodeStatus);
      res.setHeader('X-Engine-Used', result.engineUsed);
      res.setHeader('X-Duration', result.duration.toString());
      res.setHeader('X-Size-Bytes', result.sizeBytes.toString());

      const readStream = fs.createReadStream(result.outputPath);
      readStream.pipe(res);

      readStream.on('close', async () => {
        // Cleanup temp files after stream completes
        await fsp.unlink(inputPath).catch(() => {});
        await fsp.unlink(outputPath).catch(() => {});
      });

      readStream.on('error', async (streamErr) => {
        console.error('Error streaming rendered video:', streamErr);
        await fsp.unlink(inputPath).catch(() => {});
        await fsp.unlink(outputPath).catch(() => {});
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi xử lý render video.';
      console.error('Unified render failed:', err);

      await fsp.unlink(inputPath).catch(() => {});
      await fsp.unlink(outputPath).catch(() => {});

      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          error: 'RENDER_FAILED',
          message: msg,
        });
      }
    }
  }
);
