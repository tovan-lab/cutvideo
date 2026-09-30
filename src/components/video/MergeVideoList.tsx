import React, { useRef, useState } from 'react';
import {
  Layers,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Film,
  Clock,
  Sparkles,
  Sliders,
  ChevronDown,
  Check,
  Zap,
} from 'lucide-react';
import { MergeItem, TransitionType, VideoItem, VideoTransition } from '../../types/video';

interface MergeVideoListProps {
  items: MergeItem[];
  onItemsChange: (items: MergeItem[]) => void;
  onAddFiles: (files: FileList) => void;
  onSelectPreview: (video: VideoItem) => void;
  selectedPreviewId?: string;
  autoTransitions: boolean;
  onToggleAutoTransitions: (auto: boolean) => void;
}

const TRANSITIONS: Array<{ id: TransitionType; label: string; desc: string }> = [
  { id: 'fade', label: 'Fade Mờ Dần', desc: 'Chuyển cảnh mờ cổ điển' },
  { id: 'dissolve', label: 'Hòa Tan (Dissolve)', desc: 'Hai khung hình hòa lẫn mượt mà' },
  { id: 'smoothleft', label: 'Lướt Mượt Trái (Smooth Left)', desc: 'Chuyển động lướt mềm cinematic' },
  { id: 'smoothright', label: 'Lướt Mượt Phải (Smooth Right)', desc: 'Chuyển động lướt mềm sang phải' },
  { id: 'zoomin', label: 'Phóng To (Zoom In)', desc: 'Hiệu ứng thu phóng năng động' },
  { id: 'slideleft', label: 'Đẩy Sang Trái (Slide Left)', desc: 'Cảnh sau đẩy cảnh trước sang trái' },
  { id: 'slideright', label: 'Đẩy Sang Phải (Slide Right)', desc: 'Cảnh sau đẩy cảnh trước sang phải' },
  { id: 'slideup', label: 'Cuộn Lên (Slide Up)', desc: 'Lướt từ dưới lên trên' },
  { id: 'circlecrop', label: 'Vòng Tròn Thu Nhỏ', desc: 'Vòng tròn thu hẹp sang cảnh kế' },
  { id: 'circleopen', label: 'Vòng Tròn Mở Ra', desc: 'Vòng tròn mở rộng sang cảnh kế' },
  { id: 'fadeblack', label: 'Nháy Đen (Fade Black)', desc: 'Mờ qua màu đen điện ảnh' },
  { id: 'pixelize', label: 'Pixelize', desc: 'Hạt vỡ pixel phong cách retro' },
  { id: 'none', label: 'Cắt Thẳng (Hard Cut)', desc: 'Chuyển cảnh tức thì không hiệu ứng' },
];

