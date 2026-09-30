import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Scissors,
  Eraser,
  Layers,
  Type,
  Play,
  CheckCircle,
  Plus,
  Eye,
  EyeOff,
  Zap,
  Sliders,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  Trash2,
  Film,
  Clock,
  XCircle,
  Wand2,
} from 'lucide-react';
import {
  ALL_TRANSITIONS,
  AllInOnePlan,
  BoundingBox,
  MergeItem,
  NOTEBOOKLM_PRESETS,
  ObjectRemovalConfig,
  OutputQuality,
  TextOverlayItem,
  ToolType,
  TransitionType,
  TrimConfig,
  VideoItem,
} from '../../types/video';

interface AllInOneControlsProps {
  currentVideo: VideoItem;
  quality: OutputQuality;
  trimConfig: TrimConfig;
  onChangeTrimConfig: (cfg: TrimConfig) => void;
  watermarkConfig: ObjectRemovalConfig;
  onChangeWatermarkConfig: React.Dispatch<React.SetStateAction<ObjectRemovalConfig>>;
  mergeItems: MergeItem[];
  onChangeMergeItems: (items: MergeItem[]) => void;
  autoTransitions: boolean;
  onToggleAutoTransitions: (v: boolean) => void;
  textItems: TextOverlayItem[];
  onChangeTextItems: (items: TextOverlayItem[]) => void;
  onExecuteAllInOne: (plan: AllInOnePlan) => void;
  onPreviewTrim: (startSec: number, endSec: number) => void;
  onSwitchToolTab: (tool: ToolType) => void;
  onOpenPreviewModal: () => void;
  onSelectVideoForEditing?: (video: VideoItem) => void;
  onAddFiles?: (files: FileList) => void;
  isProcessing: boolean;
}

