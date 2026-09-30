import React, { useState, useEffect, useRef } from 'react';
import {
  Eraser,
  Eye,
  EyeOff,
  Move,
  RotateCcw,
  Sparkles,
  Layers,
  AlertTriangle,
  Play,
  Sliders,
  Maximize2,
  Info,
  CheckCircle,
  Cpu,
  ShieldAlert,
  Clock,
  Film,
  XCircle,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { BoundingBox, MergeItem, ObjectRemovalConfig, ObjectRemovalMethod } from '../../types/video';
import { aiInpaintingClientService, InpaintingHealthStatus } from '../../services/aiInpaintingService';

interface ObjectRemovalSelectorProps {
  config: ObjectRemovalConfig;
  onChange: (config: ObjectRemovalConfig) => void;
  onPreview3s?: () => void;
  isPreviewing?: boolean;
  mergeItems?: MergeItem[];
  currentTime?: number;
  totalDuration?: number;
}

export const ObjectRemovalSelector: React.FC<ObjectRemovalSelectorProps> = ({
  config,
  onChange,
  onPreview3s,
  isPreviewing = false,
  mergeItems = [],
  currentTime = 0,
  totalDuration = 10,
}) => {
  const [showAiEngineModal, setShowAiEngineModal] = useState(false);
  const [healthStatus, setHealthStatus] = useState<InpaintingHealthStatus | null>(null);

  // Check health on mount
  useEffect(() => {
    aiInpaintingClientService.checkHealth().then((status) => {
      setHealthStatus(status);
    });
  }, []);

  const setPreset = (preset: 'notebooklm-916' | 'notebooklm-169' | 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left' | 'center') => {
    let area: BoundingBox;
    switch (preset) {
      case 'notebooklm-916':
        area = { x: 70, y: 95.2, width: 28, height: 3.8 };
        break;
      case 'notebooklm-169':
        area = { x: 88, y: 95.2, width: 11.2, height: 3.8 };
        break;
      case 'top-right':
        area = { x: 72, y: 5, width: 23, height: 12 };
        break;
      case 'bottom-right':
        area = { x: 70, y: 95.2, width: 28, height: 3.8 };
        break;
      case 'top-left':
        area = { x: 5, y: 5, width: 23, height: 12 };
        break;
      case 'bottom-left':
        area = { x: 5, y: 82, width: 23, height: 12 };
        break;
      case 'center':
        area = { x: 35, y: 40, width: 30, height: 20 };
        break;
    }
    onChange({ ...config, area });
  };

  const handleReset = () => {
    onChange({
      ...config,
      area: { x: 70, y: 95.2, width: 28, height: 3.8 },
      feather: 5,
      method: 'delogo',
    });
  };

  const isAiConfigured = Boolean(healthStatus?.configured);

  const methods: Array<{
    id: ObjectRemovalMethod;
    title: string;
    badge: string;
    badgeColor: string;
    desc: string;
    isAi?: boolean;
  }> = [
    {
      id: 'delogo',
      title: 'FFmpeg Delogo (Nội suy viền thông minh)',
      badge: 'Native FFmpeg',
      badgeColor: 'bg-indigo-950/50 text-indigo-400 border-indigo-800/40',
      desc: 'Nội suy điểm ảnh từ viền xung quanh bằng FFmpeg delogo, xóa watermark tự nhiên',
    },
    {
      id: 'blur',
      title: 'Làm mờ (Blur / Hide)',
      badge: 'Real Engine',
      badgeColor: 'bg-emerald-950/50 text-emerald-400 border-emerald-800/40',
      desc: 'Làm nhòe chi tiết logo hoặc watermark trên video gốc',
    },
    {
      id: 'cover',
      title: 'Che phủ (Cover / Matte)',
      badge: 'Real Engine',
      badgeColor: 'bg-emerald-950/50 text-emerald-400 border-emerald-800/40',
      desc: 'Phủ lớp nền màu tối hoặc matte lên vùng đối tượng',
    },
    {
      id: 'ai_inpaint',
      title: 'AI Inpainting (Tái tạo vật thể)',
      badge: isAiConfigured ? '🟢 Sẵn sàng (ProPainter AI)' : '🔴 Chưa kết nối (Not Connected)',
      badgeColor: isAiConfigured
        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50'
        : 'bg-rose-950/60 text-rose-300 border-rose-800/50',
      desc: 'Xóa vật thể và tái tạo bối cảnh nền bằng mạng nơ-ron GPU',
      isAi: true,
    },
  ];

  const featherOptions = [0, 5, 10, 20];

  const handleMethodSelect = (methodId: ObjectRemovalMethod) => {
    onChange({ ...config, method: methodId });
    if (methodId === 'ai_inpaint' && !isAiConfigured) {
      setShowAiEngineModal(true);
    }
  };

  const handleTriggerPreview = () => {
    if (config.method === 'ai_inpaint' && !isAiConfigured) {
      setShowAiEngineModal(true);
      return;
    }
    onPreview3s?.();
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-950/60 border border-indigo-700/40 flex items-center justify-center text-indigo-400">
            <Eraser className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Công cụ Xóa Logo & Vật thể
            </h4>
            <p className="text-[11px] text-slate-400">
              Kéo/resize vùng chọn trên màn hình video để thiết lập mask xử lý
            </p>
          </div>
        </div>

        {/* Mask toggle */}
        <button
          type="button"
          onClick={() => onChange({ ...config, showMaskOverlay: !config.showMaskOverlay })}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
            config.showMaskOverlay
              ? 'bg-rose-950/60 border-rose-500/50 text-rose-300'
              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          {config.showMaskOverlay ? <Eye className="w-3.5 h-3.5 text-rose-400" /> : <EyeOff className="w-3.5 h-3.5" />}
          <span>{config.showMaskOverlay ? 'Đang hiện Mask' : 'Ẩn Mask'}</span>
        </button>
      </div>

      {/* Enable / Disable Watermark Toggle Banner */}
      <div
        className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2.5 transition-all ${
          config.enabled !== false
            ? 'bg-indigo-950/40 border-indigo-700/50'
            : 'bg-slate-950/80 border-slate-800'
        }`}
      >
        <div className="flex items-center gap-2">
          {config.enabled !== false ? (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 text-slate-500 shrink-0" />
          )}
          <div>
            <p className="text-xs font-semibold text-white">
              {config.enabled !== false
                ? 'Đang bật tính năng xóa Watermark'
                : 'Đã ẩn / Bỏ qua xóa Watermark (Clip không có logo)'}
            </p>
            <p className="text-[11px] text-slate-400">
              {config.enabled !== false
                ? 'Bộ lọc sẽ xóa sạch watermark tại vùng chọn khi xuất video'
                : 'Video sẽ giữ nguyên gốc không áp dụng lớp xóa logo nào'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            onChange({
              ...config,
              enabled: config.enabled === false ? true : false,
            })
          }
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm ${
            config.enabled !== false
              ? 'bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white'
          }`}
        >
          {config.enabled !== false ? (
            <>
              <EyeOff className="w-3.5 h-3.5" />
              <span>Ẩn / Không xóa Watermark nữa</span>
            </>
          ) : (
            <>
              <Eraser className="w-3.5 h-3.5" />
              <span>Bật lại Xóa Watermark</span>
            </>
          )}
        </button>
      </div>

      {/* Target Clip & Time Range Selection */}
      {config.enabled !== false && (
        <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-3">
          {/* If multiple clips exist */}
          {mergeItems.length > 1 && (
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5 text-indigo-400" />
                Chọn video áp dụng xóa Watermark:
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => onChange({ ...config, targetClipIndex: 'all' })}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    config.targetClipIndex === 'all' || config.targetClipIndex === undefined
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  🌐 Tất cả các clip trong chuỗi
                </button>
                {mergeItems.map((item, idx) => {
                  const isSelected = config.targetClipIndex === idx;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onChange({ ...config, targetClipIndex: idx })}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all truncate max-w-[160px] ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      #{idx + 1}: {item.video.name}
                    </button>
                  );
                })}
              </div>
              {typeof config.targetClipIndex === 'number' && (
                <p className="text-[11px] text-indigo-300">
                  👉 Watermark sẽ chỉ được xóa trên <strong>Clip #{config.targetClipIndex + 1}</strong>. Các clip khác sẽ giữ nguyên không xóa logo.
                </p>
              )}
            </div>
          )}

          {/* Time range: từ mấy giây đến mấy giây */}
          <div className="space-y-2 pt-1 border-t border-slate-800/60">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                Khoảng thời gian xóa (từ mấy giây đến mấy giây):
              </span>
              <label className="flex items-center gap-1.5 text-[11px] font-normal text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.applyEntireVideo}
                  onChange={(e) => {
                    const applyAll = e.target.checked;
                    onChange({
                      ...config,
                      applyEntireVideo: applyAll,
                      timeRange: applyAll ? undefined : (config.timeRange || { startSec: 0, endSec: totalDuration }),
                    });
                  }}
                  className="rounded accent-indigo-500 cursor-pointer"
                />
                <span>Toàn bộ thời lượng</span>
              </label>
            </div>

            {!config.applyEntireVideo && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Từ giây:</span>
                    <button
                      type="button"
                      onClick={() =>
                        onChange({
                          ...config,
                          timeRange: {
                            startSec: Number(currentTime.toFixed(1)),
                            endSec: config.timeRange?.endSec ?? totalDuration,
                          },
                        })
                      }
                      className="text-[10px] text-indigo-400 hover:underline"
                    >
                      Lấy hiện tại ({currentTime.toFixed(1)}s)
                    </button>
                  </div>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    max={totalDuration}
                    value={config.timeRange?.startSec ?? 0}
                    onChange={(e) =>
                      onChange({
                        ...config,
                        timeRange: {
                          startSec: Number(e.target.value),
                          endSec: config.timeRange?.endSec ?? totalDuration,
                        },
                      })
                    }
                    className="w-full px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-white text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Đến giây:</span>
                    <button
                      type="button"
                      onClick={() =>
                        onChange({
                          ...config,
                          timeRange: {
                            startSec: config.timeRange?.startSec ?? 0,
                            endSec: Number(currentTime.toFixed(1)),
                          },
                        })
                      }
                      className="text-[10px] text-indigo-400 hover:underline"
                    >
                      Lấy hiện tại ({currentTime.toFixed(1)}s)
                    </button>
                  </div>
                  <input
                    type="number"
                    step={0.1}
                    min={(config.timeRange?.startSec ?? 0) + 0.1}
                    max={totalDuration}
                    value={config.timeRange?.endSec ?? totalDuration}
                    onChange={(e) =>
                      onChange({
                        ...config,
                        timeRange: {
                          startSec: config.timeRange?.startSec ?? 0,
                          endSec: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-white text-xs font-mono"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 1. Method Selection */}
      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 block">
          1. Phương pháp xử lý (Method)
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {methods.map((m) => {
            const isSelected = config.method === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => handleMethodSelect(m.id)}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                  isSelected
                    ? 'bg-indigo-950/40 border-indigo-500/80 text-white shadow-xs'
                    : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-xs font-semibold leading-snug">{m.title}</span>
                  </div>
                  <span
                    className={`inline-block text-[10px] font-mono px-1.5 py-0.5 rounded border mb-1.5 ${m.badgeColor}`}
                  >
                    {m.badge}
                  </span>
                  <p className="text-[11px] text-slate-400 leading-tight">{m.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* AI Inpainting Status Card when selected */}
      {config.method === 'ai_inpaint' && (
        <div
          className={`p-3.5 rounded-xl border space-y-2 text-xs transition-all ${
            isAiConfigured
              ? 'bg-emerald-950/20 border-emerald-600/40 text-emerald-200'
              : 'bg-rose-950/20 border-rose-800/40 text-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className={`w-4 h-4 ${isAiConfigured ? 'text-emerald-400' : 'text-rose-400'}`} />
              <strong className="text-white">
                {isAiConfigured
                  ? 'AI Inpainting Engine: Sẵn sàng'
                  : 'AI Inpainting Engine: Chưa kết nối API Token'}
              </strong>
            </div>
            <span className="text-[10px] font-mono text-slate-400">
              Provider: {healthStatus?.provider || 'Replicate'} ({healthStatus?.model || 'sczhou/propainter'})
            </span>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            {isAiConfigured
              ? 'Mô hình Neural Inpainting sẽ xóa watermark và tái tạo bối cảnh video trên GPU Server. Âm thanh gốc được trích xuất và ghép lại bằng FFmpeg bảo toàn 100% chất lượng.'
              : 'Chưa tìm thấy biến REPLICATE_API_TOKEN trong Settings > Secrets. Để bảo đảm tính trung thực kỹ thuật, hệ thống không giả lập AI bằng cách làm mờ. Bạn có thể sử dụng Làm mờ (Blur) hoặc Che phủ (Cover) thủ công ngay.'}
          </p>

          {!isAiConfigured && (
            <div className="pt-1 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onChange({ ...config, method: 'blur' })}
                className="px-3 py-1 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
              >
                Chuyển sang Làm mờ (Blur)
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...config, method: 'cover' })}
                className="px-3 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition border border-slate-700"
              >
                Chuyển sang Che phủ (Cover)
              </button>
            </div>
          )}
        </div>
      )}

      {/* 2. Feather Edge Setting */}
      <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-xs font-medium text-slate-300">Độ mềm mép viền (Feather Edge):</span>
          <span className="font-mono text-xs text-indigo-400 font-semibold">{config.feather}px</span>
        </div>
        <div className="flex items-center gap-1.5">
          {featherOptions.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onChange({ ...config, feather: f })}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                config.feather === f
                  ? 'bg-indigo-600 text-white font-medium'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {f === 0 ? 'Mép cứng (0px)' : `${f}px`}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Quick Placement Presets & Mobile Nudge */}
      <div className="space-y-2">
        <div className="text-[11px] text-slate-400 flex items-center justify-between">
          <span className="font-semibold text-slate-300">Vị trí đặt vùng chọn:</span>
          <span className="font-mono text-indigo-400 text-xs font-bold">
            X:{config.area.x}% Y:{config.area.y}% W:{config.area.width}% H:{config.area.height}%
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          <button
            type="button"
            onClick={() => setPreset('notebooklm-916')}
            className="px-2.5 py-2 text-xs bg-indigo-950/70 hover:bg-indigo-900/80 border border-indigo-700/60 text-indigo-300 font-semibold rounded-xl transition-all shadow-sm active:scale-95 text-center"
          >
            ⭐ NotebookLM (9:16)
          </button>
          <button
            type="button"
            onClick={() => setPreset('notebooklm-169')}
            className="px-2.5 py-2 text-xs bg-indigo-950/70 hover:bg-indigo-900/80 border border-indigo-700/60 text-indigo-300 font-semibold rounded-xl transition-all shadow-sm active:scale-95 text-center"
          >
            ⭐ NotebookLM (16:9)
          </button>
          <button
            type="button"
            onClick={() => setPreset('bottom-right')}
            className="px-2.5 py-2 text-xs bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl transition-all active:scale-95 text-center"
          >
            Góc dưới phải
          </button>
          <button
            type="button"
            onClick={() => setPreset('top-right')}
            className="px-2.5 py-2 text-xs bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl transition-all active:scale-95 text-center"
          >
            Góc trên phải
          </button>
        </div>

        {/* Mobile-Friendly Nudge & Resize Controls */}
        <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-2.5 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="font-medium text-slate-300">Tinh chỉnh từng bước (Nudge):</span>
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors"
              title="Khôi phục mặc định"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {/* Position Nudge */}
            <div className="flex items-center justify-between bg-slate-900/80 border border-slate-800 rounded-lg p-1.5">
              <span className="text-[11px] text-slate-400 font-mono">Dịch:</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onChange({ ...config, area: { ...config.area, x: Math.max(0, Number((config.area.x - 1).toFixed(1))) } })}
                  className="w-7 h-7 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 active:scale-95 font-bold"
                  title="Sang trái 1%"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ ...config, area: { ...config.area, x: Math.min(100 - config.area.width, Number((config.area.x + 1).toFixed(1))) } })}
                  className="w-7 h-7 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 active:scale-95 font-bold"
                  title="Sang phải 1%"
                >
                  →
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ ...config, area: { ...config.area, y: Math.max(0, Number((config.area.y - 1).toFixed(1))) } })}
                  className="w-7 h-7 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 active:scale-95 font-bold"
                  title="Lên trên 1%"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ ...config, area: { ...config.area, y: Math.min(100 - config.area.height, Number((config.area.y + 1).toFixed(1))) } })}
                  className="w-7 h-7 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 active:scale-95 font-bold"
                  title="Xuống dưới 1%"
                >
                  ↓
                </button>
              </div>
            </div>

            {/* Size Nudge */}
            <div className="flex items-center justify-between bg-slate-900/80 border border-slate-800 rounded-lg p-1.5">
              <span className="text-[11px] text-slate-400 font-mono">Cỡ:</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onChange({ ...config, area: { ...config.area, width: Math.max(3, Number((config.area.width - 1).toFixed(1))) } })}
                  className="px-1.5 h-7 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[10px] active:scale-95"
                  title="Giảm rộng"
                >
                  W-
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ ...config, area: { ...config.area, width: Math.min(100 - config.area.x, Number((config.area.width + 1).toFixed(1))) } })}
                  className="px-1.5 h-7 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[10px] active:scale-95"
                  title="Tăng rộng"
                >
                  W+
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ ...config, area: { ...config.area, height: Math.max(2, Number((config.area.height - 1).toFixed(1))) } })}
                  className="px-1.5 h-7 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[10px] active:scale-95"
                  title="Giảm cao"
                >
                  H-
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ ...config, area: { ...config.area, height: Math.min(100 - config.area.y, Number((config.area.height + 1).toFixed(1))) } })}
                  className="px-1.5 h-7 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[10px] active:scale-95"
                  title="Tăng cao"
                >
                  H+
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Preview Action Button */}
      {onPreview3s && (
        <div className="pt-2 flex items-center justify-between border-t border-slate-800/80">
          <div className="text-[11px] text-slate-400">
            {config.method === 'ai_inpaint'
              ? 'Xem trước 3 giây: Render thử nghiệm qua pipeline AI trước khi chạy cả video.'
              : 'Khuyên dùng: Thử nghiệm 3 giây để kiểm tra vùng mask trước khi xuất cả video.'}
          </div>
          <button
            type="button"
            disabled={isPreviewing}
            onClick={handleTriggerPreview}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 transition-colors disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-indigo-300" />
            <span>
              {isPreviewing
                ? 'Đang tạo bản xem trước...'
                : config.method === 'ai_inpaint'
                ? 'Xem trước 3s (AI)'
                : 'Xem trước 3s'}
            </span>
          </button>
        </div>
      )}

      {/* AI Inpainting Notification Modal when token not set */}
      {showAiEngineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-950/70 border border-amber-700/50 flex items-center justify-center text-amber-400 shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">
                  AI Inpainting Engine chưa được kết nối
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Kiến trúc đã sẵn sàng · Chờ kết nối API Token
                </p>
              </div>
            </div>

            <div className="bg-slate-950/80 rounded-xl p-3.5 border border-slate-800/80 text-xs text-slate-300 leading-relaxed space-y-2">
              <p>
                <strong>Nguyên tắc kỹ thuật:</strong> Tuyệt đối KHÔNG giả lập tính năng AI bằng việc làm mờ (Blur) hay che phủ (Cover).
              </p>
              <p className="text-slate-400">
                Toàn bộ backend pipeline, adapter Replicate ProPainter, FFmpeg mask generator và FFmpeg audio remuxer đã được xây dựng hoàn tất.
              </p>
              <p className="text-amber-300/90">
                Để kích hoạt GPU inference thật, bạn chỉ cần thêm token vào mục <strong>Settings &gt; Secrets</strong> với biến <code>REPLICATE_API_TOKEN</code>.
              </p>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  onChange({ ...config, method: 'blur' });
                  setShowAiEngineModal(false);
                }}
                className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors"
              >
                Chuyển sang Blur
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onChange({ ...config, method: 'cover' });
                    setShowAiEngineModal(false);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
                >
                  Chuyển sang Cover
                </button>
                <button
                  type="button"
                  onClick={() => setShowAiEngineModal(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Enhanced interactive overlay directly rendered over the video player with 4 corner resize handles
 */
export const ObjectRemovalOverlay: React.FC<{
  config: ObjectRemovalConfig;
  onChange: (config: ObjectRemovalConfig) => void;
  isPreviewMode?: boolean;
}> = ({ config, onChange, isPreviewMode = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeAction, setActiveAction] = useState<'move' | 'nw' | 'ne' | 'se' | 'sw' | null>(null);

  if (config.enabled === false) {
    return null;
  }

  if (isPreviewMode) {
    return (
      <div className="absolute inset-0 select-none pointer-events-none overflow-hidden">
        <div
          style={{
            left: `${config.area.x}%`,
            top: `${config.area.y}%`,
            width: `${config.area.width}%`,
            height: `${config.area.height}%`,
            filter: config.feather ? `blur(${Math.min(config.feather / 2, 8)}px)` : undefined,
            backgroundColor: config.method === 'cover' ? (config.coverColor || '#020617') : undefined,
          }}
          className={`absolute pointer-events-none rounded-sm ${
            config.method === 'cover'
              ? ''
              : config.method === 'blur'
              ? 'backdrop-blur-md bg-black/30'
              : 'backdrop-blur-sm bg-slate-900/40'
          }`}
        />
      </div>
    );
  }

  const startStateRef = useRef<{
    pointerX: number;
    pointerY: number;
    boxX: number;
    boxY: number;
    boxW: number;
    boxH: number;
  }>({
    pointerX: 0,
    pointerY: 0,
    boxX: config.area.x,
    boxY: config.area.y,
    boxW: config.area.width,
    boxH: config.area.height,
  });

  const handlePointerDown = (action: 'move' | 'nw' | 'ne' | 'se' | 'sw', e: React.PointerEvent) => {
    e.stopPropagation();
    setActiveAction(action);
    startStateRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      boxX: config.area.x,
      boxY: config.area.y,
      boxW: config.area.width,
      boxH: config.area.height,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeAction || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const deltaXPercent = ((e.clientX - startStateRef.current.pointerX) / rect.width) * 100;
    const deltaYPercent = ((e.clientY - startStateRef.current.pointerY) / rect.height) * 100;

    let { boxX, boxY, boxW, boxH } = startStateRef.current;

    if (activeAction === 'move') {
      boxX = Math.max(0, Math.min(100 - boxW, boxX + deltaXPercent));
      boxY = Math.max(0, Math.min(100 - boxH, boxY + deltaYPercent));
    } else if (activeAction === 'se') {
      boxW = Math.max(3, Math.min(100 - boxX, boxW + deltaXPercent));
      boxH = Math.max(2, Math.min(100 - boxY, boxH + deltaYPercent));
    } else if (activeAction === 'sw') {
      const newX = Math.max(0, Math.min(boxX + boxW - 3, boxX + deltaXPercent));
      boxW = boxW + (boxX - newX);
      boxX = newX;
      boxH = Math.max(2, Math.min(100 - boxY, boxH + deltaYPercent));
    } else if (activeAction === 'ne') {
      boxW = Math.max(3, Math.min(100 - boxX, boxW + deltaXPercent));
      const newY = Math.max(0, Math.min(boxY + boxH - 2, boxY + deltaYPercent));
      boxH = boxH + (boxY - newY);
      boxY = newY;
    } else if (activeAction === 'nw') {
      const newX = Math.max(0, Math.min(boxX + boxW - 3, boxX + deltaXPercent));
      const newY = Math.max(0, Math.min(boxY + boxH - 2, boxY + deltaYPercent));
      boxW = boxW + (boxX - newX);
      boxH = boxH + (boxY - newY);
      boxX = newX;
      boxY = newY;
    }

    onChange({
      ...config,
      area: {
        x: Number(boxX.toFixed(1)),
        y: Number(boxY.toFixed(1)),
        width: Number(boxW.toFixed(1)),
        height: Number(boxH.toFixed(1)),
      },
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setActiveAction(null);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  const isSmallHeight = config.area.height < 9;
  const isNearTop = config.area.y < 8;

  return (
    <div ref={containerRef} className="absolute inset-0 select-none pointer-events-none overflow-visible touch-none">
      {/* Visual Mask Overlay Toggle */}
      {config.showMaskOverlay && (
        <div
          style={{
            left: `${config.area.x}%`,
            top: `${config.area.y}%`,
            width: `${config.area.width}%`,
            height: `${config.area.height}%`,
            boxShadow: config.feather ? `0 0 ${config.feather * 2}px rgba(244,63,94,0.6)` : undefined,
          }}
          className="absolute bg-rose-600/40 border border-rose-400 backdrop-blur-xs pointer-events-none flex items-center justify-center text-[9px] font-mono font-bold text-white tracking-widest uppercase rounded-sm"
        >
          {config.area.height >= 7 && <span>MASK ({config.feather}px)</span>}
        </div>
      )}

      {/* Main Draggable & Resizable Bounding Box */}
      <div
        onPointerDown={(e) => handlePointerDown('move', e)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          left: `${config.area.x}%`,
          top: `${config.area.y}%`,
          width: `${config.area.width}%`,
          height: `${config.area.height}%`,
        }}
        className={`absolute pointer-events-auto touch-none border-2 border-dashed ${
          config.method === 'cover'
            ? 'border-sky-400 bg-sky-500/15'
            : config.method === 'ai_inpaint'
            ? 'border-indigo-400 bg-indigo-500/15'
            : 'border-rose-500 bg-rose-500/15'
        } backdrop-blur-2xs rounded-sm cursor-move shadow-xl group flex items-center justify-center transition-shadow`}
      >
        {/* Smart Label Placement: floats above or below if box is thin */}
        <div
          className={`absolute pointer-events-none whitespace-nowrap bg-slate-950/90 text-slate-200 px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 border border-slate-700 shadow-md ${
            isSmallHeight
              ? isNearTop
                ? '-bottom-6.5 left-1/2 -translate-x-1/2 z-30'
                : '-top-6.5 left-1/2 -translate-x-1/2 z-30'
              : 'z-10'
          }`}
        >
          <Move className="w-2.5 h-2.5 text-indigo-400 shrink-0" />
          <span>
            {config.method === 'cover'
              ? 'Che phủ'
              : config.method === 'ai_inpaint'
              ? 'AI Inpaint'
              : 'Xóa logo'}{' '}
            ({config.area.width}×{config.area.height}%)
          </span>
        </div>

        {/* 4 Interactive Corner Resize Handles with 32px Touch Areas */}
        <div
          onPointerDown={(e) => handlePointerDown('nw', e)}
          className="absolute -top-4 -left-4 w-8 h-8 flex items-center justify-center cursor-nwse-resize pointer-events-auto touch-none z-30"
          title="Kéo giãn góc trên trái"
        >
          <div className="w-3 h-3 bg-white border-2 border-rose-500 rounded-full shadow-lg group-hover:scale-125 transition-transform" />
        </div>

        <div
          onPointerDown={(e) => handlePointerDown('ne', e)}
          className="absolute -top-4 -right-4 w-8 h-8 flex items-center justify-center cursor-nesw-resize pointer-events-auto touch-none z-30"
          title="Kéo giãn góc trên phải"
        >
          <div className="w-3 h-3 bg-white border-2 border-rose-500 rounded-full shadow-lg group-hover:scale-125 transition-transform" />
        </div>

        <div
          onPointerDown={(e) => handlePointerDown('sw', e)}
          className="absolute -bottom-4 -left-4 w-8 h-8 flex items-center justify-center cursor-nesw-resize pointer-events-auto touch-none z-30"
          title="Kéo giãn góc dưới trái"
        >
          <div className="w-3 h-3 bg-white border-2 border-rose-500 rounded-full shadow-lg group-hover:scale-125 transition-transform" />
        </div>

        <div
          onPointerDown={(e) => handlePointerDown('se', e)}
          className="absolute -bottom-4 -right-4 w-8 h-8 flex items-center justify-center cursor-nwse-resize pointer-events-auto touch-none z-30"
          title="Kéo giãn góc dưới phải"
        >
          <div className="w-3 h-3 bg-white border-2 border-rose-500 rounded-full shadow-lg group-hover:scale-125 transition-transform" />
        </div>
      </div>
    </div>
  );
};
