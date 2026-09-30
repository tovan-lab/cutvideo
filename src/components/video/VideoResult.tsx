import React from 'react';
import { Download, CheckCircle2, Sparkles, ArrowLeft, RefreshCw, Film } from 'lucide-react';
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
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const sizeMb = (result.sizeBytes / (1024 * 1024)).toFixed(1);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = result.videoUrl;
    a.download = result.downloadName || result.videoName || 'video_output.mp4';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
              File mới đã được mã hóa thành công ({result.metadata.width}×{result.metadata.height} · {formatTime(result.duration)})
            </p>
          </div>
        </div>

        {/* Primary Download Button */}
        <button
          type="button"
          onClick={handleDownload}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-emerald-900/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Download className="w-4 h-4" />
          <span>Tải video ({sizeMb} MB)</span>
        </button>
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
