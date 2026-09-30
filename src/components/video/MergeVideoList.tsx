import React, { useRef } from 'react';
import { Layers, Plus, Trash2, ArrowUp, ArrowDown, Film, Clock } from 'lucide-react';
import { MergeItem, VideoItem } from '../../types/video';

interface MergeVideoListProps {
  items: MergeItem[];
  onItemsChange: (items: MergeItem[]) => void;
  onAddFiles: (files: FileList) => void;
  onSelectPreview: (video: VideoItem) => void;
  selectedPreviewId?: string;
}

export const MergeVideoList: React.FC<MergeVideoListProps> = ({
  items,
  onItemsChange,
  onAddFiles,
  onSelectPreview,
  selectedPreviewId,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const newItems = [...items];
    const [moved] = newItems.splice(index, 1);
    newItems.splice(targetIndex, 0, moved);

    // Re-assign order numbers
    const updated = newItems.map((item, idx) => ({ ...item, order: idx }));
    onItemsChange(updated);
  };

  const removeItem = (index: number) => {
    const newItems = items.filter((_, idx) => idx !== index);
    const updated = newItems.map((item, idx) => ({ ...item, order: idx }));
    onItemsChange(updated);
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
              Công cụ Ghép Video (Merge Sequence)
            </h4>
            <p className="text-[11px] text-slate-400">
              Sắp xếp thứ tự các clip để ghép nối thành video liền mạch
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

      {/* Clip List */}
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-slate-800 rounded-xl bg-slate-950/40 text-slate-500 text-xs">
            Chưa có video nào trong danh sách ghép. Bấm nút Thêm video bên dưới.
          </div>
        ) : (
          items.map((item, index) => {
            const isSelected = selectedPreviewId === item.video.id;
            return (
              <div
                key={item.video.id + index}
                className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border transition-all ${
                  isSelected
                    ? 'bg-indigo-950/20 border-indigo-500/50 text-white'
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
