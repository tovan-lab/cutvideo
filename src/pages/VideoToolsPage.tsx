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
import { VideoPreviewModal } from '../components/video/VideoPreviewModal';
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

  // Preview before export state
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isInlinePreviewClean, setIsInlinePreviewClean] = useState(false);

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

  const handleApplyToAllInOne = () => {
    if (activeTool === 'trim' && currentVideo) {
      setMergeItems((prev) =>
        prev.map((it) =>
          it.video.id === currentVideo.id ? { ...it, trimConfig: { ...trimConfig } } : it
        )
      );
      onShowToast('✅ Đã lưu đoạn cắt và cập nhật vào Trọn Gói 1 Lần!', 'success');
      setActiveTool('unified');
    } else if (activeTool === 'watermark') {
      onShowToast('✅ Đã lưu vùng xóa logo và cập nhật vào Trọn Gói 1 Lần!', 'success');
      setActiveTool('unified');
    } else if (activeTool === 'text') {
      const valid = textItems.filter((t) => t.text.trim().length > 0);
      onShowToast(`✅ Đã lưu ${valid.length} lớp chữ và cập nhật vào Trọn Gói 1 Lần!`, 'success');
      setActiveTool('unified');
    } else if (activeTool === 'merge') {
      onShowToast(`✅ Đã lưu danh sách ghép ${mergeItems.length} video vào Trọn Gói 1 Lần!`, 'success');
      setActiveTool('unified');
    }
  };

  const handleVideoEnded = () => {
    if (mergeItems.length > 1 && currentVideo) {
      const currentIndex = mergeItems.findIndex((it) => it.video.id === currentVideo.id);
      if (currentIndex !== -1 && currentIndex < mergeItems.length - 1) {
        const nextItem = mergeItems[currentIndex + 1];
        onSelectVideo(nextItem.video);
        if (nextItem.trimConfig) {
          setTrimConfig(nextItem.trimConfig);
        } else {
          setTrimConfig({ startTime: 0, endTime: nextItem.video.metadata.duration || 5 });
        }
        setTimeout(() => {
          playerRef.current?.seekTo(nextItem.trimConfig ? nextItem.trimConfig.startTime : 0);
          playerRef.current?.play();
        }, 100);
      }
    }
  };

  const totalMergeDuration = React.useMemo(() => {
    if (mergeItems.length === 0) return currentVideo?.metadata.duration || 10;
    if (mergeItems.length === 1) {
      const it = mergeItems[0];
      return it.trimConfig
        ? Math.max(0.1, it.trimConfig.endTime - it.trimConfig.startTime)
        : (it.video.metadata.duration || 10);
    }
    const transDur = 0.75;
    let total = 0;
    for (let i = 0; i < mergeItems.length; i++) {
      const it = mergeItems[i];
      const effDur = it.trimConfig
        ? Math.max(0.1, it.trimConfig.endTime - it.trimConfig.startTime)
        : (it.video.metadata.duration || 5);
      if (i === 0) {
        total += effDur;
      } else {
        total += Math.max(0.1, effDur - transDur);
      }
    }
    return Math.max(1, Number(total.toFixed(2)));
  }, [mergeItems, currentVideo]);

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
            <div className="lg:col-span-7 space-y-2.5">
              {/* Preview Mode Switcher & Quick Launch Bar */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Chế độ xem:</span>
                  <div className="flex items-center p-0.5 rounded-xl bg-slate-900 border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setIsInlinePreviewClean(false)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        !isInlinePreviewClean
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      ✏️ Chỉnh sửa
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsInlinePreviewClean(true)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        isInlinePreviewClean
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      👀 Xem thành phẩm
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsPreviewModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-indigo-500/30 text-indigo-300 hover:text-white text-xs font-bold transition-all shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Xem Lại Toàn Bộ</span>
                </button>
              </div>

              <VideoPlayer
                ref={playerRef}
                video={currentVideo}
                onTimeUpdate={(t) => setCurrentTime(t)}
                onEnded={handleVideoEnded}
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
                      isPreviewMode={isInlinePreviewClean}
                    />
                  ) : activeTool === 'watermark' ? (
                    <ObjectRemovalOverlay
                      config={watermarkConfig}
                      onChange={setWatermarkConfig}
                      isPreviewMode={isInlinePreviewClean}
                    />
                  ) : activeTool === 'unified' ? (
                    <>
                      <ObjectRemovalOverlay
                        config={watermarkConfig}
                        onChange={setWatermarkConfig}
                        isPreviewMode={isInlinePreviewClean}
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
                        isPreviewMode={isInlinePreviewClean}
                      />
                    </>
                  ) : undefined
                }
              />

              {/* Sequential Playlist Bar for All Uploaded Videos */}
              {mergeItems.length > 1 && (
                <div className="p-3 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-2 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="text-xs font-bold text-white">
                        Danh sách video đã tải ({mergeItems.length} video):
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsPreviewModalOpen(true)}
                      className="flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded-lg transition-colors"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Xem toàn chuỗi</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                    {mergeItems.map((item, idx) => {
                      const isCurrent = currentVideo.id === item.video.id;
                      const isTrimmed =
                        item.trimConfig &&
                        (item.trimConfig.startTime > 0 ||
                          item.trimConfig.endTime < item.video.metadata.duration);
                      const effDur =
                        isTrimmed && item.trimConfig
                          ? item.trimConfig.endTime - item.trimConfig.startTime
                          : item.video.metadata.duration;

                      return (
                        <div key={item.video.id || idx} className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectVideo(item.video);
                              if (item.trimConfig) {
                                setTrimConfig(item.trimConfig);
                              } else {
                                setTrimConfig({
                                  startTime: 0,
                                  endTime: item.video.metadata.duration || 5,
                                });
                              }
                            }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                              isCurrent
                                ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-600/30 ring-1 ring-indigo-400'
                                : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
                            }`}
                          >
                            <span className="w-4 h-4 rounded-md bg-black/40 text-[10px] font-bold flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <div className="text-left min-w-0">
                              <p className="truncate max-w-[120px] text-xs font-medium">
                                {item.video.name}
                              </p>
                              <p className="text-[10px] opacity-75 font-mono">
                                {isTrimmed ? `✂️ ${effDur.toFixed(1)}s` : `${effDur.toFixed(1)}s`}
                              </p>
                            </div>
                          </button>
                          {idx < mergeItems.length - 1 && (
                            <span className="text-slate-600 text-xs font-bold">➔</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
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
                  onOpenPreviewModal={() => setIsPreviewModalOpen(true)}
                  onSelectVideoForEditing={(v) => {
                    onSelectVideo(v);
                    const item = mergeItems.find((m) => m.video.id === v.id);
                    if (item?.trimConfig) {
                      setTrimConfig(item.trimConfig);
                    } else {
                      setTrimConfig({ startTime: 0, endTime: v.metadata.duration || 5 });
                    }
                  }}
                  onAddFiles={handleAddMergeFiles}
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
                  totalDuration={mergeItems.length > 1 ? totalMergeDuration : (currentVideo.metadata.duration || 10)}
                  mergeItems={mergeItems}
                />
              )}

              {activeTool === 'trim' && (
                <div className="space-y-3">
                  {mergeItems.length > 1 && (
                    <div className="p-3 bg-slate-900/80 rounded-xl border border-indigo-500/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                          <Scissors className="w-3.5 h-3.5" />
                          Chọn clip cần cắt (trong chuỗi {mergeItems.length} video):
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {mergeItems.findIndex((m) => m.video.id === currentVideo.id) + 1}/{mergeItems.length}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {mergeItems.map((item, idx) => {
                          const isSelected = item.video.id === currentVideo.id;
                          const hasTrim = !!item.trimConfig;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setMergeItems((prev) =>
                                  prev.map((it) =>
                                    it.video.id === currentVideo.id ? { ...it, trimConfig: { ...trimConfig } } : it
                                  )
                                );
                                onSelectVideo(item.video);
                                if (item.trimConfig) {
                                  setTrimConfig(item.trimConfig);
                                } else {
                                  setTrimConfig({ startTime: 0, endTime: item.video.metadata.duration || 5 });
                                }
                              }}
                              className={`p-2 rounded-lg text-left text-xs border transition-all ${
                                isSelected
                                  ? 'bg-indigo-600/30 border-indigo-500 text-white font-medium ring-1 ring-indigo-500'
                                  : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:border-slate-500'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-bold text-[11px] text-indigo-400">#{idx + 1}</span>
                                {hasTrim && (
                                  <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1 rounded font-mono">
                                    ✂️ {item.trimConfig!.startTime.toFixed(1)}s-{item.trimConfig!.endTime.toFixed(1)}s
                                  </span>
                                )}
                              </div>
                              <p className="truncate text-[11px] mt-0.5">{item.video.name}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <TrimControls
                    duration={currentVideo.metadata.duration}
                    trimConfig={trimConfig}
                    currentTime={currentTime}
                    onChange={(newTrim) => {
                      setTrimConfig(newTrim);
                      setMergeItems((prev) =>
                        prev.map((it) =>
                          it.video.id === currentVideo.id ? { ...it, trimConfig: newTrim } : it
                        )
                      );
                    }}
                    onPreviewTrim={handlePreviewTrim}
                    onSeekTo={(t) => playerRef.current?.seekTo(t)}
                  />
                </div>
              )}

              {activeTool === 'merge' && (
                <MergeVideoList
                  items={mergeItems}
                  onItemsChange={setMergeItems}
                  onAddFiles={handleAddMergeFiles}
                  onSelectPreview={(v) => {
                    onSelectVideo(v);
                    const item = mergeItems.find((m) => m.video.id === v.id);
                    if (item?.trimConfig) {
                      setTrimConfig(item.trimConfig);
                    } else {
                      setTrimConfig({ startTime: 0, endTime: v.metadata.duration || 5 });
                    }
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
                  mergeItems={mergeItems}
                  currentTime={currentTime}
                  totalDuration={mergeItems.length > 1 ? totalMergeDuration : (currentVideo.metadata.duration || 10)}
                />
              )}

              {/* Output Quality Setting */}
              <QualitySelector
                value={outputQuality}
                onChange={onChangeQuality}
              />

              {/* Dual Action Buttons for non-unified tools */}
              {activeTool !== 'unified' && (
                <div className="space-y-2 pt-1">
                  {/* Primary CTA: Đồng Ý & Đưa Vào Trọn Gói 1 Lần (No download, switches to All-in-One overview) */}
                  <button
                    type="button"
                    onClick={handleApplyToAllInOne}
                    className="w-full min-h-[50px] flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-xl shadow-emerald-950/40 transition-all hover:scale-[1.01] active:scale-[0.99] border border-emerald-400/30"
                  >
                    <CheckCircle className="w-5 h-5 text-emerald-300 shrink-0" />
                    <span>
                      Đồng Ý &amp; Đưa Vào &quot;Trọn Gói 1 Lần&quot; (Xem Tổng Quan)
                    </span>
                    <Sparkles className="w-4 h-4 text-amber-300 ml-0.5" />
                  </button>

                  {/* Secondary CTA: Xuất riêng lẻ ngay (Optional download for this single tool) */}
                  <button
                    type="button"
                    onClick={handleProcessVideo}
                    className="w-full min-h-[40px] flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white font-medium text-xs border border-slate-700/60 transition-all"
                  >
                    <Play className="w-3.5 h-3.5 fill-slate-400" />
                    <span>
                      {activeTool === 'trim' && 'Hoặc tải riêng đoạn cắt này ngay (không gộp)'}
                      {activeTool === 'merge' && `Hoặc tải riêng video ghép này ngay`}
                      {activeTool === 'text' && 'Hoặc tải riêng video kèm chữ này ngay'}
                      {activeTool === 'watermark' && 'Hoặc tải riêng video xóa logo này ngay'}
                    </span>
                  </button>
                </div>
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

      {/* Video Preview Modal Before Export */}
      {currentVideo && (
        <VideoPreviewModal
          isOpen={isPreviewModalOpen}
          onClose={() => setIsPreviewModalOpen(false)}
          videos={
            mergeItems.length > 0 ? mergeItems.map((m) => m.video) : [currentVideo]
          }
          mergeItems={mergeItems}
          trimConfig={trimConfig}
          enableTrim={activeTool === 'trim' || activeTool === 'unified'}
          watermarkConfig={watermarkConfig}
          enableWatermark={activeTool === 'watermark' || activeTool === 'unified'}
          textItems={textItems}
          enableText={activeTool === 'text' || activeTool === 'unified'}
          mergeEnabled={mergeItems.length > 1}
          autoTransitions={autoTransitions}
          onConfirmExport={() => {
            const clipTrims =
              mergeItems.length > 1
                ? mergeItems
                    .map((item, idx) => ({
                      clipIndex: idx,
                      startSec: item.trimConfig?.startTime ?? 0,
                      endSec: item.trimConfig?.endTime ?? item.video.metadata.duration ?? 0,
                    }))
                    .filter(
                      (ct) =>
                        ct.startSec > 0 ||
                        (ct.endSec > 0 &&
                          ct.endSec <
                            (mergeItems[ct.clipIndex]?.video.metadata.duration || 999999))
                    )
                : undefined;

            const plan: AllInOnePlan = {
              videos:
                mergeItems.length > 1
                  ? mergeItems.map((m) => m.video)
                  : [currentVideo],
              trim: {
                enabled: true,
                startSec: trimConfig.startTime,
                endSec: trimConfig.endTime,
              },
              clipTrims: clipTrims && clipTrims.length > 0 ? clipTrims : undefined,
              watermark:
                watermarkConfig.enabled !== false
                  ? {
                      enabled: true,
                      method:
                        watermarkConfig.method === 'ai_inpaint'
                          ? 'blur'
                          : watermarkConfig.method,
                      area: watermarkConfig.area,
                      coverColor: watermarkConfig.coverColor,
                      feather: watermarkConfig.feather,
                      targetClipIndex: watermarkConfig.targetClipIndex,
                      timeRange: watermarkConfig.timeRange,
                    }
                  : undefined,
              textItems: textItems.filter((t) => t.text.trim().length > 0),
              merge:
                mergeItems.length > 1
                  ? { enabled: true, autoTransitions }
                  : undefined,
              quality: outputQuality,
            };
            handleExecuteAllInOne(plan);
          }}
        />
      )}
    </div>
  );
};
