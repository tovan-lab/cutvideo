import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  X,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize2,
  Film,
  Sparkles,
  Scissors,
  Eraser,
  Layers,
  Type,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
} from 'lucide-react';
import {
  BoundingBox,
  ObjectRemovalConfig,
  TextOverlayItem,
  TrimConfig,
  VideoItem,
} from '../../types/video';
import { ObjectRemovalOverlay } from './ObjectRemovalSelector';
import { TextOverlayCanvas } from './TextOverlayCanvas';

interface VideoPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  videos: VideoItem[];
  mergeItems?: MergeItem[];
  trimConfig?: TrimConfig;
  enableTrim?: boolean;
  watermarkConfig?: ObjectRemovalConfig;
  enableWatermark?: boolean;
  textItems?: TextOverlayItem[];
  enableText?: boolean;
  mergeEnabled?: boolean;
  autoTransitions?: boolean;
  onConfirmExport: () => void;
}

export const VideoPreviewModal: React.FC<VideoPreviewModalProps> = ({
  isOpen,
  onClose,
  videos,
  mergeItems,
  trimConfig,
  enableTrim = false,
  watermarkConfig,
  enableWatermark = true,
  textItems = [],
  enableText = true,
  mergeEnabled = false,
  autoTransitions = true,
  onConfirmExport,
}) => {
  const activeVideos = useMemo(() => {
    if (mergeEnabled && videos.length > 1) {
      return videos;
    }
    return videos.length > 0 ? [videos[0]] : [];
  }, [videos, mergeEnabled]);

  const [activeClipIndex, setActiveClipIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [globalCurrentTime, setGlobalCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);

  const videoElementRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate durations and clip boundaries considering per-clip trim
  const clipDurations = useMemo(() => {
    return activeVideos.map((v, i) => {
      const d = v.metadata.duration || 5;
      if (mergeItems && mergeItems[i]?.trimConfig) {
        const tc = mergeItems[i].trimConfig!;
        return Math.max(0.5, tc.endTime - tc.startTime);
      }
      if (activeVideos.length === 1 && enableTrim && trimConfig) {
        return Math.max(0.5, trimConfig.endTime - trimConfig.startTime);
      }
      return d;
    });
  }, [activeVideos, enableTrim, trimConfig, mergeItems]);

  const transitionDuration = 0.75;

  const clipStarts = useMemo(() => {
    const starts: number[] = [];
    let currentStart = 0;
    for (let i = 0; i < clipDurations.length; i++) {
      starts.push(currentStart);
      if (i < clipDurations.length - 1 && mergeEnabled && activeVideos.length > 1) {
        currentStart += Math.max(0.5, clipDurations[i] - transitionDuration);
      } else {
        currentStart += clipDurations[i];
      }
    }
    return starts;
  }, [clipDurations, mergeEnabled, activeVideos.length]);

  const totalDuration = useMemo(() => {
    if (activeVideos.length === 0) return 0;
    const lastIdx = activeVideos.length - 1;
    return clipStarts[lastIdx] + clipDurations[lastIdx];
  }, [activeVideos.length, clipStarts, clipDurations]);

  // Reset playback on modal open or video list change
  useEffect(() => {
    if (isOpen) {
      setActiveClipIndex(0);
      setGlobalCurrentTime(0);
      setIsPlaying(false);
      if (videoElementRef.current) {
        const itemTrim = mergeItems && mergeItems[0]?.trimConfig;
        const startSec = itemTrim
          ? itemTrim.startTime
          : activeVideos.length === 1 && enableTrim && trimConfig
          ? trimConfig.startTime
          : 0;
        videoElementRef.current.currentTime = startSec;
      }
    }
  }, [isOpen, activeVideos.length]);

  // Handle video element timeupdate
  const handleTimeUpdate = () => {
    const el = videoElementRef.current;
    if (!el) return;

    const localTime = el.currentTime;
    const isSingleTrim = activeVideos.length === 1 && enableTrim && trimConfig;
    const itemTrim = mergeItems && mergeItems[activeClipIndex]?.trimConfig;
    const trimStart = itemTrim ? itemTrim.startTime : isSingleTrim ? trimConfig.startTime : 0;
    const trimEnd = itemTrim ? itemTrim.endTime : isSingleTrim ? trimConfig.endTime : el.duration || 10;

    // Check if reached trim end for this clip
    if ((isSingleTrim || itemTrim) && localTime >= trimEnd) {
      if (activeVideos.length > 1 && activeClipIndex < activeVideos.length - 1) {
        const nextIdx = activeClipIndex + 1;
        setActiveClipIndex(nextIdx);
        return;
      } else {
        el.pause();
        setIsPlaying(false);
        el.currentTime = trimStart;
        setGlobalCurrentTime(0);
        return;
      }
    }

    // Check if multi-clip reached next clip threshold
    if (activeVideos.length > 1 && mergeEnabled) {
      const currentClipDuration = clipDurations[activeClipIndex];
      const threshold =
        activeClipIndex < activeVideos.length - 1
          ? Math.max(0.2, currentClipDuration - transitionDuration) + trimStart
          : currentClipDuration + trimStart;

      if (localTime >= threshold) {
        if (activeClipIndex < activeVideos.length - 1) {
          const nextIdx = activeClipIndex + 1;
          setActiveClipIndex(nextIdx);
          return;
        } else {
          el.pause();
          setIsPlaying(false);
          setActiveClipIndex(0);
          setGlobalCurrentTime(0);
          return;
        }
      }
    }

    const elapsedInClip = Math.max(0, localTime - trimStart);
    const globalT = clipStarts[activeClipIndex] + elapsedInClip;
    setGlobalCurrentTime(Math.min(totalDuration, globalT));
  };

  const togglePlay = () => {
    const el = videoElementRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
    } else {
      el.play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    }
  };

  const handleGlobalSeek = (targetGlobalTime: number) => {
    const clamped = Math.max(0, Math.min(totalDuration, targetGlobalTime));
    setGlobalCurrentTime(clamped);

    // Find which clip this falls into
    let targetClipIdx = 0;
    for (let i = 0; i < clipStarts.length; i++) {
      const start = clipStarts[i];
      const dur = clipDurations[i];
      if (clamped >= start && clamped <= start + dur) {
        targetClipIdx = i;
        break;
      }
      if (i === clipStarts.length - 1) {
        targetClipIdx = i;
      }
    }

    const localOffset = clamped - clipStarts[targetClipIdx];
    const isSingleTrim = activeVideos.length === 1 && enableTrim && trimConfig;
    const itemTrim = mergeItems && mergeItems[targetClipIdx]?.trimConfig;
    const startSec = itemTrim ? itemTrim.startTime : isSingleTrim ? trimConfig.startTime : 0;
    const targetLocalTime = startSec + localOffset;

    if (targetClipIdx !== activeClipIndex) {
      setActiveClipIndex(targetClipIdx);
      setTimeout(() => {
        if (videoElementRef.current) {
          videoElementRef.current.currentTime = targetLocalTime;
        }
      }, 50);
    } else {
      if (videoElementRef.current) {
        videoElementRef.current.currentTime = targetLocalTime;
      }
    }
  };

  const handleSwitchClipManually = (idx: number) => {
    setActiveClipIndex(idx);
    setGlobalCurrentTime(clipStarts[idx]);
    setTimeout(() => {
      if (videoElementRef.current) {
        const itemTrim = mergeItems && mergeItems[idx]?.trimConfig;
        const startSec = itemTrim
          ? itemTrim.startTime
          : activeVideos.length === 1 && enableTrim && trimConfig
          ? trimConfig.startTime
          : 0;
        videoElementRef.current.currentTime = startSec;
        if (isPlaying) {
          videoElementRef.current.play().catch(() => {});
        }
      }
    }, 50);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  if (!isOpen) return null;

  const currentClip = activeVideos[activeClipIndex] || activeVideos[0];
  const isPortrait =
    currentClip?.metadata.orientation === 'portrait' ||
    (currentClip && currentClip.metadata.height > currentClip.metadata.width) ||
    currentClip?.metadata.aspectRatio === '9:16';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-5xl max-h-[96vh] flex flex-col bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
        {/* Modal Top Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-800/80 bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500/30 to-indigo-600/30 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white truncate">
                  Xem Lại Video Trước Khi Xuất
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30 shrink-0">
                  Clean Preview
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                Xem trước hiệu ứng thực tế: Không viền khung đỏ, logo đã làm mờ, chữ động chuẩn vị trí
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors shrink-0"
            title="Đóng cửa sổ xem thử"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Multi-Clip Navigation Chips (If merging multiple clips) */}
        {activeVideos.length > 1 && (
          <div className="px-4 sm:px-6 py-2 bg-slate-900/40 border-b border-slate-800/60 flex items-center gap-2 overflow-x-auto shrink-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
              <Layers className="w-3 h-3 text-indigo-400" />
              Chuỗi clip ({activeVideos.length}):
            </span>
            <div className="flex items-center gap-1.5 min-w-0">
              {activeVideos.map((v, idx) => {
                const isActive = idx === activeClipIndex;
                return (
                  <button
                    key={v.id || idx}
                    type="button"
                    onClick={() => handleSwitchClipManually(idx)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold transition-all shrink-0 ${
                      isActive
                        ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-600/30 ring-1 ring-indigo-400/50'
                        : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    <span>Clip {idx + 1}</span>
                    <span className="text-[10px] opacity-75">
                      ({clipDurations[idx]?.toFixed(1)}s)
                    </span>
                    {idx < activeVideos.length - 1 && autoTransitions && (
                      <span className="text-[9px] text-amber-300 ml-1">➔ xfade</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Central Video Viewport */}
        <div className="flex-1 min-h-[320px] sm:min-h-[420px] bg-black flex items-center justify-center relative overflow-hidden select-none">
          <div
            ref={containerRef}
            className={`relative max-w-full max-h-full flex items-center justify-center ${
              isPortrait ? 'w-auto h-[60vh] sm:h-[68vh] aspect-[9/16]' : 'w-full h-auto max-h-[68vh] aspect-[16/9]'
            }`}
          >
            <video
              ref={videoElementRef}
              key={currentClip?.id || currentClip?.url}
              src={currentClip?.url}
              playsInline
              muted={isMuted}
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => {
                if (activeClipIndex < activeVideos.length - 1) {
                  setActiveClipIndex((p) => p + 1);
                } else {
                  setIsPlaying(false);
                  setActiveClipIndex(0);
                  setGlobalCurrentTime(0);
                }
              }}
              onLoadedData={() => {
                if (videoElementRef.current) {
                  videoElementRef.current.playbackRate = playbackRate;
                  videoElementRef.current.volume = volume;
                  const itemTrim = mergeItems && mergeItems[activeClipIndex]?.trimConfig;
                  const startSec = itemTrim
                    ? itemTrim.startTime
                    : activeVideos.length === 1 && enableTrim && trimConfig
                    ? trimConfig.startTime
                    : 0;
                  videoElementRef.current.currentTime = startSec;
                  if (isPlaying) {
                    videoElementRef.current.play().catch(() => {});
                  }
                }
              }}
              className="w-full h-full object-contain rounded-xl"
            />

            {/* Clean Simulated Watermark Removal Layer */}
            {enableWatermark && watermarkConfig && (
              <ObjectRemovalOverlay
                config={watermarkConfig}
                onChange={() => {}}
                isPreviewMode={true}
              />
            )}

            {/* Clean Text Overlay Layer */}
            {enableText && textItems.length > 0 && (
              <TextOverlayCanvas
                items={textItems}
                selectedId={null}
                onSelectItem={() => {}}
                onUpdateItemPosition={() => {}}
                currentTime={globalCurrentTime}
                totalDuration={totalDuration}
                isPreviewMode={true}
              />
            )}

            {/* Play/Pause Large Center Click Trigger */}
            <button
              type="button"
              onClick={togglePlay}
              className="absolute inset-0 w-full h-full flex items-center justify-center bg-transparent group focus:outline-none"
            >
              {!isPlaying && (
                <div className="w-16 h-16 rounded-full bg-slate-900/80 backdrop-blur-md border border-white/20 text-white flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
                  <Play className="w-7 h-7 fill-white ml-1" />
                </div>
              )}
            </button>
          </div>
        </div>

        {/* Video Scrubber & Playback Controls Bar */}
        <div className="px-4 sm:px-6 py-3 bg-slate-900/90 border-t border-slate-800 space-y-2 shrink-0">
          {/* Timeline Scrubber */}
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-indigo-400 font-semibold w-16 text-right shrink-0">
              {formatTime(globalCurrentTime)}
            </span>
            <input
              type="range"
              min="0"
              max={totalDuration || 1}
              step="0.05"
              value={globalCurrentTime}
              onChange={(e) => handleGlobalSeek(parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
            />
            <span className="font-mono text-xs text-slate-400 font-semibold w-16 shrink-0">
              {formatTime(totalDuration)}
            </span>
          </div>

          {/* Quick Buttons Bar */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={togglePlay}
                className="w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center transition-all shadow-md shadow-indigo-600/30"
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  handleGlobalSeek(0);
                  if (videoElementRef.current) {
                    videoElementRef.current.play().catch(() => {});
                    setIsPlaying(true);
                  }
                }}
                className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
                title="Phát lại từ đầu"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* Volume / Mute */}
              <div className="flex items-center gap-1.5 ml-2">
                <button
                  type="button"
                  onClick={() => setIsMuted(!isMuted)}
                  className="w-8 h-8 rounded-lg text-slate-400 hover:text-white flex items-center justify-center"
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setVolume(v);
                    setIsMuted(v === 0);
                    if (videoElementRef.current) {
                      videoElementRef.current.volume = v;
                    }
                  }}
                  className="w-16 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-slate-400"
                />
              </div>

              {/* Speed Selector */}
              <div className="hidden sm:flex items-center gap-1 ml-2">
                {[1, 1.25, 1.5, 2].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => {
                      setPlaybackRate(rate);
                      if (videoElementRef.current) {
                        videoElementRef.current.playbackRate = rate;
                      }
                    }}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                      playbackRate === rate
                        ? 'bg-indigo-600/40 text-indigo-300 border border-indigo-500/40'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>

            {/* Active Effects Summary Badges */}
            <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-400">
              {enableTrim && (
                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-indigo-300 flex items-center gap-1">
                  <Scissors className="w-3 h-3" /> Cắt video
                </span>
              )}
              {enableWatermark && (
                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-amber-300 flex items-center gap-1">
                  <Eraser className="w-3 h-3" /> Khử logo
                </span>
              )}
              {mergeEnabled && activeVideos.length > 1 && (
                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-indigo-300 flex items-center gap-1">
                  <Layers className="w-3 h-3" /> Ghép {activeVideos.length} clips
                </span>
              )}
              {enableText && textItems.length > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-pink-300 flex items-center gap-1">
                  <Type className="w-3 h-3" /> {textItems.length} lớp chữ
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Modal Bottom Actions */}
        <div className="px-4 sm:px-6 py-3.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-colors"
          >
            ⬅️ Quay lại chỉnh sửa
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onConfirmExport();
            }}
            className="flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 via-indigo-600 to-pink-600 hover:from-amber-400 hover:via-indigo-500 hover:to-pink-500 text-white font-bold text-xs sm:text-sm shadow-xl shadow-indigo-900/40 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <CheckCircle className="w-4 h-4" />
            <span>🚀 Ưng Ý Rồi - Tiến Hành Xuất Video Ngay</span>
          </button>
        </div>
      </div>
    </div>
  );
};
