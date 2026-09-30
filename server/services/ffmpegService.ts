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

export interface ServerTransition {
  type: string;
  duration: number;
}

export interface ServerMergeOptions {
  inputPaths: string[];
  outputPath: string;
  transitions?: ServerTransition[];
  autoTransitions?: boolean;
  quality?: '1080p' | '720p' | '480p' | 'original';
}

export interface ServerTextItem {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  fullDuration?: boolean;
  fontFamily?: string;
  fontSize?: number;
  isBold?: boolean;
  isItalic?: boolean;
  isUppercase?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  textColor?: string;
  opacity?: number;
  boxEnabled?: boolean;
  boxColor?: string;
  boxOpacity?: number;
  boxPadding?: number;
  strokeEnabled?: boolean;
  strokeColor?: string;
  strokeWidth?: number;
  shadowEnabled?: boolean;
  shadowColor?: string;
  positionPreset?: string;
  x?: number;
  y?: number;
  animation?: 'none' | 'fade' | 'slide_up' | 'slide_left' | 'zoom_in' | 'bounce' | 'typewriter';
  animationDuration?: number;
}

export interface ServerTextOverlayOptions {
  inputPath: string;
  outputPath: string;
  textItems: ServerTextItem[];
  quality?: '1080p' | '720p' | '480p' | 'original';
}

