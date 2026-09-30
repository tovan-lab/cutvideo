import React, { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  RotateCcw,
} from 'lucide-react';
import { VideoItem } from '../../types/video';

export interface VideoPlayerRef {
  seekTo: (timeSec: number) => void;
  play: () => void;
  pause: () => void;
  getCurrentTime: () => number;
}

interface VideoPlayerProps {
  video: VideoItem;
  overlayNode?: React.ReactNode;
  onTimeUpdate?: (currentTime: number) => void;
  highlightRange?: { start: number; end: number };
}

export const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(
  ({ video, overlayNode, onTimeUpdate, highlightRange }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(video.metadata.duration || 10);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(1);
    const [playbackRate, setPlaybackRate] = useState(1);

    useImperativeHandle(ref, () => ({
      seekTo: (timeSec: number) => {
        if (videoRef.current) {
          videoRef.current.currentTime = Math.max(0, Math.min(timeSec, duration));
        }
      },
      play: () => {
        videoRef.current?.play();
      },
      pause: () => {
        videoRef.current?.pause();
      },
      getCurrentTime: () => videoRef.current?.currentTime || 0,
    }));

    useEffect(() => {
      // Reset when video changes
      setIsPlaying(false);
      setCurrentTime(0);
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
      }
    }, [video.id]);

    const togglePlay = () => {
      if (!videoRef.current) return;
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    };

    const handleTimeUpdate = () => {
      if (!videoRef.current) return;
      const t = videoRef.current.currentTime;
      setCurrentTime(t);
      onTimeUpdate?.(t);

      // Loop trimmed portion if previewing highlight range
      if (highlightRange && highlightRange.end > highlightRange.start) {
        if (t >= highlightRange.end) {
          videoRef.current.currentTime = highlightRange.start;
        }
      }
    };

    const [naturalSize, setNaturalSize] = useState<{ width: number; height: number; ratio: number } | null>(null);

    const handleLoadedMetadata = () => {
      if (videoRef.current) {
        const d = videoRef.current.duration || video.metadata.duration;
        setDuration(d);
        const nw = videoRef.current.videoWidth || video.metadata.width || 720;
        const nh = videoRef.current.videoHeight || video.metadata.height || 1280;
        setNaturalSize({ width: nw, height: nh, ratio: nw / nh });
      }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      const targetTime = parseFloat(e.target.value);
      setCurrentTime(targetTime);
      if (videoRef.current) {
        videoRef.current.currentTime = targetTime;
      }
    };

    const toggleMute = () => {
      if (!videoRef.current) return;
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    };

    const cyclePlaybackRate = () => {
      const rates = [1, 1.25, 1.5, 2];
      const nextRate = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
      setPlaybackRate(nextRate);
      if (videoRef.current) {
        videoRef.current.playbackRate = nextRate;
      }
    };

    const toggleFullscreen = () => {
      if (!containerRef.current) return;
      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    };

    const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 10);
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
    };

    const isVertical = naturalSize
      ? naturalSize.height > naturalSize.width
      : (video.metadata.aspectRatio === '9:16' || video.metadata.height > video.metadata.width);

    const stageRatio = naturalSize
      ? `${naturalSize.width} / ${naturalSize.height}`
      : (isVertical ? '9 / 16' : '16 / 9');

    return (
      <div
        ref={containerRef}
        className="relative flex flex-col glass-panel rounded-3xl overflow-hidden border border-slate-800/80 shadow-2xl shadow-black/60 group"
      >
        {/* Outer Viewport: Dark backdrop that accommodates portrait or landscape with responsive height */}
        <div
          className="relative w-full flex items-center justify-center bg-black/95 p-1.5 sm:p-3 overflow-hidden min-h-[220px] max-h-[46vh] sm:max-h-[56vh] lg:max-h-[64vh]"
        >
          {/* Inner Stage: Matches the EXACT aspect ratio of the video, eliminating letterbox/pillarbox offset */}
          <div
            className="relative flex items-center justify-center max-w-full max-h-full"
            style={{
              aspectRatio: stageRatio,
              ...(isVertical
                ? { height: '100%', maxWidth: '100%', width: 'auto' }
                : { width: '100%', maxHeight: '100%', height: 'auto' }),
            }}
          >
            <video
              ref={videoRef}
              src={video.url}
              playsInline
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              className="w-full h-full object-fill rounded-xl shadow-lg cursor-pointer block"
              onClick={togglePlay}
            />

            {/* Overlay Node (Object Removal Box, Watermark, etc.) sitting 1:1 on the video frame */}
            {overlayNode && (
              <div className="absolute inset-0 pointer-events-none rounded-xl overflow-visible">
                <div className="relative w-full h-full pointer-events-auto">
                  {overlayNode}
                </div>
              </div>
            )}

            {/* Quick Play/Pause Center Button on Pause */}
            {!isPlaying && !overlayNode && (
              <button
                type="button"
                onClick={togglePlay}
                className="absolute inset-0 m-auto w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-700/80 flex items-center justify-center text-white shadow-xl hover:scale-105 active:scale-95 transition-transform z-20"
                aria-label="Phát video"
              >
                <Play className="w-6 h-6 sm:w-7 sm:h-7 ml-1 fill-white" />
              </button>
            )}

            {/* Format Badge */}
            <div className="absolute top-2.5 left-2.5 bg-slate-950/80 backdrop-blur-md px-2 py-0.5 rounded-lg text-[10px] sm:text-[11px] font-mono text-slate-300 border border-slate-800 flex items-center gap-1.5 pointer-events-none z-20">
              <span>{isVertical ? '9:16 Dọc' : '16:9 Ngang'}</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>{video.metadata.fps} FPS</span>
            </div>
          </div>
        </div>

        {/* Video Scrubber & Playback Controls Bar */}
        <div className="p-2.5 sm:p-3 bg-slate-900/90 border-t border-slate-800/80 flex flex-col gap-2">
          {/* Timeline Range Indicator */}
          <div className="relative w-full flex items-center">
            {/* Visual highlight of trimmed range if active */}
            {highlightRange && duration > 0 && (
              <div
                className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-indigo-500/40 rounded pointer-events-none z-10"
                style={{
                  left: `${(highlightRange.start / duration) * 100}%`,
                  width: `${Math.max(2, ((highlightRange.end - highlightRange.start) / duration) * 100)}%`,
                }}
              />
            )}
            <input
              type="range"
              min={0}
              max={duration || 10}
              step={0.05}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 focus:outline-none"
            />
          </div>

          {/* Bottom control items */}
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-3">
              {/* Play / Pause button */}
              <button
                type="button"
                onClick={togglePlay}
                className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                title={isPlaying ? 'Tạm dừng (Space)' : 'Phát (Space)'}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>

              {/* Timecode display */}
              <div className="font-mono text-slate-300 tracking-wider">
                <span className="text-white font-medium">{formatTime(currentTime)}</span>
                <span className="text-slate-500 mx-1">/</span>
                <span className="text-slate-400">{formatTime(duration)}</span>
              </div>

              {/* Reset to 0 button */}
              <button
                type="button"
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.currentTime = 0;
                    setCurrentTime(0);
                  }
                }}
                className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
                title="Về đầu video"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {/* Speed rate selector */}
              <button
                type="button"
                onClick={cyclePlaybackRate}
                className="px-2 py-0.5 rounded text-[11px] font-mono text-slate-400 hover:text-white bg-slate-800/80 transition-colors"
                title="Tốc độ phát"
              >
                {playbackRate}x
              </button>

              {/* Mute button */}
              <button
                type="button"
                onClick={toggleMute}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                title={isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              {/* Fullscreen */}
              <button
                type="button"
                onClick={toggleFullscreen}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                title="Toàn màn hình"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

VideoPlayer.displayName = 'VideoPlayer';
