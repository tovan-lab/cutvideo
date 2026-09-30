import React from 'react';
import {
  Type,
  Plus,
  Trash2,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Sparkles,
  Layers,
  Palette,
  Eye,
  Sliders,
  Clock,
  Move,
} from 'lucide-react';
import {
  MergeItem,
  TextAnimationType,
  TextFontFamily,
  TextOverlayItem,
  TextPositionPreset,
} from '../../types/video';

interface TextOverlayEditorProps {
  items: TextOverlayItem[];
  selectedId: string | null;
  onSelectId: (id: string) => void;
  onItemsChange: (items: TextOverlayItem[]) => void;
  currentTime: number;
  totalDuration: number;
  mergeItems?: MergeItem[];
}

const FONTS: Array<{ id: TextFontFamily; name: string; style: string }> = [
  { id: 'Montserrat', name: 'Montserrat (Hiện đại)', style: 'font-sans font-extrabold' },
  { id: 'Be Vietnam Pro', name: 'Be Vietnam Pro (Chuẩn tiếng Việt)', style: 'font-sans' },
  { id: 'Roboto', name: 'Roboto (Rõ ràng)', style: 'font-sans' },
  { id: 'Inter', name: 'Inter (Tối giản)', style: 'font-sans' },
  { id: 'Bebas Neue', name: 'Bebas Neue (In hoa nổi bật)', style: 'font-sans tracking-wider' },
  { id: 'Oswald', name: 'Oswald (Mạnh mẽ)', style: 'font-sans font-bold' },
  { id: 'Playfair Display', name: 'Playfair Display (Sang trọng)', style: 'font-serif' },
  { id: 'Caveat', name: 'Caveat (Chữ viết tay)', style: 'font-sans italic' },
  { id: 'Arial', name: 'Arial (Tiêu chuẩn)', style: 'font-sans' },
];

const ANIMATIONS: Array<{ id: TextAnimationType; label: string; desc: string }> = [
  { id: 'none', label: 'Tĩnh (Mặc định)', desc: 'Xuất hiện cố định không hiệu ứng' },
  { id: 'fade', label: 'Mờ Dần (Fade In/Out)', desc: 'Tăng dần độ trong suốt khi vào và ra' },
  { id: 'slide_up', label: 'Trượt Từ Dưới Lên', desc: 'Lướt nhẹ từ dưới lên vị trí cố định' },
  { id: 'slide_left', label: 'Trượt Từ Trái Sang', desc: 'Bay từ góc trái vào vị trí' },
  { id: 'zoom_in', label: 'Phóng To (Pop In)', desc: 'Hiệu ứng bùng nổ thu hút mắt' },
  { id: 'bounce', label: 'Nảy Nhẹ (Bounce)', desc: 'Nhún nhẹ sống động kiểu TikTok/Shorts' },
  { id: 'typewriter', label: 'Gõ Chữ (Typewriter)', desc: 'Gõ từng ký tự theo thời gian' },
];

const PRESET_COLORS = [
  '#ffffff', // White
  '#facc15', // Yellow
  '#ef4444', // Red
  '#06b6d4', // Cyan
  '#f472b6', // Pink
  '#10b981', // Emerald
  '#a855f7', // Purple
  '#000000', // Black
];

