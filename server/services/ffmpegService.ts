import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execFileAsync = promisify(execFile);

export interface VideoProbeData {
  width: number;
  height: number;
  duration: number;
  fps: number;
  hasAudio: boolean;
  videoCodec: string;
  audioCodec?: string;
  sizeBytes: number;
}

export interface MaskArea {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  width: number; // percentage 0-100
  height: number; // percentage 0-100
}

export interface UnifiedRenderOptions {
  inputPath: string;
  outputPath: string;
  trim?: {
    startSec: number;
    endSec: number;
  };
  watermark?: {
    method: 'delogo' | 'blur' | 'cover';
    area: MaskArea;
    color?: string;
    feather?: number;
  };
  quality?: '1080p' | '720p' | '480p' | 'original';
}

export class ServerFFmpegService {
  private ffmpegBin = process.env.FFMPEG_PATH || 'ffmpeg';
  private ffprobeBin = process.env.FFPROBE_PATH || 'ffprobe';

  /**
   * Probes video metadata using ffprobe with structured JSON output
   */
  async probeVideo(videoPath: string): Promise<VideoProbeData> {
    try {
      const stats = await fs.stat(videoPath);
      const { stdout } = await execFileAsync(this.ffprobeBin, [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        videoPath,
      ]);

      const data = JSON.parse(stdout);
      const videoStream = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'video');
      const audioStream = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'audio');

      let fps = 30;
      if (videoStream?.r_frame_rate) {
        const parts = videoStream.r_frame_rate.split('/');
        if (parts.length === 2 && Number(parts[1]) > 0) {
          fps = Math.round(Number(parts[0]) / Number(parts[1]));
        } else {
          fps = Math.round(Number(parts[0])) || 30;
        }
      }

      const duration = Number(data.format?.duration) || Number(videoStream?.duration) || 0;
      const width = Number(videoStream?.width) || 1280;
      const height = Number(videoStream?.height) || 720;