export const AllInOneControls: React.FC<AllInOneControlsProps> = ({
  currentVideo,
  quality,
  trimConfig,
  onChangeTrimConfig,
  watermarkConfig,
  onChangeWatermarkConfig,
  mergeItems,
  onChangeMergeItems,
  autoTransitions,
  onToggleAutoTransitions,
  textItems,
  onChangeTextItems,
  onExecuteAllInOne,
  onPreviewTrim,
  onSwitchToolTab,
  onOpenPreviewModal,
  onSelectVideoForEditing,
  onAddFiles,
  isProcessing,
}) => {
  const duration = currentVideo.metadata.duration || 10;
  const isPortrait =
    currentVideo.metadata.orientation === 'portrait' ||
    currentVideo.metadata.height > currentVideo.metadata.width ||
    currentVideo.metadata.aspectRatio === '9:16';

  // Master toggles for the 4 features
  const [enableTrim, setEnableTrim] = useState(false);
  const [enableWatermark, setEnableWatermark] = useState(watermarkConfig.enabled !== false);
  const [enableMerge, setEnableMerge] = useState(mergeItems.length > 1);
  const [enableText, setEnableText] = useState(textItems.some((t) => t.text.trim().length > 0));

  // Transitions
  const [selectedTransition, setSelectedTransition] = useState<string>(autoTransitions ? 'auto' : 'fade');
  const [transitionDuration, setTransitionDuration] = useState<number>(0.75);

  // Quick text input if user wants to add/edit inline
  const [quickText, setQuickText] = useState('');

  // Update preset when video orientation changes
  useEffect(() => {
    const preset = isPortrait ? NOTEBOOKLM_PRESETS['9:16'] : NOTEBOOKLM_PRESETS['16:9'];
    onChangeWatermarkConfig((prev) => ({
      ...prev,
      area: preset.area,
      method: prev.method || 'delogo',
    }));
  }, [currentVideo.id, isPortrait, onChangeWatermarkConfig]);

  useEffect(() => {
    if (mergeItems.length > 1) {
      setEnableMerge(true);
    }
  }, [mergeItems.length]);

  const handleAddQuickText = () => {
    if (!quickText.trim()) return;
    const newItem: TextOverlayItem = {
      id: `text_${Date.now()}`,
      text: quickText.trim(),
      startTime: 0,
      endTime: duration,
      fullDuration: true,
      fontFamily: 'Montserrat',
      fontSize: 32,
      isBold: true,
      isItalic: false,
      isUppercase: false,
      textAlign: 'center',
      textColor: '#ffffff',
      opacity: 100,
      boxEnabled: true,
      boxColor: '#000000',
      boxOpacity: 75,
      boxPadding: 8,
      boxRadius: 8,
      strokeEnabled: true,
      strokeColor: '#000000',
      strokeWidth: 2,
      shadowEnabled: true,
      shadowColor: '#000000',
      shadowBlur: 4,
      positionPreset: 'lower_third',
      x: 50,
      y: 75,
      animation: 'slide_up',
      animationDuration: 0.4,
    };
    onChangeTextItems([...textItems, newItem]);
    setQuickText('');
    setEnableText(true);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleMoveClip = (index: number, direction: -1 | 1) => {
    const newItems = [...mergeItems];
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= newItems.length) return;
    const temp = newItems[index];
    newItems[index] = newItems[targetIdx];
    newItems[targetIdx] = temp;
    const updated = newItems.map((item, idx) => ({ ...item, order: idx }));
    onChangeMergeItems(updated);
  };

  const handleRemoveClip = (index: number) => {
    if (mergeItems.length <= 1) return;
    const newItems = mergeItems.filter((_, idx) => idx !== index);
    const updated = newItems.map((item, idx) => ({ ...item, order: idx }));
    onChangeMergeItems(updated);
  };

  const handleCutSpecificClip = (video: VideoItem) => {
    onSelectVideoForEditing?.(video);
    onSwitchToolTab('trim');
  };

  const handleRunAllInOne = () => {
    const videosToRender =
      enableMerge && mergeItems.length > 0 ? mergeItems.map((m) => m.video) : [currentVideo];

    const clipTrims =
      enableMerge && mergeItems.length > 1
        ? mergeItems
            .map((item, idx) => {
              if (
                item.trimConfig &&
                (item.trimConfig.startTime > 0 ||
                  item.trimConfig.endTime < item.video.metadata.duration)
              ) {
                return {
                  clipIndex: idx,
                  startSec: item.trimConfig.startTime,
                  endSec: item.trimConfig.endTime,
                };
              }
              return null;
            })
            .filter((t): t is { clipIndex: number; startSec: number; endSec: number } => t !== null)
        : undefined;

    const plan: AllInOnePlan = {
      videos: videosToRender,
      trim: enableTrim
        ? {
            enabled: true,
            startSec: trimConfig.startTime,
            endSec: trimConfig.endTime,
          }
        : undefined,
      clipTrims: clipTrims && clipTrims.length > 0 ? clipTrims : undefined,
      watermark:
        enableWatermark && watermarkConfig.enabled !== false
          ? {
              enabled: true,
              method: watermarkConfig.method === 'ai_inpaint' ? 'blur' : watermarkConfig.method,
              area: watermarkConfig.area,
              coverColor: watermarkConfig.coverColor,
              feather: watermarkConfig.feather,
              targetClipIndex: watermarkConfig.targetClipIndex,
              timeRange: watermarkConfig.timeRange,
            }
          : undefined,
      textItems: enableText
        ? textItems.filter((t) => t.text.trim().length > 0)
        : undefined,
      merge: enableMerge && mergeItems.length > 1
        ? {
            enabled: true,
            autoTransitions: selectedTransition === 'auto',
            defaultTransition: selectedTransition !== 'auto' ? (selectedTransition as TransitionType) : undefined,
            transitionDuration: transitionDuration,
          }
        : undefined,
      quality,
    };

    onExecuteAllInOne(plan);
  };

  const activeFeaturesCount =
    (enableTrim ? 1 : 0) +
    (enableWatermark ? 1 : 0) +
    (enableMerge && mergeItems.length > 1 ? 1 : 0) +
    (enableText && textItems.some((t) => t.text.trim().length > 0) ? 1 : 0);

  return (
    <div className="glass-panel rounded-3xl p-3.5 sm:p-5 space-y-4 shadow-2xl shadow-black/50 border border-slate-800/80">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-amber-500/30 via-indigo-600/30 to-pink-500/30 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5 truncate">
              Xuất Trọn Gói 1 Lần
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 to-pink-500/20 text-amber-300 font-semibold border border-amber-500/30">
                All-in-One
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 truncate">
              Xóa watermark + Cắt ghép + Thêm chữ tải về 1 lần duy nhất
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-1 rounded-xl shrink-0">
          <Zap className="w-3 h-3" />
          <span className="font-semibold">{activeFeaturesCount} tác vụ</span>
        </div>
      </div>

      {/* Feature 1: Cắt Video (Trim) */}
      <div
        className={`rounded-2xl border p-3 transition-all ${
          enableTrim
            ? 'bg-slate-900/80 border-indigo-500/40 shadow-sm shadow-indigo-500/10'
            : 'bg-slate-950/40 border-slate-800/60 opacity-80'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={enableTrim}
              onChange={(e) => setEnableTrim(e.target.checked)}
              className="w-4 h-4 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-900 cursor-pointer"
            />
            <div className="flex items-center gap-2">
              <Scissors className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-bold text-slate-200">1. Cắt Video (Trim)</span>
            </div>
          </label>

          {enableTrim && (
            <button
              type="button"
              onClick={() => onPreviewTrim(trimConfig.startTime, trimConfig.endTime)}
              className="flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 px-2 py-1 rounded-lg bg-indigo-950/40 border border-indigo-500/20"
            >
              <Eye className="w-3 h-3" />
              <span>Xem thử</span>
            </button>
          )}
        </div>

        {enableTrim && (
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Bắt đầu (giây)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max={trimConfig.endTime - 0.5}
                  value={Number(trimConfig.startTime.toFixed(1))}
                  onChange={(e) =>
                    onChangeTrimConfig({
                      ...trimConfig,
                      startTime: Math.max(0, parseFloat(e.target.value) || 0),
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Kết thúc (giây)</label>
                <input
                  type="number"
                  step="0.1"
                  min={trimConfig.startTime + 0.5}
                  max={duration}
                  value={Number(trimConfig.endTime.toFixed(1))}
                  onChange={(e) =>
                    onChangeTrimConfig({
                      ...trimConfig,
                      endTime: Math.min(duration, parseFloat(e.target.value) || duration),
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-500">
              Độ dài sau cắt:{' '}
              <span className="text-indigo-300 font-semibold">
                {(trimConfig.endTime - trimConfig.startTime).toFixed(1)}s
              </span>{' '}
              / gốc {duration.toFixed(1)}s
            </p>
          </div>
        )}
      </div>

      {/* Feature 2: Xóa Watermark / Logo */}
      <div
        className={`rounded-2xl border p-3 transition-all ${
          enableWatermark && watermarkConfig.enabled !== false
            ? 'bg-slate-900/80 border-amber-500/40 shadow-sm shadow-amber-500/10'
            : 'bg-slate-950/40 border-slate-800/60 opacity-80'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={enableWatermark && watermarkConfig.enabled !== false}
              onChange={(e) => {
                const val = e.target.checked;
                setEnableWatermark(val);
                onChangeWatermarkConfig((p) => ({ ...p, enabled: val }));
              }}
              className="w-4 h-4 rounded border-slate-700 text-amber-500 focus:ring-amber-500 bg-slate-900 cursor-pointer"
            />
            <div className="flex items-center gap-2">
              <Eraser className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-slate-200">2. Xóa Watermark (Khử Logo)</span>
            </div>
          </label>

          <div className="flex items-center gap-1.5">
            {enableWatermark && watermarkConfig.enabled !== false ? (
              <button
                type="button"
                onClick={() => onChangeWatermarkConfig((p) => ({ ...p, enabled: false }))}
                className="flex items-center gap-1 text-[10px] font-semibold text-rose-300 hover:text-rose-200 px-2 py-1 rounded-lg bg-rose-950/40 border border-rose-800/40"
                title="Bấm để ẩn / không xóa watermark cho video này"
              >
                <EyeOff className="w-3 h-3" />
                <span>Ẩn / Không xóa</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEnableWatermark(true);
                  onChangeWatermarkConfig((p) => ({ ...p, enabled: true }));
                }}
                className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded-lg bg-emerald-950/40 border border-emerald-800/40"
              >
                <CheckCircle className="w-3 h-3" />
                <span>Bật xóa</span>
              </button>
            )}

            {enableWatermark && watermarkConfig.enabled !== false && (
              <button
                type="button"
                onClick={() => onSwitchToolTab('watermark')}
                className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 hover:text-amber-300 px-2 py-1 rounded-lg bg-amber-950/40 border border-amber-500/20"
              >
                <Sliders className="w-3 h-3" />
                <span>Chỉnh vùng</span>
              </button>
            )}
          </div>
        </div>

        {enableWatermark && watermarkConfig.enabled !== false && (
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-2.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[10px] text-slate-400 shrink-0">Phương pháp:</span>
              <div className="grid grid-cols-3 gap-1.5 w-full">
                <button
                  type="button"
                  onClick={() => onChangeWatermarkConfig((p) => ({ ...p, method: 'delogo' }))}
                  className={`py-1 px-2 rounded-lg text-[10px] font-semibold transition-all ${
                    watermarkConfig.method === 'delogo'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Delogo (Chuẩn)
                </button>
                <button
                  type="button"
                  onClick={() => onChangeWatermarkConfig((p) => ({ ...p, method: 'blur' }))}
                  className={`py-1 px-2 rounded-lg text-[10px] font-semibold transition-all ${
                    watermarkConfig.method === 'blur'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Làm mờ (Blur)
                </button>
                <button
                  type="button"
                  onClick={() => onChangeWatermarkConfig((p) => ({ ...p, method: 'cover' }))}
                  className={`py-1 px-2 rounded-lg text-[10px] font-semibold transition-all ${
                    watermarkConfig.method === 'cover'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Che màu (Cover)
                </button>
              </div>
            </div>

            {/* Target Clip Selection if multiple clips */}
            {mergeItems.length > 1 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Áp dụng xóa logo trên:</span>
                  <span className="text-amber-400 text-[10px] font-mono">
                    {watermarkConfig.targetClipIndex === 'all' || watermarkConfig.targetClipIndex === undefined
                      ? 'Tất cả video'
                      : `Chỉ Clip #${Number(watermarkConfig.targetClipIndex) + 1}`}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => onChangeWatermarkConfig((p) => ({ ...p, targetClipIndex: 'all' }))}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium border transition ${
                      watermarkConfig.targetClipIndex === 'all' || watermarkConfig.targetClipIndex === undefined
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    🌐 Tất cả video
                  </button>
                  {mergeItems.map((item, idx) => (
                    <button
                      key={item.video?.id || `wm_btn_${idx}`}
                      type="button"
                      onClick={() => onChangeWatermarkConfig((p) => ({ ...p, targetClipIndex: idx }))}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border transition ${
                        watermarkConfig.targetClipIndex === idx
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      #{idx + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[10px] text-slate-500">
              Vùng áp dụng: Vùng góc dưới video{' '}
              <span className="text-amber-300 font-semibold">
                (x: {watermarkConfig.area.x.toFixed(0)}%, y: {watermarkConfig.area.y.toFixed(0)}%, w:{' '}
                {watermarkConfig.area.width.toFixed(0)}%, h: {watermarkConfig.area.height.toFixed(0)}%)
              </span>
            </p>
          </div>
        )}

        {watermarkConfig.enabled === false && (
          <div className="mt-2.5 p-2 bg-slate-950/80 rounded-xl border border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5 text-[11px]">
              <XCircle className="w-3.5 h-3.5 text-slate-500" />
              Đã ẩn xóa watermark (Video giữ nguyên gốc không xóa logo)
            </span>
            <button
              type="button"
              onClick={() => {
                setEnableWatermark(true);
                onChangeWatermarkConfig((p) => ({ ...p, enabled: true }));
              }}
              className="text-[11px] text-amber-400 hover:underline font-semibold"
            >
              Bật lại
            </button>
          </div>
        )}
      </div>

      {/* Feature 3: Ghép Nhiều Video (Merge clips) */}
      <div
        className={`rounded-2xl border p-3 transition-all ${
          enableMerge
            ? 'bg-slate-900/80 border-indigo-500/40 shadow-sm shadow-indigo-500/10'
            : 'bg-slate-950/40 border-slate-800/60 opacity-80'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={enableMerge}
              onChange={(e) => setEnableMerge(e.target.checked)}
              className="w-4 h-4 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-900 cursor-pointer"
            />
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-bold text-slate-200">
                3. Ghép Video ({mergeItems.length} clips)
              </span>
            </div>
          </label>

          <button
            type="button"
            onClick={() => onSwitchToolTab('merge')}
            className="flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 px-2 py-1 rounded-lg bg-indigo-950/40 border border-indigo-500/20"
          >
            <Plus className="w-3 h-3" />
            <span>Quản lý clip</span>
          </button>
        </div>

        {enableMerge && (
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-3">
            {/* Transition Controls directly on All-in-One page */}
            <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5" />
                  Hiệu ứng Chuyển Cảnh (Transitions):
                </span>
                <span className="text-[11px] font-mono text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-700/40">
                  {ALL_TRANSITIONS.find((t) => t.id === selectedTransition)?.name || 'Fade'} ({transitionDuration}s)
                </span>
              </div>

              {/* Quick Transition Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {[
                  { id: 'auto', name: 'Auto Pool', icon: '🎲' },
                  { id: 'fade', name: 'Fade', icon: '🌟' },
                  { id: 'fadeblack', name: 'Fade Black', icon: '🖤' },
                  { id: 'fadewhite', name: 'Fade White', icon: '🤍' },
                  { id: 'dissolve', name: 'Dissolve', icon: '🌊' },
                  { id: 'smoothleft', name: 'Smooth Left', icon: '⬅️' },
                  { id: 'smoothright', name: 'Smooth Right', icon: '➡️' },
                  { id: 'circlecrop', name: 'Circle Crop', icon: '⭕' },
                ].map((tr) => {
                  const isSel = selectedTransition === tr.id;
                  return (
                    <button
                      key={tr.id}
                      type="button"
                      onClick={() => {
                        setSelectedTransition(tr.id);
                        onToggleAutoTransitions(tr.id === 'auto');
                      }}
                      className={`p-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all ${
                        isSel
                          ? 'bg-indigo-600 text-white border-indigo-400 shadow-sm'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span>{tr.icon}</span>
                      <span className="truncate">{tr.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Full Transition Dropdown Picker */}
              <div className="flex items-center gap-2 pt-1 text-xs">
                <span className="text-slate-400 text-[11px] shrink-0">Tất cả 30 kiểu:</span>
                <select
                  value={selectedTransition}
                  onChange={(e) => {
                    setSelectedTransition(e.target.value);
                    onToggleAutoTransitions(e.target.value === 'auto');
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
                >
                  <optgroup label="Tự động thông minh">
                    <option value="auto">🎲 Auto Smart Pool (Đổi kiểu luân phiên)</option>
                  </optgroup>
                  <optgroup label="Kinh điển & Điện ảnh">
                    <option value="fade">🌟 Fade (Mờ dần)</option>
                    <option value="fadeblack">🖤 Fade Black (Mờ qua đen điện ảnh)</option>
                    <option value="fadewhite">🤍 Fade White (Chớp sáng trắng)</option>
                    <option value="dissolve">🌊 Dissolve (Hòa tan mềm mại)</option>
                  </optgroup>
                  <optgroup label="Lướt êm (Smooth)">
                    <option value="smoothleft">⬅️ Smooth Left (Lướt êm sang trái)</option>
                    <option value="smoothright">➡️ Smooth Right (Lướt êm sang phải)</option>
                    <option value="smoothup">⬆️ Smooth Up (Lướt êm lên trên)</option>
                    <option value="smoothdown">⬇️ Smooth Down (Lướt êm xuống dưới)</option>
                  </optgroup>
                  <optgroup label="Trượt cảnh (Slide)">
                    <option value="slideleft">⏪ Slide Left (Trượt sang trái)</option>
                    <option value="slideright">⏩ Slide Right (Trượt sang phải)</option>
                    <option value="slideup">🔼 Slide Up (Trượt lên trên)</option>
                    <option value="slidedown">🔽 Slide Down (Trượt xuống dưới)</option>
                  </optgroup>
                  <optgroup label="Gạt hình (Wipe)">
                    <option value="wipeleft">🪟 Wipe Left (Gạt sang trái)</option>
                    <option value="wiperight">🪟 Wipe Right (Gạt sang phải)</option>
                    <option value="wipeup">🪟 Wipe Up (Gạt lên)</option>
                    <option value="wipedown">🪟 Wipe Down (Gạt xuống)</option>
                  </optgroup>
                  <optgroup label="Hình học & Hiệu ứng đỉnh cao">
                    <option value="circlecrop">⭕ Circle Crop (Thu tròn vào tâm)</option>
                    <option value="circleopen">🔘 Circle Open (Mở rộng vòng tròn)</option>
                    <option value="circleclose">🔴 Circle Close (Đóng vòng tròn)</option>
                    <option value="rectcrop">🔲 Rect Crop (Thu khung chữ nhật)</option>
                    <option value="zoomin">💥 Zoom In (Phóng to bùng nổ)</option>
                    <option value="pixelize">👾 Pixelize (Hiệu ứng điểm ảnh Pixel)</option>
                    <option value="radial">💫 Radial Clock (Quét quạt 360)</option>
                    <option value="hblur">🌫️ H-Blur (Mờ chuyển động ngang)</option>
                    <option value="squeezeh">↔️ Squeeze H (Co giãn ngang)</option>
                    <option value="squeezev">↕️ Squeeze V (Co giãn dọc)</option>
                    <option value="hlslice">🥢 H-Slice (Cắt lát sọc ngang)</option>
                    <option value="distance">🌌 Distance (Chiều sâu 3D)</option>
                    <option value="none">🎬 None (Cắt thẳng không chuyển cảnh)</option>
                  </optgroup>
                </select>
              </div>

              {/* Transition Duration Slider */}
              <div className="flex items-center justify-between gap-3 pt-1 text-xs border-t border-slate-800/60">
                <span className="text-slate-400 text-[11px] shrink-0">Thời lượng chuyển cảnh:</span>
                <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                  <input
                    type="range"
                    min={0.3}
                    max={1.5}
                    step={0.05}
                    value={transitionDuration}
                    onChange={(e) => setTransitionDuration(Number(e.target.value))}
                    className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <span className="font-mono text-indigo-300 text-xs font-bold w-10 text-right">
                    {transitionDuration}s
                  </span>
                </div>
              </div>
            </div>

            {/* Hidden file input for adding clips directly */}
            <input
              type="file"
              ref={fileInputRef}
              multiple
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  onAddFiles?.(e.target.files);
                  e.target.value = '';
                }
              }}
            />

            {/* Ordered List of Clips */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="font-semibold text-slate-300">
                  Thứ tự phát ({mergeItems.length} video):
                </span>
                <span className="text-[10px] text-slate-500">Đoạn trước ➔ Đoạn sau</span>
              </div>

              {mergeItems.map((item, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === mergeItems.length - 1;
                const isTrimmed =
                  item.trimConfig &&
                  (item.trimConfig.startTime > 0 ||
                    item.trimConfig.endTime < item.video.metadata.duration);
                const effectiveDur = isTrimmed && item.trimConfig
                  ? item.trimConfig.endTime - item.trimConfig.startTime
                  : item.video.metadata.duration;

                return (
                  <div
                    key={item.video.id || idx}
                    className="p-2 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-2 text-xs hover:border-slate-700 transition-all"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-5 h-5 rounded-md bg-indigo-600/30 text-indigo-300 font-bold flex items-center justify-center text-[10px] shrink-0 border border-indigo-500/30">
                        #{idx + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-white truncate max-w-[140px] sm:max-w-[170px]">
                            {item.video.name}
                          </p>
                          {isFirst && (
                            <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded font-medium shrink-0">
                              Đầu tiên
                            </span>
                          )}
                          {isLast && mergeItems.length > 1 && (
                            <span className="text-[9px] px-1.5 py-0.2 bg-amber-500/20 text-amber-300 rounded font-medium shrink-0">
                              Cuối cùng
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 flex items-center gap-1">
                          {isTrimmed && item.trimConfig ? (
                            <span className="text-amber-300 font-medium">
                              ✂️ Đã cắt: {effectiveDur.toFixed(1)}s (gốc {item.video.metadata.duration.toFixed(1)}s)
                            </span>
                          ) : (
                            <span>{effectiveDur.toFixed(1)}s • {item.video.metadata.width}x{item.video.metadata.height}</span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        disabled={isFirst}
                        onClick={() => handleMoveClip(idx, -1)}
                        title="Đưa video lên trước"
                        className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={isLast}
                        onClick={() => handleMoveClip(idx, 1)}
                        title="Đưa video xuống sau"
                        className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCutSpecificClip(item.video)}
                        title="Cắt đoạn cho video này (bỏ intro/outro)"
                        className="p-1 rounded-lg hover:bg-indigo-950 text-indigo-400 hover:text-indigo-300"
                      >
                        <Scissors className="w-3.5 h-3.5" />
                      </button>
                      {mergeItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveClip(idx)}
                          title="Xóa khỏi danh sách ghép"
                          className="p-1 rounded-lg hover:bg-rose-950/60 text-slate-500 hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Inline Add Video Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-950 hover:bg-slate-900 border border-dashed border-indigo-500/30 text-indigo-300 hover:text-white text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm video vào danh sách ghép</span>
            </button>
          </div>
        )}
      </div>

      {/* Feature 4: Thêm Chữ / Subtitles (Text Overlays) */}
      <div
        className={`rounded-2xl border p-3 transition-all ${
          enableText
            ? 'bg-slate-900/80 border-pink-500/40 shadow-sm shadow-pink-500/10'
            : 'bg-slate-950/40 border-slate-800/60 opacity-80'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={enableText}
              onChange={(e) => setEnableText(e.target.checked)}
              className="w-4 h-4 rounded border-slate-700 text-pink-500 focus:ring-pink-500 bg-slate-900 cursor-pointer"
            />
            <div className="flex items-center gap-2">
              <Type className="w-4 h-4 text-pink-400" />
              <span className="text-xs font-bold text-slate-200">
                4. Thêm Chữ ({textItems.length} lớp chữ)
              </span>
            </div>
          </label>

          <button
            type="button"
            onClick={() => onSwitchToolTab('text')}
            className="flex items-center gap-1 text-[11px] font-semibold text-pink-400 hover:text-pink-300 px-2 py-1 rounded-lg bg-pink-950/40 border border-pink-500/20"
          >
            <Sliders className="w-3 h-3" />
            <span>Tùy chỉnh Font</span>
          </button>
        </div>

        {enableText && (
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-2.5">
            {textItems.length > 0 ? (
              <div className="space-y-1.5">
                {textItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-950/60 border border-slate-800 text-xs"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-pink-500/20 text-pink-300 text-[10px] font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span className="truncate text-slate-200 font-medium">{item.text}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0 font-semibold">
                      {item.fontFamily} • {item.animation}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nhập chữ cần chèn vào video..."
                  value={quickText}
                  onChange={(e) => setQuickText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddQuickText()}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-pink-500"
                />
                <button
                  type="button"
                  onClick={handleAddQuickText}
                  className="px-3 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold shrink-0"
                >
                  Thêm
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary Box */}
      <div className="rounded-2xl p-3 bg-gradient-to-r from-slate-900 to-indigo-950/40 border border-indigo-500/30 text-xs space-y-1.5">
        <div className="flex items-center gap-1.5 font-bold text-slate-200">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>Quy trình xử lý trọn gói (1 lần duy nhất):</span>
        </div>
        <ul className="text-[11px] text-slate-400 space-y-1 pl-5 list-disc">
          {enableTrim ? (
            <li>Cắt video: từ {trimConfig.startTime.toFixed(1)}s đến {trimConfig.endTime.toFixed(1)}s</li>
          ) : (
            <li className="text-slate-500">Không cắt độ dài (giữ nguyên gốc)</li>
          )}
          {enableWatermark ? (
            <li>Khử Watermark vùng NotebookLM / logo bằng thuật toán {watermarkConfig.method}</li>
          ) : (
            <li className="text-slate-500">Không xóa watermark</li>
          )}
          {enableMerge && mergeItems.length > 1 ? (
            <li>Ghép {mergeItems.length} video với chuyển cảnh xfade tự động mượt mà</li>
          ) : (
            <li className="text-slate-500">Không ghép video (xử lý video hiện tại)</li>
          )}
          {enableText && textItems.some((t) => t.text.trim().length > 0) ? (
            <li>Chèn {textItems.length} lớp chữ động chuẩn Google Fonts vào video</li>
          ) : (
            <li className="text-slate-500">Không chèn chữ</li>
          )}
        </ul>
      </div>

      {/* Preview Master Button */}
      <button
        type="button"
        onClick={onOpenPreviewModal}
        className="w-full min-h-[46px] flex items-center justify-center gap-2 py-3 px-5 rounded-2xl bg-indigo-950/40 hover:bg-indigo-900/60 text-indigo-300 hover:text-white border border-indigo-500/40 font-bold text-xs sm:text-sm shadow-lg shadow-black/40 transition-all hover:scale-[1.01] active:scale-[0.99]"
      >
        <Eye className="w-4 h-4 text-indigo-400" />
        <span>👁️ Xem Lại Toàn Bộ Video Trước Khi Xuất</span>
      </button>

      {/* Primary Action Button */}
      <button
        type="button"
        disabled={isProcessing}
        onClick={handleRunAllInOne}
        className="w-full min-h-[50px] flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-amber-500 via-indigo-600 to-pink-600 hover:from-amber-400 hover:via-indigo-500 hover:to-pink-500 text-white font-bold text-sm shadow-xl shadow-indigo-900/40 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Play className="w-4 h-4 fill-white" />
        <span>🚀 Xuất Video Trọn Gói 1 Lần (All-in-One)</span>
      </button>
    </div>
  );
};