export interface ServerAllInOneOptions {
  inputPaths: string[];
  outputPath: string;
  trim?: {
    enabled: boolean;
    startSec: number;
    endSec: number;
  };
  clipTrims?: Array<{
    clipIndex: number;
    startSec: number;
    endSec: number;
  }>;
  watermark?: {
    enabled: boolean;
    method: 'delogo' | 'blur' | 'cover';
    area: MaskArea;
    color?: string;
    feather?: number;
    targetClipIndex?: number | 'all';
    timeRange?: {
      startSec: number;
      endSec: number;
    };
  };
  textItems?: ServerTextItem[];
  merge?: {
    enabled: boolean;
    transitions?: ServerTransition[];
    autoTransitions?: boolean;
    defaultTransition?: string;
    transitionDuration?: number;
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
   * Merges multiple videos with cinematic transitions (xfade + acrossfade) or auto-smooth transitions.
   * Auto-normalizes frame rates, dimensions, and audio channels.
   */
  async mergeVideosWithTransitions(
    options: ServerMergeOptions
  ): Promise<{
    outputPath: string;
    duration: number;
    sizeBytes: number;
    metadata: VideoProbeData;
  }> {
    const { inputPaths, outputPath, transitions = [], autoTransitions = false, quality = 'original' } = options;
    if (inputPaths.length === 0) {
      throw new Error('Không có video nào để ghép.');
    }
    if (inputPaths.length === 1) {
      await execFileAsync(this.ffmpegBin, ['-i', inputPaths[0], '-c', 'copy', '-y', outputPath]);
      const stats = await fs.stat(outputPath);
      const probe = await this.probeVideo(outputPath);
      return { outputPath, duration: probe.duration, sizeBytes: stats.size, metadata: probe };
    }

    // 1. Probe all input videos
    const probes: VideoProbeData[] = [];
    for (const p of inputPaths) {
      probes.push(await this.probeVideo(p));
    }

    // Determine target dimensions
    const isPortrait = probes[0].height > probes[0].width;
    let targetWidth = probes[0].width;
    let targetHeight = probes[0].height;

    if (quality === '1080p') {
      targetWidth = isPortrait ? 1080 : 1920;
      targetHeight = isPortrait ? 1920 : 1080;
    } else if (quality === '720p') {
      targetWidth = isPortrait ? 720 : 1280;
      targetHeight = isPortrait ? 1280 : 720;
    } else if (quality === '480p') {
      targetWidth = isPortrait ? 480 : 854;
      targetHeight = isPortrait ? 854 : 480;
    }
    targetWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
    targetHeight = targetHeight % 2 === 0 ? targetHeight : targetHeight - 1;

    // Transition styles pool for auto smart transitions
    const autoPool = ['smoothleft', 'dissolve', 'fade', 'smoothright', 'zoomin', 'fadeblack'];

    // 2. Build input arguments and complex filtergraph
    const args: string[] = [];
    const filterComplex: string[] = [];

    // Add inputs
    for (let i = 0; i < inputPaths.length; i++) {
      args.push('-i', inputPaths[i]);
    }

    // Video streams pre-processing: scale to fit box with black padding, set fps=30, sar=1
    for (let i = 0; i < inputPaths.length; i++) {
      filterComplex.push(
        `[${i}:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}]`
      );
    }

    // Audio streams pre-processing: ensure 48kHz stereo, generate silence if video has no audio
    for (let i = 0; i < inputPaths.length; i++) {
      if (probes[i].hasAudio) {
        filterComplex.push(`[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,aresample=async=1[a${i}]`);
      } else {
        const d = probes[i].duration || 5;
        filterComplex.push(`anullsrc=channel_layout=stereo:sample_rate=48000:d=${d}[a${i}]`);
      }
    }

    // 3. Chain xfade and acrossfade
    let currentOffset = 0;
    let lastVideoLabel = 'v0';
    let lastAudioLabel = 'a0';

    for (let i = 1; i < inputPaths.length; i++) {
      const prevDuration = probes[i - 1].duration || 5;
      const nextDuration = probes[i].duration || 5;

      let transType = 'fade';
      let transDur = 0.75;

      if (autoTransitions) {
        transType = autoPool[(i - 1) % autoPool.length];
        transDur = 0.75;
      } else if (transitions[i - 1]) {
        transType = transitions[i - 1].type || 'fade';
        transDur = transitions[i - 1].duration || 0.75;
      }

      if (transType === 'none') {
        transType = 'fade';
        transDur = 0.01;
      }

      transDur = Math.max(0.01, Math.min(transDur, prevDuration / 2, nextDuration / 2, 2.0));

      if (i === 1) {
        currentOffset = prevDuration - transDur;
      } else {
        currentOffset = currentOffset + prevDuration - transDur;
      }
      currentOffset = Math.max(0.1, Number(currentOffset.toFixed(2)));

      const outV = i === inputPaths.length - 1 ? 'outv' : `vx${i}`;
      const outA = i === inputPaths.length - 1 ? 'outa' : `ax${i}`;

      filterComplex.push(
        `[${lastVideoLabel}][v${i}]xfade=transition=${transType}:duration=${transDur}:offset=${currentOffset}[${outV}]`
      );
      filterComplex.push(
        `[${lastAudioLabel}][a${i}]acrossfade=d=${transDur}:c1=tri:c2=tri[${outA}]`
      );

      lastVideoLabel = outV;
      lastAudioLabel = outA;
    }

    args.push(
      '-filter_complex',
      filterComplex.join(';'),
      '-map',
      '[outv]',
      '-map',
      '[outa]',
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '19',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      '-y',
      outputPath
    );

    await execFileAsync(this.ffmpegBin, args);
    const outStats = await fs.stat(outputPath);
    const outProbe = await this.probeVideo(outputPath);

    return {
      outputPath,
      duration: outProbe.duration,
      sizeBytes: outStats.size,
      metadata: outProbe,
    };
  }

  /**
   * Renders multiple professional text overlays with custom font, colors, opacity, boxes, strokes, shadows, and animations.
   */
  async renderTextOverlay(
    options: ServerTextOverlayOptions
  ): Promise<{
    outputPath: string;
    duration: number;
    sizeBytes: number;
    metadata: VideoProbeData;
  }> {
    const { inputPath, outputPath, textItems, quality = 'original' } = options;
    const probe = await this.probeVideo(inputPath);
    const width = probe.width;
    const height = probe.height;

    if (!textItems || textItems.length === 0) {
      await execFileAsync(this.ffmpegBin, ['-i', inputPath, '-c', 'copy', '-y', outputPath]);
      const stats = await fs.stat(outputPath);
      return { outputPath, duration: probe.duration, sizeBytes: stats.size, metadata: probe };
    }

    const tempFilesToClean: string[] = [];
    const filters: string[] = [];

    if (quality === '720p') {
      filters.push('scale=-2:720');
    } else if (quality === '1080p') {
      filters.push('scale=-2:1080');
    } else if (quality === '480p') {
      filters.push('scale=-2:480');
    }

    const fontLookup: Record<string, string> = {
      Arial: 'C\\:/Windows/Fonts/arial.ttf',
      Montserrat: 'C\\:/Windows/Fonts/arialbd.ttf',
      'Bebas Neue': 'C\\:/Windows/Fonts/impact.ttf',
      'Playfair Display': 'C\\:/Windows/Fonts/timesbd.ttf',
      'Be Vietnam Pro': 'C\\:/Windows/Fonts/segoeui.ttf',
      Roboto: 'C\\:/Windows/Fonts/segoeui.ttf',
      Inter: 'C\\:/Windows/Fonts/arial.ttf',
      Oswald: 'C\\:/Windows/Fonts/impact.ttf',
      Caveat: 'C\\:/Windows/Fonts/segoepr.ttf',
    };

    for (let i = 0; i < textItems.length; i++) {
      const item = textItems[i];
      if (!item.text || !item.text.trim()) continue;

      const tempTextPath = path.join(path.dirname(outputPath), `text_${Date.now()}_${i}.txt`);
      await fs.writeFile(tempTextPath, item.text, { encoding: 'utf8' });
      tempFilesToClean.push(tempTextPath);

      const escapedTextFile = tempTextPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      const fontFile = fontLookup[item.fontFamily || ''] || 'C\\:/Windows/Fonts/arialbd.ttf';
      const baseFontSize = item.fontSize || 36;
      const opacity = (item.opacity ?? 100) / 100;
      const hexColor = (item.textColor || '#ffffff').replace('#', '0x');

      let xExpr = '(w-text_w)/2';
      let yExpr = 'h-text_h-50';

      if (item.positionPreset === 'top') {
        yExpr = 'h*0.08';
      } else if (item.positionPreset === 'center') {
        yExpr = '(h-text_h)/2';
      } else if (item.positionPreset === 'lower_third') {
        yExpr = 'h*0.75';
      } else if (item.positionPreset === 'bottom') {
        yExpr = 'h-text_h-50';
      } else if (item.positionPreset === 'custom' || (item.x !== undefined && item.y !== undefined)) {
        const px = Math.round(((item.x ?? 50) / 100) * width);
        const py = Math.round(((item.y ?? 80) / 100) * height);
        xExpr = `${px}-(text_w/2)`;
        yExpr = `${py}-(text_h/2)`;
      }

      const startT = Math.max(0, item.startTime || 0);
      const endT = item.fullDuration ? probe.duration : Math.min(probe.duration, item.endTime || probe.duration);
      const animDur = item.animationDuration || 0.4;

      let alphaExpr = `${opacity}`;
      let dynamicX = xExpr;
      let dynamicY = yExpr;
      let dynamicSize = `${baseFontSize}`;

      if (item.animation === 'fade') {
        alphaExpr = `if(lt(t\\,${startT}+${animDur})\\, (t-${startT})/${animDur}\\, if(gt(t\\,${endT}-${animDur})\\, (${endT}-t)/${animDur}\\, 1)) * ${opacity}`;
      } else if (item.animation === 'slide_up') {
        dynamicY = `if(lt(t\\,${startT}+${animDur})\\, (${yExpr}) + (1-(t-${startT})/${animDur})*80\\, ${yExpr})`;
      } else if (item.animation === 'slide_left') {
        dynamicX = `if(lt(t\\,${startT}+${animDur})\\, (${xExpr}) + (1-(t-${startT})/${animDur})*120\\, ${xExpr})`;
      } else if (item.animation === 'zoom_in') {
        dynamicSize = `if(lt(t\\,${startT}+${animDur})\\, ${baseFontSize}*(0.6 + 0.4*(t-${startT})/${animDur})\\, ${baseFontSize})`;
      }

      const drawParts: string[] = [
        `fontfile='${fontFile}'`,
        `textfile='${escapedTextFile}'`,
        `fontsize=${dynamicSize}`,
        `fontcolor=${hexColor}`,
        `alpha='${alphaExpr}'`,
        `x=${dynamicX}`,
        `y=${dynamicY}`,
      ];

      if (item.boxEnabled) {
        const boxColor = (item.boxColor || '#000000').replace('#', '0x');
        const boxAlpha = (item.boxOpacity ?? 80) / 100;
        const boxPad = item.boxPadding || 10;
        drawParts.push(`box=1`, `boxcolor=${boxColor}@${boxAlpha}`, `boxborderw=${boxPad}`);
      }

      if (item.strokeEnabled) {
        const strokeColor = (item.strokeColor || '#000000').replace('#', '0x');
        const strokeW = item.strokeWidth || 3;
        drawParts.push(`borderw=${strokeW}`, `bordercolor=${strokeColor}`);
      }

      if (item.shadowEnabled) {
        const shadowColor = (item.shadowColor || '#000000').replace('#', '0x');
        drawParts.push(`shadowx=2`, `shadowy=2`, `shadowcolor=${shadowColor}@0.6`);
      }

      if (!item.fullDuration) {
        drawParts.push(`enable='between(t\\,${startT}\\,${endT})'`);
      }

      filters.push(`drawtext=${drawParts.join(':')}`);
    }

    const args: string[] = ['-i', inputPath];
    if (filters.length > 0) {
      args.push('-vf', filters.join(','));
    }

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
      console.warn('Text overlay with audio copy failed, retrying with AAC...', encErr);
      const aacArgs = args.map((a) => (a === 'copy' ? 'aac' : a));
      const idx = aacArgs.indexOf('aac');
      if (idx !== -1) {
        aacArgs.splice(idx + 1, 0, '-b:a', '192k');
      }
      await execFileAsync(this.ffmpegBin, aacArgs);
    } finally {
      for (const tf of tempFilesToClean) {
        await fs.unlink(tf).catch(() => {});
      }
    }

    const outStats = await fs.stat(outputPath);
    const outProbe = await this.probeVideo(outputPath).catch(() => probe);

    return {
      outputPath,
      duration: outProbe.duration,
      sizeBytes: outStats.size,
      metadata: outProbe,
    };
  }

