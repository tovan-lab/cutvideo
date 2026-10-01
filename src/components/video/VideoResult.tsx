import React, { useState } from 'react';
import {
  Download,
  CheckCircle2,
  Sparkles,
  ArrowLeft,
  RefreshCw,
  Film,
  ExternalLink,
  Copy,
  Check,
  Loader2,
} from 'lucide-react';
import { VideoOperationResult } from '../../types/video';

interface VideoResultProps {
  result: VideoOperationResult;
  onReset: () => void;
  onJumpToAI: () => void;
}

export const VideoResult: React.FC<VideoResultProps> = ({
  result,
  onReset,
  onJumpToAI,
}) => {
  const [downloadState, setDownloadState] = useState<'idle' | 'downloading' | 'success'>('idle');
  const [copiedLink, setCopiedLink] = useState(false);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const sizeMb = (result.sizeBytes / (1024 * 1024)).toFixed(1);

  const getCleanFilename = (): string => {
    let name = result.downloadName || result.videoName || 'video_output.mp4';
    // Clean unsafe characters for Windows/Mac/Linux
    name = name.replace(/[<>:"/\\|?*]/g, '_').trim();
    if (!name.toLowerCase().endsWith('.mp4')) {
      name += '.mp4';
    }
    return name;
  };

  const handleDownload = async () => {
    if (downloadState === 'downloading') return;
    try {
      setDownloadState('downloading');
      const filename = getCleanFilename();

      let downloadUrl = result.videoUrl;
      let temporaryBlobUrl: string | null = null;

      if (result.blob) {
        temporaryBlobUrl = URL.createObjectURL(result.blob);
        downloadUrl = temporaryBlobUrl;
      } else if (result.videoUrl.startsWith('http') || result.videoUrl.startsWith('/')) {
        // Fetch to blob to ensure true download trigger across all browsers
        try {
          const res = await fetch(result.videoUrl);
          if (res.ok) {
            const blob = await res.blob();
            temporaryBlobUrl = URL.createObjectURL(blob);
            downloadUrl = temporaryBlobUrl;
          }
        } catch (fetchErr) {
          console.warn('Direct blob fetch failed, falling back to direct URL link:', fetchErr);
        }
      }

      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        if (a.parentNode) {
          a.parentNode.removeChild(a);
        }
        if (temporaryBlobUrl) {
          URL.revokeObjectURL(temporaryBlobUrl);
        }
      }, 5000);

      setDownloadState('success');
      setTimeout(() => setDownloadState('idle'), 3000);
    } catch (err) {
      console.error('Download video error:', err);
      // Fallback: open in new tab
      window.open(result.videoUrl, '_blank');
      setDownloadState('idle');
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(result.videoUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      setCopiedLink(false);
    }
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-5 animate-in fade-in duration-300">
      {/* Success banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-emerald-950/20 border border-emerald-800/40 rounded-xl p-3.5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-900/40 border border-emerald-700/50 flex items-center justify-center text-emerald-400 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-emerald-300">
              Xử lý video thật hoàn tất!
            </h4>
            <p className="text-xs text-emerald-400/80 mt-0.5">
              File mới đã sẵn sàng ({result.metadata.width}×{result.metadata.height} · {formatTime(result.duration)})
            </p>
          </div>
        </div>

        {/* Action Buttons: Primary Download + Auxiliaries */}
        <div className="flex items-center gap-2">
          {/* Open in new tab preview */}
          <a
            href={result.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors"
            title="Mở video trong tab mới"
          >
            <ExternalLink className="w-4 h-4" />
          </a>

          {/* Copy link button */}
          <button
            type="button"
            onClick={handleCopyLink}
            className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors"
            title="Sao chép liên kết video"
          >
            {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>

          {/* Primary Download Button */}
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloadState === 'downloading'}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-xl shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] ${
              downloadState === 'success'
                ? 'bg-emerald-500 text-white shadow-emerald-900/40'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30'
            }`}
          >
            {downloadState === 'downloading' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang chuẩn bị tải...</span>
              </>
            ) : downloadState === 'success' ? (
              <>
                <Check className="w-4 h-4" />
                <span>Đã bắt đầu tải về!</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Tải video ({sizeMb} MB)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Result Video Preview */}
      <div className="relative rounded-xl overflow-hidden bg-black/90 border border-slate-800 max-h-[460px] flex items-center justify-center">
        <video
          src={result.videoUrl}
          controls
          playsInline
          className="w-full max-h-[440px] object-contain"
        />
      </div>

      {/* Output Specs Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
          <span className="text-[11px] text-slate-500 block">Thời lượng thật</span>
          <span className="font-mono text-sm font-semibold text-white">
            {formatTime(result.duration)}
          </span>
        </div>
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
          <span className="text-[11px] text-slate-500 block">Độ phân giải</span>
          <span className="font-mono text-sm font-semibold text-white">
            {result.metadata.width}×{result.metadata.height}
          </span>
        </div>
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
          <span className="text-[11px] text-slate-500 block">Hướng khung hình</span>
          <span className="text-sm font-semibold text-slate-300 capitalize">
            {result.metadata.orientation}
          </span>
        </div>
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
          <span className="text-[11px] text-slate-500 block">Âm thanh</span>
          <span className={`text-sm font-semibold ${result.metadata.hasAudio ? 'text-emerald-400' : 'text-slate-500'}`}>
            {result.metadata.hasAudio ? 'Có Audio' : 'Không Audio'}
          </span>
        </div>
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
          <span className="text-[11px] text-slate-500 block">Dung lượng thật</span>
          <span className="font-mono text-sm font-semibold text-white">
            {sizeMb} MB
          </span>
        </div>
      </div>

      {/* Engine & Re-encode Transparency Card */}
      <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Động cơ xử lý:</span>
          <span className="px-2 py-0.5 rounded-md font-mono font-medium text-[11px] bg-indigo-950/80 text-indigo-300 border border-indigo-800/60">
            {result.engineUsed === 'ai_inpaint'
              ? 'AI Video Inpainting (GPU Neural Engine)'
              : result.engineUsed === 'native_ffmpeg'
              ? '⚡ Native FFmpeg (Tốc độ tối đa trên PC)'
              : result.engineUsed === 'ffmpeg'
              ? 'FFmpeg WASM (Local)'
              : 'Browser Media Engine'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Trạng thái mã hóa:</span>
          {result.reencodeStatus === 'no_reencode' ? (
            <span className="px-2 py-0.5 rounded-md font-mono text-[11px] bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 flex items-center gap-1">
              <span>⚡ Stream Copy (-c copy) · Giữ 100% gốc không nén lại</span>
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-md font-mono text-[11px] bg-slate-800 text-slate-300 border border-slate-700">
              Mã hóa chuẩn hóa (H.264 / AAC)
            </span>
          )}
        </div>
      </div>

      {/* Next Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-400 hover:text-white bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Thực hiện thao tác khác</span>
        </button>

        <button
          type="button"
          onClick={onJumpToAI}
          className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-md shadow-indigo-900/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Tạo Title/Hashtag AI cho video này</span>
        </button>
      </div>
    </div>
  );
};
