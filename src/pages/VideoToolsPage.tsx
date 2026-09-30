import React, { useState, useRef } from 'react';
import {
  Scissors,
  Layers,
  Eraser,
  Play,
  RotateCcw,
  Sparkles,
  ArrowRight,
  Sliders,
  CheckCircle,
  Type,
} from 'lucide-react';
import {
  AllInOnePlan,
  MergeItem,
  NOTEBOOKLM_PRESETS,
  ObjectRemovalConfig,
  OutputQuality,
  ProcessingProgress,
  TextOverlayItem,
  ToolType,
  TrimConfig,
  UnifiedEditPlan,
  VideoItem,
  VideoOperationResult,
} from '../types/video';
import { VideoUploader } from '../components/video/VideoUploader';
import { VideoPlayer, VideoPlayerRef } from '../components/video/VideoPlayer';
import { TrimControls } from '../components/video/TrimControls';
import { MergeVideoList } from '../components/video/MergeVideoList';
import {
  ObjectRemovalSelector,
  ObjectRemovalOverlay,
} from '../components/video/ObjectRemovalSelector';
import { TextOverlayEditor } from '../components/video/TextOverlayEditor';
import { TextOverlayCanvas } from '../components/video/TextOverlayCanvas';
import { UnifiedCleanControls } from '../components/video/UnifiedCleanControls';
import { AllInOneControls } from '../components/video/AllInOneControls';
import { ProcessingModal } from '../components/video/ProcessingModal';
import { VideoResult } from '../components/video/VideoResult';
import { QualitySelector } from '../components/common/QualitySelector';
import { videoProcessor } from '../services/videoProcessor';
import { objectRemovalProcessor } from '../services/objectRemovalProcessor';
import { unifiedRenderService } from '../services/unifiedRenderService';

interface VideoToolsPageProps {
  currentVideo: VideoItem | null;
  onSelectVideo: (video: VideoItem) => void;
  outputQuality: OutputQuality;
  onChangeQuality: (q: OutputQuality) => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onJumpToAI: () => void;
}