  /**
   * ALL-IN-ONE SINGLE-PASS RENDER:
   * Combines Trim + Watermark Removal + Video Merging (with transitions) + Text Overlays
   * in a single unified FFmpeg execution with maximum speed and visual fidelity.
   */
  async renderAllInOne(
    options: ServerAllInOneOptions
  ): Promise<{
    outputPath: string;
    duration: number;
    sizeBytes: number;
    metadata: VideoProbeData;
  }> {
    const {
      inputPaths,
      outputPath,
      trim,
      clipTrims,
      watermark,
      textItems = [],
      merge,
      quality = 'original',
    } = options;

    if (!inputPaths || inputPaths.length === 0) {
      throw new Error('Không có video đầu vào.');
    }

    const tempFilesToClean: string[] = [];
    const isMergeActive = Boolean(merge?.enabled && inputPaths.length > 1);

    const fontLookup: Record<string, string> = {
      Arial: 'C\\:/Windows/Fonts/arial.ttf',
      Montserrat: 'C\\:/Windows/Fonts/arialbd.ttf',
      'Bebas Neue': 'C\\:/Windows/Fonts/impact.ttf',
      'Playfair Display': 'C\\:/Windows/Fonts/timesbd.ttf',
      'Be Vietnam Pro': 'C\\:/Windows/Fonts/segoeui.ttf',
      Roboto: 'C\\:/Windows/Fonts/segoeui.ttf',
      Inter: 'C\\:/Windows/Fonts/arial.ttf',
      Oswald: 'C\\:/Windows/Fonts/impact.ttf',
      Caveat: 'C\\:/Windows/Fonts/segoepr.ttf',
    };

    const buildTextFilters = async (w: number, h: number, dur: number) => {
      const filters: string[] = [];
      for (let i = 0; i < textItems.length; i++) {
        const item = textItems[i];
        if (!item.text || !item.text.trim()) continue;

        const tempTextPath = path.join(path.dirname(outputPath), `aio_text_${Date.now()}_${i}.txt`);
        await fs.writeFile(tempTextPath, item.text, { encoding: 'utf8' });
        tempFilesToClean.push(tempTextPath);

        const escapedTextFile = tempTextPath.replace(/\\/g, '/').replace(/:/g, '\\:');
        const fontFile = fontLookup[item.fontFamily || ''] || 'C\\:/Windows/Fonts/arialbd.ttf';
        const baseFontSize = item.fontSize || 32;
        const opacity = (item.opacity ?? 100) / 100;
        const hexColor = (item.textColor || '#ffffff').replace('#', '0x');

        let xExpr = '(w-text_w)/2';
        let yExpr = 'h-text_h-50';

        if (item.positionPreset === 'top') {
          yExpr = 'h*0.08';
        } else if (item.positionPreset === 'center') {
          yExpr = '(h-text_h)/2';
        } else if (item.positionPreset === 'lower_third') {
          yExpr = 'h*0.75';
        } else if (item.positionPreset === 'bottom') {
          yExpr = 'h-text_h-50';
        } else if (item.positionPreset === 'custom' || (item.x !== undefined && item.y !== undefined)) {
          const px = Math.round(((item.x ?? 50) / 100) * w);
          const py = Math.round(((item.y ?? 80) / 100) * h);
          xExpr = `${px}-(text_w/2)`;
          yExpr = `${py}-(text_h/2)`;
        }

        const startT = Math.max(0, item.startTime || 0);
        const endT = item.fullDuration ? dur : Math.min(dur, item.endTime || dur);
        const animDur = item.animationDuration || 0.4;

        let alphaExpr = `${opacity}`;
        let dynamicX = xExpr;
        let dynamicY = yExpr;
        let dynamicSize = `${baseFontSize}`;

        if (item.animation === 'fade') {
          alphaExpr = `if(lt(t\\,${startT}+${animDur})\\, (t-${startT})/${animDur}\\, if(gt(t\\,${endT}-${animDur})\\, (${endT}-t)/${animDur}\\, 1)) * ${opacity}`;
        } else if (item.animation === 'slide_up') {
          dynamicY = `if(lt(t\\,${startT}+${animDur})\\, (${yExpr}) + (1-(t-${startT})/${animDur})*80\\, ${yExpr})`;
        } else if (item.animation === 'slide_left') {
          dynamicX = `if(lt(t\\,${startT}+${animDur})\\, (${xExpr}) + (1-(t-${startT})/${animDur})*120\\, ${xExpr})`;
        } else if (item.animation === 'zoom_in') {
          dynamicSize = `if(lt(t\\,${startT}+${animDur})\\, ${baseFontSize}*(0.6 + 0.4*(t-${startT})/${animDur})\\, ${baseFontSize})`;
        }

        const drawParts: string[] = [
          `fontfile='${fontFile}'`,
          `textfile='${escapedTextFile}'`,
          `fontsize=${dynamicSize}`,
          `fontcolor=${hexColor}`,
          `alpha='${alphaExpr}'`,
          `x=${dynamicX}`,
          `y=${dynamicY}`,
        ];

        if (item.boxEnabled) {
          const boxColor = (item.boxColor || '#000000').replace('#', '0x');
          const boxAlpha = (item.boxOpacity ?? 80) / 100;
          const boxPad = item.boxPadding || 8;
          drawParts.push(`box=1`, `boxcolor=${boxColor}@${boxAlpha}`, `boxborderw=${boxPad}`);
        }

        if (item.strokeEnabled) {
          const strokeColor = (item.strokeColor || '#000000').replace('#', '0x');
          const strokeW = item.strokeWidth || 3;
          drawParts.push(`borderw=${strokeW}`, `bordercolor=${strokeColor}`);
        }

        if (item.shadowEnabled) {
          const shadowColor = (item.shadowColor || '#000000').replace('#', '0x');
          drawParts.push(`shadowx=2`, `shadowy=2`, `shadowcolor=${shadowColor}@0.6`);
        }

        if (!item.fullDuration) {
          drawParts.push(`enable='between(t\\,${startT}\\,${endT})'`);
        }

        filters.push(`drawtext=${drawParts.join(':')}`);
      }
      return filters;
    };

    const buildWatermarkFilter = (
      w: number,
      h: number,
      timeConstraint?: { startSec: number; endSec: number }
    ) => {
      if (!watermark || watermark.enabled === false) return null;
      const area = watermark.area;
      const rawBx = Math.round((area.x / 100) * w);
      const rawBy = Math.round((area.y / 100) * h);
      const rawBw = Math.round((area.width / 100) * w);
      const rawBh = Math.round((area.height / 100) * h);

      const bx = Math.max(2, Math.min(w - 6, rawBx));
      const by = Math.max(2, Math.min(h - 6, rawBy));
      const bw = Math.max(4, Math.min(w - bx - 2, rawBw));
      const bh = Math.max(4, Math.min(h - by - 2, rawBh));

      let enableClause = '';
      if (
        timeConstraint &&
        (timeConstraint.startSec > 0 || (timeConstraint.endSec > 0 && timeConstraint.endSec < 999999))
      ) {
        enableClause = `:enable='between(t\\,${timeConstraint.startSec.toFixed(2)}\\,${timeConstraint.endSec.toFixed(2)})'`;
      }

      if (watermark.method === 'cover') {
        const hex = watermark.color || '#020617';
        return `drawbox=x=${bx}:y=${by}:w=${bw}:h=${bh}:color=${hex}:t=fill${enableClause}`;
      }
      return `delogo=x=${bx}:y=${by}:w=${bw}:h=${bh}${enableClause}`;
    };

    try {
      if (isMergeActive) {
        const probes: VideoProbeData[] = [];
        for (const p of inputPaths) {
          probes.push(await this.probeVideo(p));
        }

        const isPortrait = probes[0].height > probes[0].width;
        let targetWidth = probes[0].width;
        let targetHeight = probes[0].height;

        if (quality === '1080p') {
          targetWidth = isPortrait ? 1080 : 1920;
          targetHeight = isPortrait ? 1920 : 1080;
        } else if (quality === '720p') {
          targetWidth = isPortrait ? 720 : 1280;
          targetHeight = isPortrait ? 1280 : 720;
        } else if (quality === '480p') {
          targetWidth = isPortrait ? 480 : 854;
          targetHeight = isPortrait ? 854 : 480;
        }
        targetWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
        targetHeight = targetHeight % 2 === 0 ? targetHeight : targetHeight - 1;

        const autoPool = ['smoothleft', 'dissolve', 'fade', 'smoothright', 'zoomin', 'fadeblack', 'circlecrop', 'wipeleft'];
        const args: string[] = [];
        const filterComplex: string[] = [];

        for (let i = 0; i < inputPaths.length; i++) {
          const cTrim = clipTrims?.find((ct) => ct.clipIndex === i);
          if (cTrim && cTrim.endSec > cTrim.startSec) {
            probes[i].duration = cTrim.endSec - cTrim.startSec;
            args.push('-ss', cTrim.startSec.toString(), '-to', cTrim.endSec.toString());
          }
          args.push('-i', inputPaths[i]);
          filterComplex.push(
            `[${i}:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}]`
          );
          if (probes[i].hasAudio) {
            filterComplex.push(`[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,aresample=async=1[a${i}]`);
          } else {
            const d = probes[i].duration || 5;
            filterComplex.push(`anullsrc=channel_layout=stereo:sample_rate=48000:d=${d}[a${i}]`);
          }
        }

        let currentOffset = 0;
        let lastVideoLabel = 'v0';
        let lastAudioLabel = 'a0';
        let totalEstDuration = probes[0].duration || 5;
        const clipOffsets: number[] = [0];

        for (let i = 1; i < inputPaths.length; i++) {
          const prevDuration = probes[i - 1].duration || 5;
          const nextDuration = probes[i].duration || 5;
          let transType = 'fade';
          let transDur = merge?.transitionDuration || 0.75;

          if (merge?.autoTransitions) {
            transType = autoPool[(i - 1) % autoPool.length];
            transDur = 0.75;
          } else if (merge?.transitions && merge.transitions[i - 1]) {
            transType = merge.transitions[i - 1].type || 'fade';
            transDur = merge.transitions[i - 1].duration || transDur;
          } else if (merge?.defaultTransition) {
            transType = merge.defaultTransition;
          }

          if (transType === 'none') {
            transType = 'fade';
            transDur = 0.01;
          }

          transDur = Math.max(0.01, Math.min(transDur, prevDuration / 2, nextDuration / 2, 2.0));
          if (i === 1) {
            currentOffset = prevDuration - transDur;
          } else {
            currentOffset = currentOffset + prevDuration - transDur;
          }
          currentOffset = Math.max(0.1, Number(currentOffset.toFixed(2)));
          clipOffsets.push(currentOffset);
          totalEstDuration = currentOffset + nextDuration;

          const outV = `vm${i}`;
          const outA = `am${i}`;

          filterComplex.push(
            `[${lastVideoLabel}][v${i}]xfade=transition=${transType}:duration=${transDur}:offset=${currentOffset}[${outV}]`
          );
          filterComplex.push(
            `[${lastAudioLabel}][a${i}]acrossfade=d=${transDur}:c1=tri:c2=tri[${outA}]`
          );

          lastVideoLabel = outV;
          lastAudioLabel = outA;
        }

        // Determine watermark time constraint in merged timeline
        let wmTimeConstraint: { startSec: number; endSec: number } | undefined = undefined;
        if (watermark && watermark.enabled !== false) {
          if (watermark.targetClipIndex !== undefined && watermark.targetClipIndex !== 'all') {
            const k = Math.max(0, Math.min(inputPaths.length - 1, Number(watermark.targetClipIndex)));
            const cStart = clipOffsets[k] || 0;
            const cDur = probes[k].duration || 5;
            const cEnd = k === inputPaths.length - 1 ? totalEstDuration : ((clipOffsets[k + 1] || totalEstDuration) + 0.75);

            if (watermark.timeRange && (watermark.timeRange.startSec > 0 || watermark.timeRange.endSec > 0)) {
              const rStart = cStart + (watermark.timeRange.startSec || 0);
              const rEnd = watermark.timeRange.endSec ? (cStart + watermark.timeRange.endSec) : cEnd;
              wmTimeConstraint = { startSec: rStart, endSec: Math.min(cEnd, rEnd) };
            } else {
              wmTimeConstraint = { startSec: cStart, endSec: cEnd };
            }
          } else if (watermark.timeRange && (watermark.timeRange.startSec > 0 || watermark.timeRange.endSec > 0)) {
            wmTimeConstraint = {
              startSec: watermark.timeRange.startSec,
              endSec: watermark.timeRange.endSec || totalEstDuration,
            };
          }
        }

        const postFilters: string[] = [];
        const wmFilter = buildWatermarkFilter(targetWidth, targetHeight, wmTimeConstraint);
        if (wmFilter) {
          postFilters.push(wmFilter);
        }

        const txtFilters = await buildTextFilters(targetWidth, targetHeight, totalEstDuration);
        postFilters.push(...txtFilters);

        if (postFilters.length > 0) {
          filterComplex.push(`[${lastVideoLabel}]${postFilters.join(',')}[outv]`);
        } else {
          filterComplex.push(`[${lastVideoLabel}]copy[outv]`);
        }

        args.push(
          '-filter_complex',
          filterComplex.join(';'),
          '-map',
          '[outv]',
          '-map',
          `[${lastAudioLabel}]`,
          '-c:v',
          'libx264',
          '-preset',
          'fast',
          '-crf',
          '19',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          '-movflags',
          '+faststart',
          '-y',
          outputPath
        );

        await execFileAsync(this.ffmpegBin, args);
      } else {
        const inputPath = inputPaths[0];
        const probe = await this.probeVideo(inputPath);
        const width = probe.width;
        const height = probe.height;

        const args: string[] = [];
        if (trim?.enabled && trim.startSec > 0) {
          args.push('-ss', trim.startSec.toString());
        }
        if (trim?.enabled && trim.endSec < probe.duration) {
          args.push('-to', trim.endSec.toString());
        }
        args.push('-i', inputPath);

        const effDuration = (trim?.enabled ? trim.endSec - trim.startSec : probe.duration) || probe.duration;

        let wmTimeConstraint: { startSec: number; endSec: number } | undefined = undefined;
        if (watermark && watermark.enabled !== false && watermark.timeRange && (watermark.timeRange.startSec > 0 || watermark.timeRange.endSec > 0)) {
          wmTimeConstraint = {
            startSec: watermark.timeRange.startSec,
            endSec: watermark.timeRange.endSec || effDuration,
          };
        }

        const filters: string[] = [];
        const wmFilter = buildWatermarkFilter(width, height, wmTimeConstraint);
        if (wmFilter) {
          filters.push(wmFilter);
        }

        const txtFilters = await buildTextFilters(width, height, effDuration);
        filters.push(...txtFilters);

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
          const aacArgs = args.map((a) => (a === 'copy' ? 'aac' : a));
          const idx = aacArgs.indexOf('aac');
          if (idx !== -1) {
            aacArgs.splice(idx + 1, 0, '-b:a', '192k');
          }
          await execFileAsync(this.ffmpegBin, aacArgs);
        }
      }
    } finally {
      for (const tf of tempFilesToClean) {
        await fs.unlink(tf).catch(() => {});
      }
    }

    const outStats = await fs.stat(outputPath);
    const outProbe = await this.probeVideo(outputPath);

    return {
      outputPath,
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
