import React from 'react';
import { Loader2, X, CheckCircle2, Film } from 'lucide-react';
import { ProcessingProgress } from '../../types/video';

interface ProcessingModalProps {
  isOpen: boolean;
  progress: ProcessingProgress | null;
  onCancel: () => void;
}

export const ProcessingModal: React.FC<ProcessingModalProps> = ({
  isOpen,
  progress,
  onCancel,
}) => {
  if (!isOpen || !progress) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-950/70 border border-indigo-700/40 flex items-center justify-center text-indigo-400">
              <Film className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Đang xử lý video</h3>
              <p className="text-xs text-slate-400">Vui lòng không đóng cửa sổ trình duyệt</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
            title="Hủy thao tác"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar & Percentage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-medium">{progress.message}</span>
            <span className="font-mono font-bold text-indigo-400">{progress.percent}%</span>
          </div>

          <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800/80 p-0.5">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full transition-all duration-150 ease-out"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>

        {/* Pipeline Details */}
        <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/60 grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-[11px] text-slate-500 block">Trạng thái luồng</span>
            <span className="font-medium text-slate-300 capitalize">{progress.stage}</span>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 block">Thời gian xử lý</span>
            <span className="font-mono text-slate-300">
              {progress.elapsedSeconds ? `${progress.elapsedSeconds}s` : 'Đang tính...'}
            </span>
          </div>
          {progress.totalFrames && (
            <div className="col-span-2 pt-1 border-t border-slate-900">
              <span className="text-[11px] text-slate-500">Khung hình: </span>
              <span className="font-mono text-slate-300">
                {progress.currentFrame} / {progress.totalFrames} frames
              </span>
            </div>
          )}
        </div>

        {/* Cancel Action */}
        <div className="pt-1 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-xl transition-colors"
          >
            Hủy bỏ xử lý
          </button>
        </div>
      </div>
    </div>
  );
};
