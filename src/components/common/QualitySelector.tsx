import React, { useState } from 'react';
import { OutputQuality } from '../../types/video';
import { Sliders, HelpCircle, Check, Info } from 'lucide-react';

interface QualitySelectorProps {
  value: OutputQuality;
  onChange: (q: OutputQuality) => void;
  compact?: boolean;
}

export const QualitySelector: React.FC<QualitySelectorProps> = ({
  value,
  onChange,
  compact = false,
}) => {
  const [showInfo, setShowInfo] = useState(false);

  const options: Array<{ id: OutputQuality; label: string; desc: string }> = [
    {
      id: 'original',
      label: 'Original / Gốc',
      desc: 'Giữ nguyên FPS, bitrate & độ phân giải tối đa (Không re-encode khi có thể)',
    },
    {
      id: '1080p',
      label: '1080p FHD',
      desc: 'Chuẩn sắc nét Full HD (1920x1080) cho YouTube & màn hình lớn',
    },
    {
      id: '720p',
      label: '720p HD',
      desc: 'Kích thước nhẹ hơn, thích hợp chia sẻ nhanh qua tin nhắn',
    },
  ];

  if (compact) {
    return (
      <div className="relative inline-flex items-center gap-1.5 text-xs text-slate-300 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5">
        <Sliders className="w-3.5 h-3.5 text-indigo-400" />
        <span className="text-slate-400">Xuất:</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as OutputQuality)}
          className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer pr-1"
        >
          <option value="original" className="bg-slate-900 text-white">Original (Gốc)</option>
          <option value="1080p" className="bg-slate-900 text-white">1080p FHD</option>
          <option value="720p" className="bg-slate-900 text-white">720p HD</option>
        </select>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-semibold text-slate-200 tracking-wide uppercase">
            Chất lượng xuất (Output Quality)
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowInfo(!showInfo)}
          className="text-slate-400 hover:text-slate-200 text-xs flex items-center gap-1 transition-colors"
          title="Thông tin kiến trúc chất lượng"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Tiêu chuẩn</span>
        </button>
      </div>

      {showInfo && (
        <div className="p-2.5 bg-indigo-950/30 border border-indigo-800/30 rounded-lg text-xs text-indigo-200/90 leading-relaxed flex items-start gap-2">
          <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <div>
            Hệ thống ưu tiên luồng xử lý <strong>Lossless Stream Copy</strong> khi cắt video. Mặc định giữ nguyên 100% độ phân giải, FPS và audio của file gốc mà không qua re-encode nhiều lần.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {options.map((opt) => {
          const isSelected = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`text-left p-2.5 rounded-lg border transition-all flex flex-col justify-between ${
                isSelected
                  ? 'bg-indigo-600/15 border-indigo-500/60 text-white shadow-sm'
                  : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:border-slate-700 hover:text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className={`text-xs font-semibold ${isSelected ? 'text-indigo-300' : 'text-slate-300'}`}>
                  {opt.label}
                </span>
                {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400" />}
              </div>
              <span className="text-[11px] leading-tight text-slate-500">
                {opt.desc}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