export const TextOverlayEditor: React.FC<TextOverlayEditorProps> = ({
  items,
  selectedId,
  onSelectId,
  onItemsChange,
  currentTime,
  totalDuration,
  mergeItems = [],
}) => {
  const activeItem = items.find((it) => it.id === selectedId) || items[0] || null;

  // Calculate each clip's time range inside the total combined video
  const clipSlices = React.useMemo(() => {
    if (!mergeItems || mergeItems.length <= 1) return [];
    const slices: Array<{
      index: number;
      name: string;
      start: number;
      end: number;
      duration: number;
    }> = [];
    let currentStart = 0;
    const transDur = 0.75;
    for (let i = 0; i < mergeItems.length; i++) {
      const it = mergeItems[i];
      const effDur = it.trimConfig
        ? Math.max(0.1, it.trimConfig.endTime - it.trimConfig.startTime)
        : (it.video.metadata.duration || 5);
      const end = currentStart + effDur;
      slices.push({
        index: i,
        name: it.video.name,
        start: Number(currentStart.toFixed(2)),
        end: Number(end.toFixed(2)),
        duration: Number(effDur.toFixed(2)),
      });
      currentStart = Math.max(0, end - transDur);
    }
    return slices;
  }, [mergeItems]);

  const handleAddNewItem = () => {
    const newItem: TextOverlayItem = {
      id: `text_${Date.now()}`,
      text: 'Tiêu đề video mới',
      startTime: Math.max(0, Math.floor(currentTime)),
      endTime: Math.min(totalDuration, Math.floor(currentTime) + 4),
      fullDuration: items.length === 0,
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

    const nextItems = [...items, newItem];
    onItemsChange(nextItems);
    onSelectId(newItem.id);
  };

  const handleRemoveItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextItems = items.filter((it) => it.id !== id);
    onItemsChange(nextItems);
    if (selectedId === id && nextItems.length > 0) {
      onSelectId(nextItems[0].id);
    }
  };

  const updateActive = (partial: Partial<TextOverlayItem>) => {
    if (!activeItem) return;
    const nextItems = items.map((it) => (it.id === activeItem.id ? { ...it, ...partial } : it));
    onItemsChange(nextItems);
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
      {/* Header & Layer List */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-pink-950/60 border border-pink-700/40 flex items-center justify-center text-pink-400">
            <Type className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Thêm Chữ & Phụ Đề Chuyên Nghiệp
            </h4>
            <p className="text-[11px] text-slate-400">
              Phông chữ, hiệu ứng chuyển động, độ mờ và khung viền nổi bật
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleAddNewItem}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-semibold shadow-md shadow-pink-900/30 transition-all active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Thêm Text</span>
        </button>
      </div>

      {/* Layer Pills */}
      {items.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {items.map((it, idx) => {
            const isSelected = it.id === activeItem?.id;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => onSelectId(it.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all shrink-0 ${
                  isSelected
                    ? 'bg-pink-950/40 border-pink-500 text-pink-200 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center text-[10px]">
                  {idx + 1}
                </span>
                <span className="truncate max-w-[110px]">{it.text || 'Text trống'}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => handleRemoveItem(it.id, e)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleRemoveItem(it.id, e as unknown as React.MouseEvent);
                    }
                  }}
                  className="p-0.5 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/40"
                  title="Xóa layer chữ này"
                  aria-label="Xóa layer chữ này"
                >
                  <Trash2 className="w-3 h-3" />
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* When no item exists */}
      {items.length === 0 && (
        <div className="text-center py-6 border border-dashed border-slate-800 rounded-xl bg-slate-950/40 text-slate-500 text-xs space-y-2">
          <p>Chưa có lớp chữ nào trên video.</p>
          <button
            type="button"
            onClick={handleAddNewItem}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium"
          >
            <Plus className="w-3.5 h-3.5 text-pink-400" />
            <span>Thêm chữ đầu tiên</span>
          </button>
        </div>
      )}

      {/* Editor Controls for Active Item */}
      {activeItem && (
        <div className="space-y-4 max-h-[460px] overflow-y-auto pr-1">
          {/* Text Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Nội dung chữ:</span>
              <span className="text-[10px] text-slate-500">Hỗ trợ gõ tiếng Việt có dấu</span>
            </label>
            <textarea
              rows={2}
              value={activeItem.text}
              onChange={(e) => updateActive({ text: e.target.value })}
              placeholder="Nhập nội dung chữ hiển thị trên video..."
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 text-xs focus:outline-none focus:border-pink-500 transition-colors resize-none"
            />
          </div>

          {/* Typography: Font family, size, format */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Font Family */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-slate-400">Phông chữ (Font):</label>
              <select
                value={activeItem.fontFamily}
                onChange={(e) => updateActive({ fontFamily: e.target.value as TextFontFamily })}
                className="w-full px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-pink-500"
              >
                {FONTS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Font Size */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
                <span>Cỡ chữ:</span>
                <span className="font-mono text-pink-300">{activeItem.fontSize}px</span>
              </div>
              <input
                type="range"
                min={16}
                max={96}
                value={activeItem.fontSize}
                onChange={(e) => updateActive({ fontSize: Number(e.target.value) })}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
              />
            </div>
          </div>

          {/* Style Toggles: Bold, Italic, Uppercase, Alignment */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-950/70 rounded-xl border border-slate-800/80">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => updateActive({ isBold: !activeItem.isBold })}
                className={`p-1.5 rounded-lg text-xs transition-colors ${
                  activeItem.isBold ? 'bg-pink-600 text-white font-bold' : 'text-slate-400 hover:bg-slate-800'
                }`}
                title="In đậm (Bold)"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => updateActive({ isItalic: !activeItem.isItalic })}
                className={`p-1.5 rounded-lg text-xs transition-colors ${
                  activeItem.isItalic ? 'bg-pink-600 text-white italic' : 'text-slate-400 hover:bg-slate-800'
                }`}
                title="In nghiêng (Italic)"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => updateActive({ isUppercase: !activeItem.isUppercase })}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold tracking-wider transition-colors ${
                  activeItem.isUppercase ? 'bg-pink-600 text-white' : 'text-slate-400 hover:bg-slate-800'
                }`}
                title="Chữ in hoa (ALL CAPS)"
              >
                TT
              </button>
            </div>

            <div className="flex items-center gap-1 border-l border-slate-800 pl-2">
              <button
                type="button"
                onClick={() => updateActive({ textAlign: 'left' })}
                className={`p-1.5 rounded-lg text-xs transition-colors ${
                  activeItem.textAlign === 'left' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'
                }`}
                title="Căn trái"
              >
                <AlignLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => updateActive({ textAlign: 'center' })}
                className={`p-1.5 rounded-lg text-xs transition-colors ${
                  activeItem.textAlign === 'center' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'
                }`}
                title="Căn giữa"
              >
                <AlignCenter className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => updateActive({ textAlign: 'right' })}
                className={`p-1.5 rounded-lg text-xs transition-colors ${
                  activeItem.textAlign === 'right' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'
                }`}
                title="Căn phải"
              >
                <AlignRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Color & Opacity */}
          <div className="space-y-2 p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-pink-400" />
                <span>Màu chữ & Độ trong suốt:</span>
              </span>
              <span className="font-mono text-pink-300">{activeItem.opacity}%</span>
            </div>

            {/* Color Presets */}
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={activeItem.textColor}
                onChange={(e) => updateActive({ textColor: e.target.value })}
                className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border-0 p-0"
                title="Chọn mã màu tùy ý"
              />
              <div className="flex items-center gap-1 flex-1 overflow-x-auto">
                {PRESET_COLORS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => updateActive({ textColor: col })}
                    style={{ backgroundColor: col }}
                    className={`w-5 h-5 rounded-full border border-slate-700 shrink-0 transition-transform ${
                      activeItem.textColor.toLowerCase() === col.toLowerCase() ? 'scale-125 ring-2 ring-pink-500' : ''
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Opacity Slider */}
            <div className="pt-1">
              <input
                type="range"
                min={10}
                max={100}
                value={activeItem.opacity}
                onChange={(e) => updateActive({ opacity: Number(e.target.value) })}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
              />
            </div>
          </div>

          {/* Animation / Chuyển động */}
          <div className="space-y-2 p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Hiệu ứng chuyển động (Animation):</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {ANIMATIONS.map((anim) => {
                const isSelected = activeItem.animation === anim.id;
                return (
                  <button
                    key={anim.id}
                    type="button"
                    onClick={() => updateActive({ animation: anim.id })}
                    className={`p-2 rounded-xl text-left border transition-all ${
                      isSelected
                        ? 'bg-amber-950/30 border-amber-500/80 text-white'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <p className="text-xs font-semibold">{anim.label}</p>
                    <p className="text-[10px] text-slate-500 truncate">{anim.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Box Tag Background & Stroke */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Box Background */}
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">Nền hộp chữ (Tag):</span>
                <input
                  type="checkbox"
                  checked={activeItem.boxEnabled}
                  onChange={(e) => updateActive({ boxEnabled: e.target.checked })}
                  className="w-4 h-4 rounded accent-pink-500 cursor-pointer"
                />
              </div>

              {activeItem.boxEnabled && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Màu & Độ mờ nền:</span>
                    <span className="font-mono text-pink-300">{activeItem.boxOpacity}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={activeItem.boxColor}
                      onChange={(e) => updateActive({ boxColor: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0"
                    />
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={activeItem.boxOpacity}
                      onChange={(e) => updateActive({ boxOpacity: Number(e.target.value) })}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Stroke / Viền chữ */}
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">Viền chữ (Stroke):</span>
                <input
                  type="checkbox"
                  checked={activeItem.strokeEnabled}
                  onChange={(e) => updateActive({ strokeEnabled: e.target.checked })}
                  className="w-4 h-4 rounded accent-pink-500 cursor-pointer"
                />
              </div>

              {activeItem.strokeEnabled && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Độ dày viền:</span>
                    <span className="font-mono text-pink-300">{activeItem.strokeWidth}px</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={activeItem.strokeColor}
                      onChange={(e) => updateActive({ strokeColor: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0"
                    />
                    <input
                      type="range"
                      min={1}
                      max={6}
                      value={activeItem.strokeWidth}
                      onChange={(e) => updateActive({ strokeWidth: Number(e.target.value) })}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Position Presets */}
          <div className="space-y-2 p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5">
                <Move className="w-3.5 h-3.5 text-pink-400" />
                <span>Vị trí trên khung hình:</span>
              </span>
              <span className="text-[10px] text-slate-500">Hoặc kéo trực tiếp trên video</span>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {[
                { id: 'top', label: 'Trên cùng' },
                { id: 'center', label: 'Ở giữa' },
                { id: 'lower_third', label: '1/3 Dưới' },
                { id: 'bottom', label: 'Dưới cùng' },
              ].map((pos) => {
                const isSelected = activeItem.positionPreset === pos.id;
                return (
                  <button
                    key={pos.id}
                    type="button"
                    onClick={() => updateActive({ positionPreset: pos.id as TextPositionPreset })}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition-all ${
                      isSelected
                        ? 'bg-pink-600 border-pink-500 text-white font-semibold'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {pos.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Timeline / Duration */}
          <div className="space-y-2.5 p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-pink-400" />
                <span>Thời gian xuất hiện:</span>
                {mergeItems.length > 1 && (
                  <span className="text-[10px] text-indigo-400 font-normal ml-1">
                    (Tổng chuỗi: {totalDuration.toFixed(1)}s - {mergeItems.length} clip)
                  </span>
                )}
              </span>
              <label className="flex items-center gap-1.5 text-[11px] font-normal text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={activeItem.fullDuration}
                  onChange={(e) => updateActive({ fullDuration: e.target.checked })}
                  className="rounded accent-pink-500 cursor-pointer"
                />
                <span>Suốt video</span>
              </label>
            </div>

            {/* Quick Clip Selector when multiple clips exist */}
            {clipSlices.length > 1 && !activeItem.fullDuration && (
              <div className="space-y-1.5 p-2 bg-slate-900/80 rounded-lg border border-indigo-500/20">
                <span className="text-[11px] text-indigo-300 font-medium block">
                  ⚡ Gán nhanh thời gian xuất hiện theo từng Clip ghép:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => updateActive({ startTime: 0, endTime: totalDuration, fullDuration: false })}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] border border-slate-700 font-medium transition"
                  >
                    Toàn bộ video (0s - {totalDuration.toFixed(1)}s)
                  </button>
                  {clipSlices.map((slice) => (
                    <button
                      key={slice.index}
                      type="button"
                      onClick={() =>
                        updateActive({
                          startTime: slice.start,
                          endTime: slice.end,
                          fullDuration: false,
                        })
                      }
                      className="px-2 py-1 rounded bg-indigo-950/60 hover:bg-indigo-900/80 border border-indigo-700/50 text-indigo-200 text-[10px] font-mono transition"
                    >
                      #{slice.index + 1}: {slice.start}s - {slice.end}s
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!activeItem.fullDuration && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Từ giây:</span>
                    <button
                      type="button"
                      onClick={() => updateActive({ startTime: Number(currentTime.toFixed(1)) })}
                      className="text-[10px] text-pink-400 hover:underline"
                    >
                      Lấy hiện tại ({currentTime.toFixed(1)}s)
                    </button>
                  </div>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    max={totalDuration}
                    value={activeItem.startTime}
                    onChange={(e) => updateActive({ startTime: Number(e.target.value) })}
                    className="w-full px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-white text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Đến giây:</span>
                    <button
                      type="button"
                      onClick={() => updateActive({ endTime: Number(currentTime.toFixed(1)) })}
                      className="text-[10px] text-pink-400 hover:underline"
                    >
                      Lấy hiện tại ({currentTime.toFixed(1)}s)
                    </button>
                  </div>
                  <input
                    type="number"
                    step={0.1}
                    min={activeItem.startTime + 0.1}
                    max={totalDuration}
                    value={activeItem.endTime}
                    onChange={(e) => updateActive({ endTime: Number(e.target.value) })}
                    className="w-full px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-white text-xs font-mono"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