export const MergeVideoList: React.FC<MergeVideoListProps> = ({
  items,
  onItemsChange,
  onAddFiles,
  onSelectPreview,
  selectedPreviewId,
  autoTransitions,
  onToggleAutoTransitions,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingTransitionIdx, setEditingTransitionIdx] = useState<number | null>(null);

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const newItems = [...items];
    const [moved] = newItems.splice(index, 1);
    newItems.splice(targetIndex, 0, moved);

    const updated = newItems.map((item, idx) => ({ ...item, order: idx }));
    onItemsChange(updated);
  };

  const removeItem = (index: number) => {
    const newItems = items.filter((_, idx) => idx !== index);
    const updated = newItems.map((item, idx) => ({ ...item, order: idx }));
    onItemsChange(updated);
  };

  const updateItemTransition = (index: number, transition: VideoTransition) => {
    const newItems = [...items];
    newItems[index] = {
      ...newItems[index],
      transition,
    };
    onItemsChange(newItems);
  };

  const applyTransitionToAll = (transition: VideoTransition) => {
    const newItems = items.map((item) => ({
      ...item,
      transition: { ...transition },
    }));
    onItemsChange(newItems);
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const totalDuration = items.reduce(
    (acc, it) => acc + (it.video.metadata.duration || 5),
    0
  );

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-950/60 border border-indigo-700/40 flex items-center justify-center text-indigo-400">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Ghép Video & Chuyển Cảnh Mượt Mà
            </h4>
            <p className="text-[11px] text-slate-400">
              Sắp xếp thứ tự và chọn hiệu ứng chuyển cảnh tự động hoặc thủ công
            </p>
          </div>
        </div>

        {/* Total stats */}
        <div className="flex items-center gap-2 px-3 py-1 bg-slate-950 rounded-lg border border-slate-800 text-xs">
          <Clock className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-slate-400">Tổng clip:</span>
          <span className="font-semibold text-white">{items.length}</span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span className="font-mono text-indigo-300 font-semibold">{formatDuration(totalDuration)}</span>
        </div>
      </div>

      {/* Smart Automation Switch Banner */}
      <div className="p-3 rounded-xl bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-slate-950/60 border border-indigo-500/30 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300 shrink-0">
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white flex items-center gap-1.5">
              <span>Chuyển cảnh Tự động Thông minh</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono">
                Auto Smart Mix
              </span>
            </p>
            <p className="text-[10px] text-slate-400 truncate">
              {autoTransitions
                ? 'Hệ thống tự động phân bổ hiệu ứng chuyển cảnh mượt mà nhất (SmoothLeft, Dissolve, Fade, ZoomIn)'
                : 'Đang dùng chế độ tùy chỉnh hiệu ứng riêng cho từng phân đoạn'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onToggleAutoTransitions(!autoTransitions)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            autoTransitions ? 'bg-indigo-600' : 'bg-slate-800'
          }`}
          title="Bật/Tắt tự động chuyển cảnh mượt mà"
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
              autoTransitions ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Clip List with Inter-clip Transitions */}
      <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-slate-800 rounded-xl bg-slate-950/40 text-slate-500 text-xs">
            Chưa có video nào trong danh sách ghép. Bấm nút Thêm video bên dưới.
          </div>
        ) : (
          items.map((item, index) => {
            const isSelected = selectedPreviewId === item.video.id;
            const currentTransition: VideoTransition = item.transition || {
              type: 'fade',
              duration: 0.75,
            };

            return (
              <React.Fragment key={item.video.id + index}>
                {/* Transition Junction between clips (shown before items 1, 2, ... N-1) */}
                {index > 0 && (
                  <div className="relative py-1 flex items-center justify-center">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-dashed border-slate-800"></div>
                    </div>

                    <div className="relative z-10">
                      {autoTransitions ? (
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-950/80 border border-indigo-500/40 text-[10px] font-medium text-indigo-300 shadow-md backdrop-blur-sm">
                          <Zap className="w-3 h-3 text-amber-400" />
                          <span>Chuyển cảnh Tự động mượt mà (0.75s)</span>
                        </div>
                      ) : (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setEditingTransitionIdx(
                                editingTransitionIdx === index ? null : index
                              )
                            }
                            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-700 hover:border-indigo-500 text-[11px] font-medium text-slate-200 shadow-md transition-all active:scale-95"
                          >
                            <Sparkles className="w-3 h-3 text-indigo-400" />
                            <span>
                              Hiệu ứng:{' '}
                              <strong className="text-indigo-300">
                                {TRANSITIONS.find((t) => t.id === currentTransition.type)?.label ||
                                  currentTransition.type}
                              </strong>
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              ({currentTransition.duration}s)
                            </span>
                            <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5" />
                          </button>

                          {/* Transition Dropdown Popover */}
                          {editingTransitionIdx === index && (
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 w-72 p-3 bg-slate-950 border border-slate-700 rounded-2xl shadow-2xl z-30 space-y-3">
                              <div className="flex items-center justify-between text-xs font-semibold text-slate-200 border-b border-slate-800 pb-2">
                                <span>Chọn hiệu ứng nối clip {index} ➔ {index + 1}</span>
                                <button
                                  type="button"
                                  onClick={() => setEditingTransitionIdx(null)}
                                  className="text-slate-400 hover:text-white"
                                >
                                  ✕
                                </button>
                              </div>

                              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                {TRANSITIONS.map((tr) => (
                                  <button
                                    key={tr.id}
                                    type="button"
                                    onClick={() => {
                                      updateItemTransition(index, {
                                        ...currentTransition,
                                        type: tr.id,
                                      });
                                    }}
                                    className={`w-full flex items-center justify-between p-1.5 rounded-lg text-left text-xs transition-colors ${
                                      currentTransition.type === tr.id
                                        ? 'bg-indigo-600 text-white font-semibold'
                                        : 'hover:bg-slate-900 text-slate-300'
                                    }`}
                                  >
                                    <div>
                                      <p className="text-xs">{tr.label}</p>
                                      <p className="text-[10px] text-slate-400 truncate">{tr.desc}</p>
                                    </div>
                                    {currentTransition.type === tr.id && (
                                      <Check className="w-3.5 h-3.5 shrink-0" />
                                    )}
                                  </button>
                                ))}
                              </div>

                              {/* Duration Slider */}
                              <div className="space-y-1 pt-1 border-t border-slate-800">
                                <div className="flex items-center justify-between text-[11px] text-slate-400">
                                  <span>Thời lượng chuyển cảnh:</span>
                                  <span className="font-mono text-indigo-300">
                                    {currentTransition.duration}s
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min={0.3}
                                  max={2.0}
                                  step={0.1}
                                  value={currentTransition.duration}
                                  onChange={(e) =>
                                    updateItemTransition(index, {
                                      ...currentTransition,
                                      duration: Number(e.target.value),
                                    })
                                  }
                                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                />
                              </div>

                              {/* Apply to All Button */}
                              <button
                                type="button"
                                onClick={() => {
                                  applyTransitionToAll(currentTransition);
                                  setEditingTransitionIdx(null);
                                }}
                                className="w-full py-1.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-indigo-300 hover:text-indigo-200 text-[11px] font-semibold border border-indigo-900/50 transition-colors"
                              >
                                Áp dụng hiệu ứng này cho toàn bộ video
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Video Clip Card */}
                <div
                  className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-indigo-950/20 border-indigo-500/50 text-white shadow-sm'
                      : 'bg-slate-950/60 border-slate-800/70 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div
                    className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                    onClick={() => onSelectPreview(item.video)}
                  >
                    <span className="w-5 h-5 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-mono font-medium text-slate-400 flex items-center justify-center shrink-0">
                      {index + 1}
                    </span>
                    <Film className="w-4 h-4 text-indigo-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{item.video.name}</p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-0.5">
                        <span>{formatDuration(item.video.metadata.duration)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.video.metadata.aspectRatio}</span>
                        <span aria-hidden="true">·</span>
                        <span>{(item.video.metadata.sizeBytes / (1024 * 1024)).toFixed(1)}MB</span>
                      </div>
                    </div>
                  </div>

                  {/* Reorder and remove buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveItem(index, 'up')}
                      className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
                      title="Di chuyển lên trên"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={index === items.length - 1}
                      onClick={() => moveItem(index, 'down')}
                      className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
                      title="Di chuyển xuống dưới"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="p-1 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 ml-1"
                      title="Xóa khỏi danh sách"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
      </div>

      {/* Add more clips action */}
      <div>
        <input
          type="file"
          ref={fileInputRef}
          multiple
          accept="video/mp4,video/quicktime,video/webm"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onAddFiles(e.target.files);
            }
          }}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl border border-dashed border-slate-700 hover:border-indigo-500 bg-slate-950/40 hover:bg-slate-900/60 text-xs font-medium text-slate-300 hover:text-white transition-all"
        >
          <Plus className="w-4 h-4 text-indigo-400" />
          <span>Thêm video clip vào danh sách</span>
        </button>
      </div>
    </div>
  );
};
