import React from 'react';
import { Scissors, Play, RotateCcw, Clock, ArrowRight } from 'lucide-react';
import { TrimConfig } from '../../types/video';

interface TrimControlsProps {
  duration: number;
  trimConfig: TrimConfig;
  currentTime: number;
  onChange: (config: TrimConfig) => void;
  onPreviewTrim: () => void;
  onSeekTo: (timeSec: number) => void;
}

export const TrimControls: React.FC<TrimControlsProps> = ({
  duration,
  trimConfig,
  currentTime,
  onChange,
  onPreviewTrim,
  onSeekTo,
}) => {
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  const handleStartChange = (val: number) => {
    const safeVal = Math.max(0, Math.min(val, trimConfig.endTime - 0.5));
    onChange({ ...trimConfig, startTime: safeVal });
    onSeekTo(safeVal);
  };

  const handleEndChange = (val: number) => {
    const safeVal = Math.min(duration, Math.max(val, trimConfig.startTime + 0.5));
    onChange({ ...trimConfig, endTime: safeVal });
    onSeekTo(safeVal);
  };

  const setStartToCurrent = () => {
    handleStartChange(currentTime);
  };

  const setEndToCurrent = () => {
    handleEndChange(currentTime);
  };

  const setPreset = (lengthSec: number) => {
    const end = Math.min(duration, lengthSec);
    onChange({ startTime: 0, endTime: end });
    onSeekTo(0);
  };

  const resetAll = () => {
    onChange({ startTime: 0, endTime: duration });
    onSeekTo(0);
  };

  const trimmedDuration = Math.max(0, trimConfig.endTime - trimConfig.startTime);

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
      {/* Header with cut summary */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-950/60 border border-indigo-700/40 flex items-center justify-center text-indigo-400">
            <Scissors className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Công cụ Cắt Video (Trim)
            </h4>
            <p className="text-[11px] text-slate-400">
              Chọn điểm đầu & điểm cuối chính xác theo mili-giây
            </p>
          </div>
        </div>

        {/* Selected Duration summary */}
        <div className="flex items-center gap-2 px-3 py-1 bg-slate-950 rounded-lg border border-slate-800 text-xs">
          <Clock className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-slate-400">Thời lượng xuất:</span>
          <span className="font-mono font-semibold text-white">
            {formatTime(trimmedDuration)}
          </span>
        </div>
      </div>

      {/* Engine Trim Mode Toggle (Fast Stream Copy vs Precise Re-encode) */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400 font-medium">Chế độ xử lý FFmpeg:</span>
          <span className="text-indigo-400 font-mono text-[10px]">
            {trimConfig.mode === 'precise_reencode' ? 'Mã hóa lại' : 'Lossless -c copy'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onChange({ ...trimConfig, mode: 'fast_stream_copy' })}
            className={`px-2.5 py-1.5 rounded-lg text-left transition-all ${
              (trimConfig.mode === 'fast_stream_copy' || !trimConfig.mode)
                ? 'bg-indigo-600/30 border border-indigo-500/50 text-indigo-200'
                : 'bg-slate-900 border border-slate-800/80 text-slate-400 hover:text-slate-300'
            }`}
          >
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <span>⚡ Fast Stream Copy</span>
            </div>
            <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
              Siêu tốc, giữ 100% gốc không re-encode
            </div>
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...trimConfig, mode: 'precise_reencode' })}
            className={`px-2.5 py-1.5 rounded-lg text-left transition-all ${
              trimConfig.mode === 'precise_reencode'
                ? 'bg-indigo-600/30 border border-indigo-500/50 text-indigo-200'
                : 'bg-slate-900 border border-slate-800/80 text-slate-400 hover:text-slate-300'
            }`}
          >
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <span>🎯 Precise Trim</span>
            </div>
            <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
              Mã hóa chính xác từng khung hình
            </div>
          </button>
        </div>
      </div>

      {/* Start / End Pickers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Start Point Card */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">Điểm bắt đầu (Start)</span>
            <button
              type="button"
              onClick={setStartToCurrent}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Lấy mốc hiện tại ({formatTime(currentTime)})
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={Math.max(0.1, trimConfig.endTime - 0.5)}
              step={0.1}
              value={trimConfig.startTime}
              onChange={(e) => handleStartChange(parseFloat(e.target.value))}
              className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
            <span className="w-16 text-right font-mono text-xs font-medium text-white px-2 py-1 bg-slate-900 border border-slate-800 rounded">
              {formatTime(trimConfig.startTime)}
            </span>
          </div>
        </div>

        {/* End Point Card */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">Điểm kết thúc (End)</span>
            <button
              type="button"
              onClick={setEndToCurrent}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Lấy mốc hiện tại ({formatTime(currentTime)})
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={trimConfig.startTime + 0.5}
              max={duration || 10}
              step={0.1}
              value={trimConfig.endTime}
              onChange={(e) => handleEndChange(parseFloat(e.target.value))}
              className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
            <span className="w-16 text-right font-mono text-xs font-medium text-white px-2 py-1 bg-slate-900 border border-slate-800 rounded">
              {formatTime(trimConfig.endTime)}
            </span>
          </div>
        </div>
      </div>

      {/* Preset shortcuts & Preview button */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-500 mr-1">Cắt nhanh:</span>
          {duration >= 15 && (
            <button
              type="button"
              onClick={() => setPreset(15)}
              className="px-2.5 py-1 text-xs bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-md transition-colors"
            >
              15s đầu
            </button>
          )}
          {duration >= 30 && (
            <button
              type="button"
              onClick={() => setPreset(30)}
              className="px-2.5 py-1 text-xs bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-md transition-colors"
            >
              30s đầu
            </button>
          )}
          {duration >= 60 && (
            <button
              type="button"
              onClick={() => setPreset(60)}
              className="px-2.5 py-1 text-xs bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-md transition-colors"
            >
              60s đầu
            </button>
          )}
          <button
            type="button"
            onClick={resetAll}
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            title="Khôi phục toàn bộ độ dài"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Mặc định</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onPreviewTrim}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/20 transition-colors"
        >
          <Play className="w-3.5 h-3.5 fill-indigo-300" />
          <span>Xem trước đoạn cắt</span>
        </button>
      </div>
    </div>
  );
};
