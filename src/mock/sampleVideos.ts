import { VideoItem } from '../types/video';

/**
 * Creates a synthetic playable video in browser memory using HTML5 Canvas & MediaRecorder.
 * This ensures the user can test the app immediately without requiring an external video file.
 */
export async function createSyntheticSampleVideo(
  title: string,
  durationSec = 8,
  theme: 'tech' | 'vlog' | 'reel' = 'tech'
): Promise<VideoItem> {
  const width = theme === 'reel' ? 720 : 1280;
  const height = theme === 'reel' ? 1280 : 720;
  const fps = 30;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const stream = canvas.captureStream(fps);
  
  // Choose supported mimeType
  let mimeType = 'video/webm;codecs=vp9';
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/mp4';
    }
  }

  const recorder = new MediaRecorder(stream, {
    mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : undefined,
    videoBitsPerSecond: 2500000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const recordingPromise = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
      resolve(blob);
    };
  });

  recorder.start();

  const totalFrames = durationSec * fps;
  let frame = 0;

  // Render loop
  const interval = setInterval(() => {
    if (frame >= totalFrames) {
      clearInterval(interval);
      recorder.stop();
      return;
    }

    const t = frame / fps;
    const progress = frame / totalFrames;

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    if (theme === 'tech') {
      bgGrad.addColorStop(0, '#0f172a'); // slate-900
      bgGrad.addColorStop(1, '#1e293b'); // slate-800
    } else if (theme === 'vlog') {
      bgGrad.addColorStop(0, '#111827');
      bgGrad.addColorStop(1, '#064e3b');
    } else {
      bgGrad.addColorStop(0, '#18181b');
      bgGrad.addColorStop(1, '#4c1d95');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Subtle grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Dynamic wave or circle
    const circleX = width / 2 + Math.cos(t * 2) * (width * 0.25);
    const circleY = height / 2 + Math.sin(t * 3) * (height * 0.15);
    const radGrad = ctx.createRadialGradient(circleX, circleY, 10, circleX, circleY, 180);
    radGrad.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
    radGrad.addColorStop(1, 'rgba(99, 102, 241, 0)');
    ctx.fillStyle = radGrad;
    ctx.beginPath();
    ctx.arc(circleX, circleY, 180, 0, Math.PI * 2);
    ctx.fill();

    // Corner Watermark / Logo to test watermark removal tool!
    ctx.save();
    ctx.fillStyle = 'rgba(244, 63, 94, 0.85)';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText('SAMPLE_LOGO_REC', width - 230, 60);
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.5)';
    ctx.strokeRect(width - 240, 32, 220, 38);
    ctx.restore();

    // Center Title Card
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, width / 2, height / 2 - 40);

    // Timer display
    ctx.font = '24px monospace';
    ctx.fillStyle = '#94a3b8';
    const currentTimeStr = `${Math.floor(t / 60).toString().padStart(2, '0')}:${Math.floor(t % 60).toString().padStart(2, '0')}.${Math.floor((t % 1) * 100).toString().padStart(2, '0')}`;
    ctx.fillText(`TIME: ${currentTimeStr} / 00:0${durationSec}.00`, width / 2, height / 2 + 15);

    // Resolution & FPS info
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText(`${width}x${height} · ${fps}fps · Frame ${frame}/${totalFrames}`, width / 2, height / 2 + 55);

    // Progress bar at bottom
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(40, height - 30, width - 80, 8);
    ctx.fillStyle = '#6366f1';
    ctx.fillRect(40, height - 30, (width - 80) * progress, 8);

    frame++;
  }, 1000 / fps);

  const videoBlob = await recordingPromise;
  const videoUrl = URL.createObjectURL(videoBlob);

  return {
    id: `sample_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: `${title.toLowerCase().replace(/\s+/g, '_')}.mp4`,
    url: videoUrl,
    blob: videoBlob,
    createdAt: Date.now(),
    isSample: true,
    metadata: {
      duration: durationSec,
      width,
      height,
      aspectRatio: theme === 'reel' ? '9:16' : '16:9',
      orientation: theme === 'reel' ? 'portrait' : 'landscape',
      fps,
      sizeBytes: videoBlob.size || 2400000,
      format: 'MP4/WebM',
      hasAudio: false,
      bitrateKbps: 2500,
    },
  };
}

/**
 * Static presets for quick one-click preview and testing
 */
export const SAMPLE_PRESETS = [
  {
    id: 'sample-tech',
    title: 'Review Công Nghệ Tech 2026',
    theme: 'tech' as const,
    duration: 8,
    desc: 'Video ngang 16:9, có watermark góc trên để thử tính năng xóa logo',
  },
  {
    id: 'sample-vlog',
    title: 'Daily Vlog Du Lịch',
    theme: 'vlog' as const,
    duration: 6,
    desc: 'Video 16:9 phong cảnh, thích hợp thử cắt và ghép clip',
  },
  {
    id: 'sample-reel',
    title: 'Shorts / TikTok Vertical Reel',
    theme: 'reel' as const,
    duration: 10,
    desc: 'Định dạng dọc 9:16 tối ưu cho TikTok / Reels / Shorts',
  },
];
