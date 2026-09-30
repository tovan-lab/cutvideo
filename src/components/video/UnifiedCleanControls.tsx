import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Scissors,
  Eraser,
  Sliders,
  CheckCircle,
  Eye,
  Info,
  Zap,
} from 'lucide-react';
import {
  BoundingBox,
  NOTEBOOKLM_PRESETS,
  OutputQuality,
  UnifiedEditPlan,
  VideoItem,
} from '../../types/video';

interface UnifiedCleanControlsProps {
  video: VideoItem;
  quality: OutputQuality;
  watermarkArea?: BoundingBox;
  onChangeWatermarkArea?: (area: BoundingBox) => void;
  onExecuteClean: (plan: UnifiedEditPlan) => void;
  onPreviewTrim: (startSec: number, endSec: number) => void;
  isProcessing: boolean;
}

export const UnifiedCleanControls: React.FC<UnifiedCleanControlsProps> = ({
  video,
  quality,
  watermarkArea: propWatermarkArea,
  onChangeWatermarkArea,
  onExecuteClean,
  onPreviewTrim,
  isProcessing,
}) => {
  const duration = video.metadata.duration || 10;
  const isPortrait =
    video.metadata.orientation === 'portrait' ||
    video.metadata.height > video.metadata.width ||
    video.metadata.aspectRatio === '9:16';

  // 1. Trim intro settings (NotebookLM intro is typically the last ~3s)
  const defaultCutIntroSeconds = 3;
  const [enableTrimIntro, setEnableTrimIntro] = useState(true);
  const [introDuration, setIntroDuration] = useState(defaultCutIntroSeconds);

  // 2. Watermark settings
  const defaultPreset = isPortrait
    ? NOTEBOOKLM_PRESETS['9:16']
    : NOTEBOOKLM_PRESETS['16:9'];

  const [enableWatermark, setEnableWatermark] = useState(true);
  const [selectedPresetId, setSelectedPresetId] = useState<'9:16' | '16:9' | 'custom'>(
    isPortrait ? '9:16' : '16:9'
  );
  const [localWatermarkArea, setLocalWatermarkArea] = useState<BoundingBox>(propWatermarkArea || defaultPreset.area);
  const [watermarkMethod, setWatermarkMethod] = useState<'delogo' | 'blur' | 'cover'>('delogo');
  const [feather, setFeather] = useState(8);
  const [coverColor, setCoverColor] = useState('#020617');

  const effectiveArea = propWatermarkArea || localWatermarkArea;

  const updateArea = (newArea: BoundingBox) => {
    setLocalWatermarkArea(newArea);
    onChangeWatermarkArea?.(newArea);
  };

  // Update preset when video orientation changes
  useEffect(() => {
    const preset = isPortrait ? NOTEBOOKLM_PRESETS['9:16'] : NOTEBOOKLM_PRESETS['16:9'];
    setSelectedPresetId(isPortrait ? '9:16' : '16:9');
    updateArea(preset.area);
  }, [video.id, isPortrait]);

  const handleSelectPreset = (key: '9:16' | '16:9') => {
    setSelectedPresetId(key);
    updateArea(NOTEBOOKLM_PRESETS[key].area);
  };

  const calculatedEndSec = Math.max(0.5, duration - (enableTrimIntro ? introDuration : 0));

  const handleRun = () => {
    const plan: UnifiedEditPlan = {
      video,
      quality,
      trim: enableTrimIntro
        ? {
            enabled: true,
            startSec: 0,
            endSec: calculatedEndSec,
          }
        : undefined,
      watermark: enableWatermark
        ? {
            enabled: true,
            method: watermarkMethod,
            area: effectiveArea,
            coverColor,
            feather,
          }
        : undefined,
    };

    onExecuteClean(plan);
  };

  return (
    <div className="glass-panel rounded-3xl p-3.5 sm:p-5 space-y-3.5 sm:space-y-4.5 shadow-2xl shadow-black/50 border border-slate-800/80">
      {/* Header with Aspect Ratio Detection & 3D Glowing Pill */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500/30 to-indigo-600/30 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5 truncate">
              Làm Sạch Gộp
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded-md bg-amber-950/80 text-amber-300 border border-amber-800/50 font-bold shrink-0">
                1-Pass
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 truncate">
              Cắt intro & Xóa logo trong 1 lần render
            </p>
          </div>
        </div>

        {/* Video format badge */}
        <div className="shrink-0 px-2 py-1 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] font-mono font-semibold text-indigo-300">
          {isPortrait ? '📱 Dọc 9:16' : '🖥️ Ngang 16:9'}
        </div>
      </div>

      {/* 1. Intro Cut Section */}
      <div className="glass-panel-subtle rounded-2xl p-3 sm:p-3.5 space-y-2.5 border border-slate-800/80">
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={enableTrimIntro}
              onChange={(e) => setEnableTrimIntro(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700 focus:ring-indigo-500 cursor-pointer"
            />
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Scissors className="w-3.5 h-3.5 text-indigo-400" />
              Cắt bỏ Intro cuối video
            </span>
          </label>

          {enableTrimIntro && (
            <button
              type="button"
              onClick={() => onPreviewTrim(Math.max(0, duration - introDuration - 2), duration)}
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-indigo-300 bg-indigo-950/70 hover:bg-indigo-900/80 border border-indigo-700/50 rounded-lg transition-all active:scale-95"
            >
              <Eye className="w-3 h-3" />
              <span className="hidden xs:inline">Xem trước</span>
            </button>
          )}
        </div>

        {enableTrimIntro && (
          <div className="pl-1 sm:pl-4 space-y-2 pt-1 border-t border-slate-800/40">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Đoạn intro cắt bỏ:</span>
              <span className="font-mono text-white font-bold">{introDuration.toFixed(1)} giây</span>
            </div>
            <div className="flex items-center gap-2.5">
              <input
                type="range"
                min="1"
                max={Math.min(10, Math.floor(duration - 1))}
                step="0.5"
                value={introDuration}
                onChange={(e) => setIntroDuration(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <div className="flex items-center gap-1 shrink-0">
                {[2.5, 3.0, 3.5].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setIntroDuration(val)}
                    className={`px-2 py-0.5 text-[11px] rounded-lg font-mono transition-all active:scale-95 ${
                      introDuration === val
                        ? 'bg-indigo-600 text-white font-bold shadow-xs'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {val}s
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
              <span>Gốc: {duration.toFixed(1)}s</span>
              <span className="text-emerald-400 font-semibold">Kết quả: {calculatedEndSec.toFixed(1)}s</span>
            </div>
          </div>
        )}
      </div>

      {/* 2. Watermark Removal Section */}
      <div className="glass-panel-subtle rounded-2xl p-3 sm:p-3.5 space-y-2.5 border border-slate-800/80">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={enableWatermark}
              onChange={(e) => setEnableWatermark(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700 focus:ring-indigo-500 cursor-pointer"
            />
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Eraser className="w-3.5 h-3.5 text-indigo-400" />
              Khử Watermark NotebookLM (Góc dưới phải)
            </span>
          </label>
        </div>

        {enableWatermark && (
          <div className="pl-1 sm:pl-4 space-y-2.5 pt-1 border-t border-slate-800/40">
            {/* Preset Selection Buttons & Coordinates */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span className="font-medium">Vùng chọn theo khổ:</span>
                <span className="font-mono text-indigo-400 font-bold">
                  {effectiveArea.x}% {effectiveArea.y}% ({effectiveArea.width}×{effectiveArea.height}%)
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSelectPreset('9:16')}
                  className={`px-2.5 py-1.5 text-xs rounded-xl font-medium transition-all text-center active:scale-95 ${
                    selectedPresetId === '9:16'
                      ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-bold shadow-md shadow-indigo-600/30 ring-1 ring-indigo-400/30'
                      : 'bg-slate-950/80 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  ⭐ Khổ Dọc 9:16
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPreset('16:9')}
                  className={`px-2.5 py-1.5 text-xs rounded-xl font-medium transition-all text-center active:scale-95 ${
                    selectedPresetId === '16:9'
                      ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-bold shadow-md shadow-indigo-600/30 ring-1 ring-indigo-400/30'
                      : 'bg-slate-950/80 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  ⭐ Khổ Ngang 16:9
                </button>
              </div>

              {/* Quick Nudge Buttons for mobile fine-tuning */}
              <div className="flex items-center justify-between bg-slate-950/70 border border-slate-800/80 rounded-xl px-2.5 py-1.5 mt-1.5">
                <span className="text-[10px] text-slate-400 font-mono">Dịch khung:</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => updateArea({ ...effectiveArea, x: Math.max(0, Number((effectiveArea.x - 1).toFixed(1))) })}
                    className="w-6 h-6 flex items-center justify-center rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 text-xs active:scale-95 font-bold"
                    title="Sang trái 1%"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => updateArea({ ...effectiveArea, x: Math.min(100 - effectiveArea.width, Number((effectiveArea.x + 1).toFixed(1))) })}
                    className="w-6 h-6 flex items-center justify-center rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 text-xs active:scale-95 font-bold"
                    title="Sang phải 1%"
                  >
                    →
                  </button>
                  <button
                    type="button"
                    onClick={() => updateArea({ ...effectiveArea, y: Math.max(0, Number((effectiveArea.y - 1).toFixed(1))) })}
                    className="w-6 h-6 flex items-center justify-center rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 text-xs active:scale-95 font-bold"
                    title="Lên trên 1%"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => updateArea({ ...effectiveArea, y: Math.min(100 - effectiveArea.height, Number((effectiveArea.y + 1).toFixed(1))) })}
                    className="w-6 h-6 flex items-center justify-center rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 text-xs active:scale-95 font-bold"
                    title="Xuống dưới 1%"
                  >
                    ↓
                  </button>
                </div>
              </div>
            </div>

            {/* Filter Method Selection */}
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 block font-medium">Phương pháp khử watermark:</span>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setWatermarkMethod('delogo')}
                  className={`p-2 rounded-xl border text-center transition-all ${
                    watermarkMethod === 'delogo'
                      ? 'bg-indigo-950/80 border-indigo-500 text-white shadow-md shadow-indigo-900/30 font-bold'
                      : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="text-[11px] text-indigo-300 font-semibold">Delogo</div>
                  <div className="text-[9px] text-slate-500 mt-0.5 hidden xs:block">Nội suy viền</div>
                </button>

                <button
                  type="button"
                  onClick={() => setWatermarkMethod('blur')}
                  className={`p-2 rounded-xl border text-center transition-all ${
                    watermarkMethod === 'blur'
                      ? 'bg-indigo-950/80 border-indigo-500 text-white shadow-md shadow-indigo-900/30 font-bold'
                      : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="text-[11px] text-indigo-300 font-semibold">Làm mờ</div>
                  <div className="text-[9px] text-slate-500 mt-0.5 hidden xs:block">BoxBlur</div>
                </button>

                <button
                  type="button"
                  onClick={() => setWatermarkMethod('cover')}
                  className={`p-2 rounded-xl border text-center transition-all ${
                    watermarkMethod === 'cover'
                      ? 'bg-indigo-950/80 border-indigo-500 text-white shadow-md shadow-indigo-900/30 font-bold'
                      : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="text-[11px] text-indigo-300 font-semibold">Che màu</div>
                  <div className="text-[9px] text-slate-500 mt-0.5 hidden xs:block">Matte</div>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3D Radiant Action Button */}
      <div className="pt-1">
        <button
          type="button"
          disabled={isProcessing || (!enableTrimIntro && !enableWatermark)}
          onClick={handleRun}
          className="relative group w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white text-xs sm:text-sm font-bold shadow-xl shadow-indigo-600/35 transition-all hover:scale-[1.01] active:scale-[0.98] ring-1 ring-white/20 overflow-hidden"
        >
          {/* Shimmer sweep effect */}
          <div className="absolute inset-0 -translate-x-full group-hover:animate-shimmer bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />

          <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
          <span>Render Làm Sạch 1 Lần (Native FFmpeg)</span>
        </button>
        <p className="text-[10px] text-slate-500 text-center mt-1.5">
          Tốc độ 1–3s · Giữ nguyên 100% âm thanh gốc · Không nén lại 2 lần
        </p>
      </div>
    </div>
  );
};
