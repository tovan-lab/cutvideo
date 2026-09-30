import React from 'react';
import { X, Check, Sliders, Info, Shield, Cpu, Layers } from 'lucide-react';
import { OutputQuality } from '../../types/video';

interface QualityModalProps {
  isOpen: boolean;
  onClose: () => void;
  quality: OutputQuality;
  onSelectQuality: (q: OutputQuality) => void;
}

export const QualityModal: React.FC<QualityModalProps> = ({
  isOpen,
  onClose,
  quality,
  onSelectQuality,
}) => {
  if (!isOpen) return null;

  const options: Array<{
    id: OutputQuality;
    title: string;
    subtitle: string;
    details: string[];
    isDefault?: boolean;
  }> = [
    {
      id: 'original',
      title: 'Original / Maximum Quality (Khuyên dùng)',
      subtitle: 'Giữ nguyên 100% thông số của file video đầu vào',
      details: [
        'Stream copy không nén lại khi cắt ghép cơ bản',
        'Bảo lưu nguyên vẹn FPS gốc (24/30/60 fps)',
        'Giữ nguyên color space và độ chi tiết pixel',
        'Audio pass-through chất lượng cao (AAC/Opus)',
      ],
      isDefault: true,
    },
    {
      id: '1080p',
      title: '1080p FHD (1920 × 1080)',
      subtitle: 'Độ phân giải chuẩn Full HD cho YouTube & Facebook',
      details: [
        'Độ sắc nét cao trên màn hình máy tính và TV',
        'Tương thích toàn diện với tất cả thiết bị phát',
        'Tỷ lệ khung hình chuẩn 16:9 hoặc 9:16 tùy nguồn',
      ],
    },
    {
      id: '720p',
      title: '720p HD (1280 × 720)',
      subtitle: 'Dung lượng nhẹ, tải lên và chia sẻ nhanh',
      details: [
        'Giảm khoảng 40-50% dung lượng tập tin',
        'Thích hợp gửi qua Zalo, Messenger, Email',
        'Tiết kiệm băng thông di động',
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-950/60 border border-indigo-700/40 flex items-center justify-center text-indigo-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Thiết lập chất lượng xuất video
              </h3>
              <p className="text-[11px] text-slate-400">
                Tiêu chuẩn encode bảo toàn độ phân giải và chất lượng
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options */}
        <div className="space-y-2.5">
          {options.map((opt) => {
            const isSelected = quality === opt.id;
            return (
              <div
                key={opt.id}
                onClick={() => {
                  onSelectQuality(opt.id);
                  onClose();
                }}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-indigo-950/30 border-indigo-500/70 text-white shadow-sm'
                    : 'bg-slate-950/50 border-slate-800/80 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">
                      {opt.title}
                    </span>
                    {opt.isDefault && (
                      <span className="text-[10px] text-indigo-400 font-mono">
                        (Mặc định)
                      </span>
                    )}
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-indigo-400" />}
                </div>

                <p className="text-[11px] text-slate-400 mb-2">{opt.subtitle}</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-slate-500">
                  {opt.details.map((d, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-slate-600" />
                      <span>{d}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-950/60 border border-indigo-700/40 flex items-center justify-center text-indigo-400">
              <Info className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Kiến trúc Personal Video Tool
              </h3>
              <p className="text-[11px] text-slate-400">
                Phiên bản Foundation Phase · Thiết kế module tách biệt
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
            <div className="flex items-center gap-2 text-indigo-300 font-semibold">
              <Cpu className="w-3.5 h-3.5" />
              <span>Động cơ FFmpeg WASM + Browser Media Engine</span>
            </div>
            <p className="text-slate-400 text-[11px]">
              Tích hợp FFmpeg WebAssembly xử lý video trực tiếp 100% trong trình duyệt. Hỗ trợ Fast Stream Copy (-c copy) cắt và nối không nén lại (lossless, siêu tốc), cùng cơ chế tự động chuyển đổi dự phòng (fallback) sang Browser Media Engine.
            </p>
          </div>

          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
            <div className="flex items-center gap-2 text-indigo-300 font-semibold">
              <Layers className="w-3.5 h-3.5" />
              <span>Gemini 3.5 Transcribe & 3.8 Flash (Unified Understanding)</span>
            </div>
            <p className="text-slate-400 text-[11px]">
              Kết hợp trích xuất âm thanh và phiên âm giọng nói (Speech-to-Text) kèm mốc thời gian (Timestamps), xuất phụ đề SRT/VTT/TXT, đồng thời phân tích khung hình đa phương thức (Visual Keyframes) để hiểu trọn vẹn ngữ cảnh video.
            </p>
          </div>

          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
            <div className="flex items-center gap-2 text-indigo-300 font-semibold">
              <Shield className="w-3.5 h-3.5" />
              <span>Bảo mật dữ liệu cá nhân & Không lưu trữ đám mây</span>
            </div>
            <p className="text-slate-400 text-[11px]">
              Toàn bộ file video gốc được xử lý cục bộ ngay trên thiết bị của bạn mà không cần tải lên bất kỳ máy chủ video nào.
            </p>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
          >
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  );
};
