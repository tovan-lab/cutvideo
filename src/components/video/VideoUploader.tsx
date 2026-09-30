import React, { useRef, useState } from 'react';
import { UploadCloud, Film, PlayCircle, Loader2, RefreshCw, Sparkles, Zap } from 'lucide-react';
import { VideoItem } from '../../types/video';
import { createSyntheticSampleVideo, SAMPLE_PRESETS } from '../../mock/sampleVideos';
import { videoProcessor } from '../../services/videoProcessor';

interface VideoUploaderProps {
  currentVideo: VideoItem | null;
  onVideoSelected: (video: VideoItem) => void;
  onError: (msg: string) => void;
}

export const VideoUploader: React.FC<VideoUploaderProps> = ({
  currentVideo,
  onVideoSelected,
  onError,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingSample, setIsLoadingSample] = useState(false);
  const [activeSampleTheme, setActiveSampleTheme] = useState<string | null>(null);

  const processFile = async (file: File) => {
    const validTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp4|mov|webm|mkv)$/i)) {
      onError('Định dạng không hỗ trợ. Vui lòng chọn file video định dạng MP4, MOV hoặc WebM.');
      return;
    }

    const MAX_SIZE_BYTES = 500 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      onError('File quá lớn (vượt quá 500MB). Vui lòng chọn file nhẹ hơn để đảm bảo hiệu suất.');
      return;
    }

    const objectUrl = URL.createObjectURL(file);

    try {
      const metadata = await videoProcessor.probeVideo(file);

      const videoItem: VideoItem = {
        id: `upload_${Date.now()}`,
        name: file.name,
        url: objectUrl,
        file,
        createdAt: Date.now(),
        isSample: false,
        metadata,
      };

      onVideoSelected(videoItem);
    } catch {
      URL.revokeObjectURL(objectUrl);
      onError('Không thể đọc dữ liệu video. File có thể bị lỗi hoặc định dạng không tương thích.');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleSampleClick = async (preset: (typeof SAMPLE_PRESETS)[0]) => {
    try {
      setIsLoadingSample(true);
      setActiveSampleTheme(preset.id);
      const sample = await createSyntheticSampleVideo(preset.title, preset.duration, preset.theme);
      onVideoSelected(sample);
    } catch {
      onError('Không thể tạo video mẫu. Vui lòng tải file từ máy tính.');
    } finally {
      setIsLoadingSample(false);
      setActiveSampleTheme(null);
    }
  };

  // Compact, mobile-friendly summary bar when video is loaded
  if (currentVideo) {
    const sizeMb = (currentVideo.metadata.sizeBytes / (1024 * 1024)).toFixed(1);
    const durMin = Math.floor(currentVideo.metadata.duration / 60);
    const durSec = Math.floor(currentVideo.metadata.duration % 60);
    const timeFormatted = `${durMin}:${durSec.toString().padStart(2, '0')}`;
    const isPortrait =
      currentVideo.metadata.orientation === 'portrait' ||
      currentVideo.metadata.height > currentVideo.metadata.width;

    return (
      <div className="glass-panel glass-card-interactive rounded-2xl p-2.5 sm:p-3.5 flex items-center justify-between gap-2.5 shadow-lg shadow-black/40">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-indigo-600/30 to-purple-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 shadow-inner">
            <Film className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs sm:text-sm font-semibold text-slate-100 truncate">
              {currentVideo.name}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-slate-400 font-mono mt-0.5">
              <span className="px-1.5 py-0.2 rounded bg-indigo-950/80 text-indigo-300 font-bold border border-indigo-800/40">
                {isPortrait ? '9:16 Dọc' : '16:9 Ngang'}
              </span>
              <span className="font-semibold text-slate-300">{timeFormatted}</span>
              <span className="text-slate-600">·</span>
              <span>{currentVideo.metadata.width}×{currentVideo.metadata.height}</span>
              <span className="text-slate-600">·</span>
              <span>{sizeMb}MB</span>
              {currentVideo.metadata.hasAudio && (
                <>
                  <span className="text-slate-600">·</span>
                  <span className="text-emerald-400 hidden xs:inline">Audio OK</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0">
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
            accept="video/mp4,video/quicktime,video/webm"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 transition-all hover:border-indigo-500/40 shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Đổi video khác</span>
            <span className="sm:hidden">Đổi</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 3D Glassmorphic Drag & Drop Upload Container */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-3xl p-5 sm:p-7 text-center cursor-pointer transition-all glass-panel glass-card-interactive overflow-hidden ${
          isDragging
            ? 'border-indigo-500 bg-indigo-950/40 shadow-2xl shadow-indigo-600/20'
            : 'border-slate-800/80 hover:border-indigo-500/50 shadow-xl shadow-black/40'
        }`}
      >
        {/* Subtle background ambient light */}
        <div className="absolute top-0 right-1/4 w-40 h-40 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
          accept="video/mp4,video/quicktime,video/webm"
          className="hidden"
        />

        <div className="relative w-11 h-11 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 mx-auto flex items-center justify-center text-white mb-2.5 sm:mb-3 shadow-lg shadow-indigo-500/30 ring-4 ring-indigo-500/10">
          <UploadCloud className="w-6 h-6 sm:w-7 sm:h-7" />
        </div>

        <h3 className="text-xs sm:text-sm font-bold text-slate-100">
          Kéo thả video vào đây hoặc <span className="text-indigo-400 underline underline-offset-4 decoration-indigo-400/50 hover:decoration-indigo-400">Chọn từ máy</span>
        </h3>
        <p className="text-[11px] sm:text-xs text-slate-400 mt-1 max-w-md mx-auto">
          Hỗ trợ video NotebookLM <strong className="text-slate-300">9:16 (Shorts)</strong> & <strong className="text-slate-300">16:9 (YouTube)</strong> · Giữ 100% chất lượng gốc
        </p>
      </div>

      {/* Instant Demo Sample Videos Bar - Mobile Horizontal Scroll */}
      <div className="glass-panel-subtle rounded-2xl p-2.5 sm:p-3 border border-slate-800/80">
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Hoặc thử ngay video mẫu (Không cần tải file):</span>
          </div>
          {isLoadingSample && (
            <div className="flex items-center gap-1 text-[11px] text-indigo-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Đang tạo...</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {SAMPLE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={isLoadingSample}
              onClick={() => handleSampleClick(preset)}
              className="text-left p-2 sm:p-2.5 rounded-xl bg-slate-950/70 hover:bg-slate-900/90 border border-slate-800/80 hover:border-indigo-500/40 transition-all flex items-center gap-2.5 disabled:opacity-50 active:scale-[0.98]"
            >
              <div className="w-7 h-7 rounded-lg bg-indigo-950/80 text-indigo-400 border border-indigo-800/40 flex items-center justify-center shrink-0">
                {activeSampleTheme === preset.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <PlayCircle className="w-3.5 h-3.5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-200 truncate">{preset.title}</p>
                <p className="text-[10px] text-slate-400 truncate">{preset.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
