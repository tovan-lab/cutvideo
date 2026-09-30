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

/**
 * Endpoint for high-speed server FFmpeg Video Merging with Transitions (xfade)
 */
videoRouter.post(
  '/merge',
  diskUpload.array('videos', 25),
  async (req: Request, res: Response) => {
    const uploadedFiles = req.files as Express.Multer.File[];
    if (!uploadedFiles || uploadedFiles.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'NEED_AT_LEAST_2_VIDEOS',
        message: 'Cần tối thiểu 2 video để thực hiện ghép.',
      });
    }

    const inputPaths = uploadedFiles.map((f) => f.path);
    const outputPath = path.join(tempDir, `merged_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`);

    try {
      const optionsRaw = req.body.options;
      const options = optionsRaw ? JSON.parse(optionsRaw) : {};

      const result = await serverFFmpegService.mergeVideosWithTransitions({
        inputPaths,
        outputPath,
        transitions: options.transitions,
        autoTransitions: Boolean(options.autoTransitions),
        quality: options.quality || 'original',
      });

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('X-Duration', result.duration.toString());
      res.setHeader('X-Size-Bytes', result.sizeBytes.toString());

      const readStream = fs.createReadStream(result.outputPath);
      readStream.pipe(res);

      readStream.on('close', async () => {
        for (const ip of inputPaths) {
          await fsp.unlink(ip).catch(() => {});
        }
        await fsp.unlink(outputPath).catch(() => {});
      });

      readStream.on('error', async (streamErr) => {
        console.error('Error streaming merged video:', streamErr);
        for (const ip of inputPaths) {
          await fsp.unlink(ip).catch(() => {});
        }
        await fsp.unlink(outputPath).catch(() => {});
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi xử lý ghép video.';
      console.error('Video merge failed:', err);

      for (const ip of inputPaths) {
        await fsp.unlink(ip).catch(() => {});
      }
      await fsp.unlink(outputPath).catch(() => {});

      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          error: 'MERGE_FAILED',
          message: msg,
        });
      }
    }
  }
);

/**
 * Endpoint for high-speed server FFmpeg Text Overlay rendering
 */
videoRouter.post(
  '/render-text',
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
    const outputPath = path.join(tempDir, `text_rendered_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`);

    try {
      const optionsRaw = req.body.options;
      const options = optionsRaw ? JSON.parse(optionsRaw) : {};

      const result = await serverFFmpegService.renderTextOverlay({
        inputPath,
        outputPath,
        textItems: options.textItems || [],
        quality: options.quality || 'original',
      });

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('X-Duration', result.duration.toString());
      res.setHeader('X-Size-Bytes', result.sizeBytes.toString());

      const readStream = fs.createReadStream(result.outputPath);
      readStream.pipe(res);

      readStream.on('close', async () => {
        await fsp.unlink(inputPath).catch(() => {});
        await fsp.unlink(outputPath).catch(() => {});
      });

      readStream.on('error', async (streamErr) => {
        console.error('Error streaming text-overlaid video:', streamErr);
        await fsp.unlink(inputPath).catch(() => {});
        await fsp.unlink(outputPath).catch(() => {});
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi xử lý thêm chữ vào video.';
      console.error('Text overlay render failed:', err);

      await fsp.unlink(inputPath).catch(() => {});
      await fsp.unlink(outputPath).catch(() => {});

      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          error: 'RENDER_TEXT_FAILED',
          message: msg,
        });
      }
    }
  }
);

/**
 * ALL-IN-ONE SINGLE-PASS EXPORT ENDPOINT:
 * Merges clips (with transitions) + Trims + Removes Watermark + Overlays Texts in 1 single pass!
 */
videoRouter.post(
  '/render-all-in-one',
  diskUpload.array('videos', 25),
  async (req: Request, res: Response) => {
    const uploadedFiles = req.files as Express.Multer.File[];
    if (!uploadedFiles || uploadedFiles.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'NO_VIDEO_PROVIDED',
        message: 'Vui lòng tải lên ít nhất một video.',
      });
    }

    const inputPaths = uploadedFiles.map((f) => f.path);
    const outputPath = path.join(
      tempDir,
      `all_in_one_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`
    );

    try {
      const optionsRaw = req.body.options;
      const options = optionsRaw ? JSON.parse(optionsRaw) : {};

      const result = await serverFFmpegService.renderAllInOne({
        inputPaths,
        outputPath,
        trim: options.trim,
        clipTrims: options.clipTrims,
        watermark: options.watermark,
        textItems: options.textItems,
        merge: options.merge,
        quality: options.quality || 'original',
      });

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('X-Duration', result.duration.toString());
      res.setHeader('X-Size-Bytes', result.sizeBytes.toString());
      res.setHeader('Content-Disposition', 'attachment; filename="video_all_in_one.mp4"');

      const readStream = fs.createReadStream(result.outputPath);
      readStream.pipe(res);

      readStream.on('close', async () => {
        for (const ip of inputPaths) {
          await fsp.unlink(ip).catch(() => {});
        }
        await fsp.unlink(outputPath).catch(() => {});
      });

      readStream.on('error', async (streamErr) => {
        console.error('Error streaming all-in-one video:', streamErr);
        for (const ip of inputPaths) {
          await fsp.unlink(ip).catch(() => {});
        }
        await fsp.unlink(outputPath).catch(() => {});
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi xử lý xuất video trọn gói All-in-One.';
      console.error('All-in-one render failed:', err);

      for (const ip of inputPaths) {
        await fsp.unlink(ip).catch(() => {});
      }
      await fsp.unlink(outputPath).catch(() => {});

      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          error: 'ALL_IN_ONE_RENDER_FAILED',
          message: msg,
        });
      }
    }
  }
);