      return {
        width,
        height,
        duration,
        fps,
        hasAudio: Boolean(audioStream),
        videoCodec: videoStream?.codec_name || 'h264',
        audioCodec: audioStream?.codec_name,
        sizeBytes: stats.size,
      };
    } catch (err) {
      console.error('Error probing video with ffprobe:', err);
      throw new Error('Không thể phân tích metadata video qua FFprobe.');
    }
  }

  /**
   * Generates exact binary mask (black background, white box) with optional feathering
   */
  async generateMask(
    width: number,
    height: number,
    area: MaskArea,
    feather: number,
    outputPath: string
  ): Promise<string> {
    const bx = Math.max(0, Math.round((area.x / 100) * width));
    const by = Math.max(0, Math.round((area.y / 100) * height));
    const bw = Math.min(width - bx, Math.max(2, Math.round((area.width / 100) * width)));
    const bh = Math.min(height - by, Math.max(2, Math.round((area.height / 100) * height)));

    let filter = `drawbox=x=${bx}:y=${by}:w=${bw}:h=${bh}:color=white:t=fill`;
    if (feather > 0) {
      const radius = Math.min(25, Math.max(1, feather));
      filter += `,boxblur=luma_radius=${radius}:luma_power=1`;
    }

    await execFileAsync(this.ffmpegBin, [
      '-f',
      'lavfi',
      '-i',
      `color=c=black:s=${width}x${height}:d=1`,
      '-vf',
      filter,
      '-frames:v',
      '1',
      '-y',
      outputPath,
    ]);

    return outputPath;
  }

  /**
   * Extracts clean original audio track from the video
   */
  async extractAudio(videoPath: string, outputPath: string): Promise<boolean> {
    try {
      // First try stream copy
      await execFileAsync(this.ffmpegBin, [
        '-i',
        videoPath,
        '-vn',
        '-c:a',
        'copy',
        '-y',
        outputPath,
      ]);
      return true;
    } catch {
      try {
        // Fallback to AAC encoding
        await execFileAsync(this.ffmpegBin, [
          '-i',
          videoPath,
          '-vn',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          '-y',
          outputPath,
        ]);
        return true;
      } catch (err) {
        console.warn('Audio extraction failed (video may lack audio stream):', err);
        return false;
      }
    }
  }

  /**
   * Trims a short clip (e.g. 3 seconds) for quick preview
   */
  async trimClip(
    videoPath: string,
    startSec: number,
    durationSec: number,
    outputPath: string
  ): Promise<string> {
    await execFileAsync(this.ffmpegBin, [
      '-ss',
      startSec.toString(),
      '-i',
      videoPath,
      '-t',
      durationSec.toString(),
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '18',
      '-c:a',
      'copy',
      '-avoid_negative_ts',
      'make_zero',
      '-y',
      outputPath,
    ]);
    return outputPath;
  }

  /**
   * Remuxes the original audio track back with the inpainted video
   */
  async remuxAudio(
    videoOnlyPath: string,
    audioPath: string,
    outputPath: string
  ): Promise<string> {
    try {
      await execFileAsync(this.ffmpegBin, [
        '-i',
        videoOnlyPath,
        '-i',
        audioPath,
        '-c:v',
        'copy',
        '-c:a',
        'copy',
        '-shortest',
        '-movflags',
        '+faststart',
        '-y',
        outputPath,
      ]);
      return outputPath;
    } catch {
      // If stream copy fails, re-encode audio to AAC
      await execFileAsync(this.ffmpegBin, [
        '-i',
        videoOnlyPath,
        '-i',
        audioPath,
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-shortest',
        '-movflags',
        '+faststart',
        '-y',
        outputPath,
      ]);
      return outputPath;
    }
  }

  /**
   * Safely removes a file if it exists
   */
  async cleanupFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch {
      // Ignore if already deleted
    }
  }

  /**
   * Unified single-pass render:
   * Combines accurate trim, watermark removal (delogo/blur/cover), and resolution scaling
   * into a single ffmpeg invocation, preserving lossless original audio.
   */
  async renderUnified(
    options: UnifiedRenderOptions
  ): Promise<{
    outputPath: string;
    reencodeStatus: 'stream_copied' | 'reencoded';
    engineUsed: string;
    duration: number;
    sizeBytes: number;
    metadata: VideoProbeData;
  }> {
    const { inputPath, outputPath, trim, watermark, quality = 'original' } = options;
    const probe = await this.probeVideo(inputPath);
    const width = probe.width;
    const height = probe.height;

    // Check if we can do instant stream copy (only trim, no watermark, original quality)
    const canStreamCopy = !watermark && quality === 'original' && trim !== undefined;

    if (canStreamCopy) {
      const args: string[] = [];
      if (trim.startSec > 0) {
        args.push('-ss', trim.startSec.toString());
      }
      if (trim.endSec < probe.duration) {
        args.push('-to', trim.endSec.toString());
      }
      args.push('-i', inputPath, '-c', 'copy', '-avoid_negative_ts', 'make_zero', '-y', outputPath);

      await execFileAsync(this.ffmpegBin, args);
      const outStats = await fs.stat(outputPath);
      const outProbe = await this.probeVideo(outputPath).catch(() => ({
        ...probe,
        duration: (trim?.endSec ?? probe.duration) - (trim?.startSec ?? 0),
        sizeBytes: outStats.size,
      }));

      return {
        outputPath,
        reencodeStatus: 'stream_copied',
        engineUsed: 'native_ffmpeg',
        duration: outProbe.duration,
        sizeBytes: outStats.size,
        metadata: outProbe,
      };
    }

    // Otherwise, single-pass re-encode with high visual fidelity
    const args: string[] = [];
    if (trim && trim.startSec > 0) {
      args.push('-ss', trim.startSec.toString());
    }
    if (trim && trim.endSec < probe.duration) {
      args.push('-to', trim.endSec.toString());
    }
    args.push('-i', inputPath);

    // Build filter chain
    const filters: string[] = [];

    if (watermark) {
      const area = watermark.area;
      const rawBx = Math.round((area.x / 100) * width);
      const rawBy = Math.round((area.y / 100) * height);
      const rawBw = Math.round((area.width / 100) * width);
      const rawBh = Math.round((area.height / 100) * height);

      // Clamp coordinates ensuring at least 2px margins from edges for delogo to interpolate cleanly
      const bx = Math.max(2, Math.min(width - 6, rawBx));
      const by = Math.max(2, Math.min(height - 6, rawBy));
      const bw = Math.max(4, Math.min(width - bx - 2, rawBw));
      const bh = Math.max(4, Math.min(height - by - 2, rawBh));

      if (watermark.method === 'cover') {
        const hexColor = watermark.color || '#020617';
        filters.push(`drawbox=x=${bx}:y=${by}:w=${bw}:h=${bh}:color=${hexColor}:t=fill`);
      } else {
        // 'delogo' and 'blur': use FFmpeg delogo interpolation for flawless artifact-free removal
        filters.push(`delogo=x=${bx}:y=${by}:w=${bw}:h=${bh}`);
      }
    }

    // Quality scaling if requested
    if (quality === '720p') {
      filters.push('scale=-2:720');
    } else if (quality === '1080p') {
      filters.push('scale=-2:1080');
    } else if (quality === '480p') {
      filters.push('scale=-2:480');
    }

    if (filters.length > 0) {
      args.push('-vf', filters.join(','));
    }

    // Video encoding: H.264 CRF 18, fast preset, lossless audio copy
    args.push(
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'copy',
      '-movflags',
      '+faststart',
      '-y',
      outputPath
    );

    try {
      await execFileAsync(this.ffmpegBin, args);
    } catch (encErr) {
      console.warn('Unified render with audio copy failed, retrying with AAC audio encode...', encErr);
      const aacArgs = args.map((arg) => (arg === 'copy' ? 'aac' : arg));
      const aacIndex = aacArgs.indexOf('aac');
      if (aacIndex !== -1) {
        aacArgs.splice(aacIndex + 1, 0, '-b:a', '192k');
      }
      await execFileAsync(this.ffmpegBin, aacArgs);
    }

    const outStats = await fs.stat(outputPath);
    const outProbe = await this.probeVideo(outputPath).catch(() => ({
      ...probe,
      duration: (trim?.endSec ?? probe.duration) - (trim?.startSec ?? 0),
      sizeBytes: outStats.size,
    }));

    return {
      outputPath,
      reencodeStatus: 'reencoded',
      engineUsed: 'native_ffmpeg',
      duration: outProbe.duration,
      sizeBytes: outStats.size,
      metadata: outProbe,
    };
  }

  /**
   * Recursively removes a directory
   */
  async cleanupDir(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  }
}

export const serverFFmpegService = new ServerFFmpegService();
