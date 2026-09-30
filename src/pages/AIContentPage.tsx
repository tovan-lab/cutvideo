import React, { useRef } from 'react';
import { Film } from 'lucide-react';
import { VideoItem } from '../types/video';
import { VideoPlayer, VideoPlayerRef } from '../components/video/VideoPlayer';
import { VideoUploader } from '../components/video/VideoUploader';
import { AIContentPanel } from '../components/ai/AIContentPanel';

interface AIContentPageProps {
  currentVideo: VideoItem | null;
  onSelectVideo: (video: VideoItem) => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const AIContentPage: React.FC<AIContentPageProps> = ({
  currentVideo,
  onSelectVideo,
  onShowToast,
}) => {
  const playerRef = useRef<VideoPlayerRef>(null);

  const handleSeekVideo = (seconds: number) => {
    playerRef.current?.seekTo(seconds);
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-24 md:pb-10">
      {/* If no video is selected, show uploader first */}
      {!currentVideo ? (
        <div className="space-y-4 max-w-2xl mx-auto">
          <div className="text-center space-y-1.5 px-2">
            <h2 className="text-base sm:text-lg font-bold text-white bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-200 to-indigo-400">
              Phân Tích Video & Tạo Nội Dung SEO Chuẩn Xác Bằng AI
            </h2>
            <p className="text-xs text-slate-400 max-w-lg mx-auto">
              Trích xuất sự thật 100% qua Gemini Files API (cả hình ảnh & âm thanh), nghiên cứu từ khóa Google/YouTube thật và tạo Tiêu đề + Mô tả + Hashtag + Tags chuẩn SEO cho từng nền tảng.
            </p>
          </div>

          <VideoUploader
            currentVideo={null}
            onVideoSelected={onSelectVideo}
            onError={(err) => onShowToast(err, 'error')}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
          {/* Left Column (Desktop 5 cols): Video Preview Card */}
          <div className="lg:col-span-5 space-y-3 lg:sticky lg:top-18">
            <div className="glass-panel rounded-3xl p-3 sm:p-4 space-y-3 shadow-xl shadow-black/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Film className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Video Đang Phân Tích
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  {currentVideo.metadata.aspectRatio} · {Math.round(currentVideo.metadata.duration)}s
                </span>
              </div>

              {/* Player with seek ref */}
              <VideoPlayer ref={playerRef} video={currentVideo} />
            </div>

            {/* Quick change video trigger */}
            <VideoUploader
              currentVideo={currentVideo}
              onVideoSelected={onSelectVideo}
              onError={(err) => onShowToast(err, 'error')}
            />
          </div>

          {/* Right Column (Desktop 7 cols): AI Generator Controls, Transcript & Output */}
          <div className="lg:col-span-7">
            <AIContentPanel
              selectedVideo={currentVideo}
              onSeekVideo={handleSeekVideo}
              onShowToast={onShowToast}
            />
          </div>
        </div>
      )}
    </div>
  );
};