export const VideoToolsPage: React.FC<VideoToolsPageProps> = ({
  currentVideo,
  onSelectVideo,
  outputQuality,
  onChangeQuality,
  onShowToast,
  onJumpToAI,
}) => {
  const playerRef = useRef<VideoPlayerRef>(null);

  // Tool state
  const [activeTool, setActiveTool] = useState<ToolType>('unified');

  // Video time tracker
  const [currentTime, setCurrentTime] = useState(0);

  // Trim config
  const [trimConfig, setTrimConfig] = useState<TrimConfig>({
    startTime: 0,
    endTime: currentVideo?.metadata.duration || 8,
  });

  // Merge list & auto-transitions
  const [autoTransitions, setAutoTransitions] = useState(true);
  const [mergeItems, setMergeItems] = useState<MergeItem[]>(() =>
    currentVideo
      ? [
          {
            video: currentVideo,
            order: 0,
          },
        ]
      : []
  );

  // Text overlay state
  const [textItems, setTextItems] = useState<TextOverlayItem[]>([
    {
      id: 'text_init_1',
      text: 'Tiêu đề video cuốn hút ✨',
      startTime: 0,
      endTime: currentVideo?.metadata.duration || 6,
      fullDuration: true,
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
    },
  ]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>('text_init_1');

  // Watermark removal config (defaults to bottom-right watermark delogo)
  const [watermarkConfig, setWatermarkConfig] = useState<ObjectRemovalConfig>({
    area: NOTEBOOKLM_PRESETS['9:16'].area,
    method: 'delogo',
    feather: 5,
    coverColor: '#020617',
    tracking: false,
    applyEntireVideo: true,
    showMaskOverlay: true,
  });

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Result state
  const [operationResult, setOperationResult] = useState<VideoOperationResult | null>(null);

  // When current video changes, sync duration & trim & auto-detect watermark preset
  const handleVideoSelected = (video: VideoItem) => {
    onSelectVideo(video);
    setTrimConfig({
      startTime: 0,
      endTime: video.metadata.duration || 8,
    });
    setMergeItems((prev) => {
      const exists = prev.some((it) => it.video.id === video.id);
      if (exists) return prev;
      return [...prev, { video, order: prev.length }];
    });

    const isPortrait =
      video.metadata.orientation === 'portrait' ||
      video.metadata.height > video.metadata.width ||
      video.metadata.aspectRatio === '9:16';
    const preset = isPortrait ? NOTEBOOKLM_PRESETS['9:16'] : NOTEBOOKLM_PRESETS['16:9'];
    setWatermarkConfig((prev) => ({
      ...prev,
      area: preset.area,
      method: 'delogo',
      showMaskOverlay: true,
    }));

    setOperationResult(null);
  };

  const handlePreviewTrim = () => {
    if (playerRef.current) {
      playerRef.current.seekTo(trimConfig.startTime);
      playerRef.current.play();
    }
  };

  const handleAddMergeFiles = async (files: FileList) => {
    const fileArray = Array.from(files);
    for (let idx = 0; idx < fileArray.length; idx++) {
      const file = fileArray[idx];
      const objectUrl = URL.createObjectURL(file);
      try {
        const metadata = await videoProcessor.probeVideo(file);
        const item: VideoItem = {
          id: `merge_clip_${Date.now()}_${idx}`,
          name: file.name,
          url: objectUrl,
          file,
          createdAt: Date.now(),
          isSample: false,
          metadata,
        };
        setMergeItems((prev) => [...prev, { video: item, order: prev.length }]);
      } catch {
        URL.revokeObjectURL(objectUrl);
        onShowToast(`Không thể đọc file "${file.name}".`, 'error');
      }
    }
    onShowToast(`Đã thêm ${fileArray.length} video vào danh sách ghép!`, 'success');
  };

  const handleProcessVideo = async () => {
    if (!currentVideo && activeTool !== 'merge') {
      onShowToast('Vui lòng chọn hoặc tải lên một video trước khi xử lý.', 'error');
      return;
    }

    if (activeTool === 'trim') {
      if (trimConfig.startTime >= trimConfig.endTime) {
        onShowToast('Thời gian bắt đầu phải nhỏ hơn thời gian kết thúc.', 'error');
        return;
      }
      if (trimConfig.endTime - trimConfig.startTime < 0.5) {
        onShowToast('Đoạn cắt tối thiểu phải đạt 0.5 giây.', 'error');
        return;
      }
    }

    if (activeTool === 'merge' && mergeItems.length < 2) {
      onShowToast('Cần tối thiểu 2 video trong danh sách để thực hiện ghép.', 'error');
      return;
    }

    if (activeTool === 'text') {
      const valid = textItems.filter((t) => t.text.trim().length > 0);
      if (valid.length === 0) {
        onShowToast('Vui lòng nhập ít nhất một nội dung chữ.', 'error');
        return;
      }
    }

    try {
      setIsProcessing(true);
      abortControllerRef.current = new AbortController();

      let res: VideoOperationResult;

      if (activeTool === 'trim' && currentVideo) {
        res = await videoProcessor.trimVideo(
          {
            video: currentVideo,
            trimConfig,
            quality: outputQuality,
          },
          (progress) => setProcessingProgress(progress),
          abortControllerRef.current.signal
        );
      } else if (activeTool === 'merge') {
        res = await videoProcessor.mergeVideos(
          {
            items: mergeItems,
            quality: outputQuality,
            autoTransitions,
          },
          (progress) => setProcessingProgress(progress),
          abortControllerRef.current.signal
        );
      } else if (activeTool === 'text' && currentVideo) {
        res = await videoProcessor.renderTextOverlay(
          {
            video: currentVideo,
            textItems,
            quality: outputQuality,
          },
          (progress) => setProcessingProgress(progress),
          abortControllerRef.current.signal
        );
      } else {
        // Watermark removal
        res = await objectRemovalProcessor.processRemoval(
          {
            video: currentVideo!,
            config: watermarkConfig,
            quality: outputQuality,
          },
          (progress) => setProcessingProgress(progress),
          abortControllerRef.current.signal
        );
      }

      setOperationResult(res);
      onShowToast('Xử lý video hoàn tất thành công!', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Quá trình xử lý video thất bại.';
      onShowToast(msg, 'error');
    } finally {
      setIsProcessing(false);
      setProcessingProgress(null);
    }
  };

  const handlePreview3s = async () => {
    if (!currentVideo) return;
    try {
      setIsProcessing(true);
      abortControllerRef.current = new AbortController();
      const res = await objectRemovalProcessor.processRemoval(
        {
          video: currentVideo,
          config: watermarkConfig,
          quality: outputQuality,
          previewDurationSec: 3,
        },
        (progress) => setProcessingProgress(progress),
        abortControllerRef.current.signal
      );
      setOperationResult(res);
      onShowToast('Bản xem trước 3 giây đã sẵn sàng!', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tạo bản xem trước.';
      onShowToast(msg, 'error');
    } finally {
      setIsProcessing(false);
      setProcessingProgress(null);
    }
  };

  const handleCancelProcessing = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsProcessing(false);
    setProcessingProgress(null);
    onShowToast('Đã hủy thao tác xử lý video.', 'info');
  };

  const handleExecuteAllInOne = async (plan: AllInOnePlan) => {
    try {
      setIsProcessing(true);
      abortControllerRef.current = new AbortController();
      const res = await unifiedRenderService.renderAllInOne(
        plan,
        (progress) => setProcessingProgress(progress),
        abortControllerRef.current.signal
      );
      setOperationResult(res);
      onShowToast('Xuất video trọn gói All-in-One thành công!', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi xử lý xuất video trọn gói.';
      onShowToast(msg, 'error');
    } finally {
      setIsProcessing(false);
      setProcessingProgress(null);
    }
  };

  const tools: Array<{ id: ToolType; label: string; desc: string; icon: React.ReactNode }> = [
    {
      id: 'unified',
      label: '⚡ Trọn Gói 1 Lần',
      desc: 'Xóa logo + Cắt ghép + Chữ',
      icon: <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />,
    },
    {
      id: 'text',
      label: 'Thêm Chữ / Sub',
      desc: 'Font chữ, hiệu ứng động',
      icon: <Type className="w-4 h-4 text-pink-400 shrink-0" />,
    },
    {
      id: 'merge',
      label: 'Ghép Video',
      desc: 'Nối clip + Chuyển cảnh',
      icon: <Layers className="w-4 h-4 text-indigo-400 shrink-0" />,
    },
    {
      id: 'watermark',
      label: 'Xóa Logo / Mask',
      desc: 'Loại bỏ watermark/vật thể',
      icon: <Eraser className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'trim',
      label: 'Cắt Video',
      desc: 'Cắt chính xác mili-giây',
      icon: <Scissors className="w-4 h-4 shrink-0" />,
    },
  ];

  return (
    <div className="space-y-3.5 sm:space-y-6 pb-24 md:pb-10">
      {/* Step 1: Upload or Video Summary */}
      <VideoUploader
        currentVideo={currentVideo}
        onVideoSelected={handleVideoSelected}
        onError={(err) => onShowToast(err, 'error')}
      />

      {/* Main Workspace (Preview + Controls) */}
      {currentVideo && !operationResult && (
        <div className="space-y-3.5 sm:space-y-5">
          {/* Tool Segmented Bar with Glassmorphism: 2x3 on mobile, 5-col on tablet/desktop */}
          <div className="glass-panel p-1.5 rounded-2xl shadow-xl shadow-black/30">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {tools.map((t) => {
                const isSelected = activeTool === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTool(t.id)}
                    className={`min-h-[42px] sm:min-h-[46px] flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                      isSelected
                        ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-600/30 ring-1 ring-indigo-400/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                    }`}
                  >
                    {t.icon}
                    <span className="truncate">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Desktop/Tablet 2-Column or Mobile Stack */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-5 items-start">
            {/* Left/Top: Video Preview Player (7 Cols on desktop) */}
            <div className="lg:col-span-7 space-y-3">
              <VideoPlayer
                ref={playerRef}
                video={currentVideo}
                onTimeUpdate={(t) => setCurrentTime(t)}
                highlightRange={
                  activeTool === 'trim'
                    ? { start: trimConfig.startTime, end: trimConfig.endTime }
                    : undefined
                }
                overlayNode={
                  activeTool === 'text' ? (
                    <TextOverlayCanvas
                      items={textItems}
                      selectedId={selectedTextId}
                      onSelectItem={setSelectedTextId}
                      onUpdateItemPosition={(id, x, y) => {
                        setTextItems((prev) =>
                          prev.map((it) => (it.id === id ? { ...it, positionPreset: 'custom', x, y } : it))
                        );
                      }}
                      currentTime={currentTime}
                      totalDuration={currentVideo.metadata.duration || 10}
                    />
                  ) : activeTool === 'watermark' ? (
                    <ObjectRemovalOverlay
                      config={watermarkConfig}
                      onChange={setWatermarkConfig}
                    />
                  ) : activeTool === 'unified' ? (
                    <>
                      <ObjectRemovalOverlay
                        config={watermarkConfig}
                        onChange={setWatermarkConfig}
                      />
                      <TextOverlayCanvas
                        items={textItems}
                        selectedId={selectedTextId}
                        onSelectItem={setSelectedTextId}
                        onUpdateItemPosition={(id, x, y) => {
                          setTextItems((prev) =>
                            prev.map((it) => (it.id === id ? { ...it, positionPreset: 'custom', x, y } : it))
                          );
                        }}
                        currentTime={currentTime}
                        totalDuration={currentVideo.metadata.duration || 10}
                      />
                    </>
                  ) : undefined
                }
              />
            </div>

            {/* Right/Bottom: Tool Controls & Quality (5 Cols on desktop) */}
            <div className="lg:col-span-5 space-y-4">
              {activeTool === 'unified' && (
                <AllInOneControls
                  currentVideo={currentVideo}
                  quality={outputQuality}
                  trimConfig={trimConfig}
                  onChangeTrimConfig={setTrimConfig}
                  watermarkConfig={watermarkConfig}
                  onChangeWatermarkConfig={setWatermarkConfig}
                  mergeItems={mergeItems}
                  onChangeMergeItems={setMergeItems}
                  autoTransitions={autoTransitions}
                  onToggleAutoTransitions={setAutoTransitions}
                  textItems={textItems}
                  onChangeTextItems={setTextItems}
                  onExecuteAllInOne={handleExecuteAllInOne}
                  onPreviewTrim={(start, end) => {
                    if (playerRef.current) {
                      playerRef.current.seekTo(start);
                      playerRef.current.play();
                    }
                  }}
                  onSwitchToolTab={(tool) => setActiveTool(tool)}
                  isProcessing={isProcessing}
                />
              )}

              {activeTool === 'text' && (
                <TextOverlayEditor
                  items={textItems}
                  selectedId={selectedTextId}
                  onSelectId={setSelectedTextId}
                  onItemsChange={setTextItems}
                  currentTime={currentTime}
                  totalDuration={currentVideo.metadata.duration || 10}
                />
              )}

              {activeTool === 'trim' && (
                <TrimControls
                  duration={currentVideo.metadata.duration}
                  trimConfig={trimConfig}
                  currentTime={currentTime}
                  onChange={setTrimConfig}
                  onPreviewTrim={handlePreviewTrim}
                  onSeekTo={(t) => playerRef.current?.seekTo(t)}
                />
              )}

              {activeTool === 'merge' && (
                <MergeVideoList
                  items={mergeItems}
                  onItemsChange={setMergeItems}
                  onAddFiles={handleAddMergeFiles}
                  onSelectPreview={(v) => {
                    onSelectVideo(v);
                    setTrimConfig({ startTime: 0, endTime: v.metadata.duration || 5 });
                  }}
                  selectedPreviewId={currentVideo.id}
                  autoTransitions={autoTransitions}
                  onToggleAutoTransitions={setAutoTransitions}
                />
              )}

              {activeTool === 'watermark' && (
                <ObjectRemovalSelector
                  config={watermarkConfig}
                  onChange={setWatermarkConfig}
                  onPreview3s={handlePreview3s}
                  isPreviewing={isProcessing}
                />
              )}

              {/* Output Quality Setting */}
              <QualitySelector
                value={outputQuality}
                onChange={onChangeQuality}
              />

              {/* Primary Processing Action Button for non-unified tools */}
              {activeTool !== 'unified' && (
                <button
                  type="button"
                  onClick={handleProcessVideo}
                  className="w-full min-h-[48px] flex items-center justify-center gap-2.5 py-3 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-xl shadow-indigo-900/30 transition-all hover:scale-[1.01] active:scale-[0.99]"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>
                    {activeTool === 'trim' && 'Tiến hành Cắt Video'}
                    {activeTool === 'merge' && `Ghép ${mergeItems.length} Video với Chuyển Cảnh`}
                    {activeTool === 'text' && 'Xuất Video Có Lớp Chữ Chuyên Nghiệp'}
                    {activeTool === 'watermark' &&
                      (watermarkConfig.method === 'cover'
                        ? 'Bắt đầu Che phủ Logo / Object'
                        : watermarkConfig.method === 'ai_inpaint'
                        ? 'Chạy AI Inpainting (Cần AI Engine)'
                        : 'Bắt đầu Làm mờ Logo / Object')}
                  </span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Result View when finished */}
      {operationResult && (
        <VideoResult
          result={operationResult}
          onReset={() => setOperationResult(null)}
          onJumpToAI={onJumpToAI}
        />
      )}

      {/* Processing Modal Overlay */}
      <ProcessingModal
        isOpen={isProcessing}
        progress={processingProgress}
        onCancel={handleCancelProcessing}
      />
    </div>
  );
};
