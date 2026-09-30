export type ToolType = 'trim' | 'merge' | 'watermark' | 'unified' | 'text';

export type OutputQuality = 'original' | '1080p' | '720p';

export type TransitionType =
  | 'none'
  | 'fade'
  | 'dissolve'
  | 'smoothleft'
  | 'smoothright'
  | 'smoothup'
  | 'smoothdown'
  | 'slideleft'
  | 'slideright'
  | 'slideup'
  | 'slidedown'
  | 'wipeleft'
  | 'wiperight'
  | 'wipeup'
  | 'wipedown'
  | 'circlecrop'
  | 'circleopen'
  | 'circleclose'
  | 'rectcrop'
  | 'distance'
  | 'zoomin'
  | 'pixelize'
  | 'radial'
  | 'hblur'
  | 'squeezeh'
  | 'squeezev'
  | 'hlslice'
  | 'hrslice'
  | 'fadeblack'
  | 'fadewhite';

export interface VideoTransition {
  type: TransitionType;
  duration: number; // in seconds (e.g. 0.5 - 1.5s)
}

export interface MergeItem {
  video: VideoItem;
  order: number;
  trimConfig?: TrimConfig;
  transition?: VideoTransition;
}

export type TextFontFamily =
  | 'Montserrat'
  | 'Roboto'
  | 'Inter'
  | 'Be Vietnam Pro'
  | 'Bebas Neue'
  | 'Oswald'
  | 'Playfair Display'
  | 'Caveat'
  | 'Arial';

export type TextAnimationType =
  | 'none'
  | 'fade'
  | 'slide_up'
  | 'slide_left'
  | 'zoom_in'
  | 'bounce'
  | 'typewriter';

export type TextPositionPreset = 'top' | 'center' | 'bottom' | 'lower_third' | 'custom';

export interface TextOverlayItem {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  fullDuration: boolean;
  // Typography
  fontFamily: TextFontFamily;
  fontSize: number; // 18 - 120
  isBold: boolean;
  isItalic: boolean;
  isUppercase: boolean;
  textAlign: 'left' | 'center' | 'right';
  // Color & Opacity
  textColor: string;
  opacity: number; // 0 - 100
  // Background Box / Highlight Tag
  boxEnabled: boolean;
  boxColor: string;
  boxOpacity: number; // 0 - 100
  boxPadding: number;
  boxRadius: number;
  // Outline / Stroke
  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;
  // Shadow
  shadowEnabled: boolean;
  shadowColor: string;
  shadowBlur: number;
  // Positioning
  positionPreset: TextPositionPreset;
  x: number; // 0 - 100%
  y: number; // 0 - 100%
  // Animation / Motion
  animation: TextAnimationType;
  animationDuration: number;
}

export interface VideoMetadata {
  duration: number; // in seconds
  width: number;
  height: number;
  aspectRatio: string;
  orientation: 'landscape' | 'portrait' | 'square';
  fps: number;
  sizeBytes: number;
  format: string;
  hasAudio: boolean;
  codec?: string;
  bitrateKbps?: number;
}

export interface VideoItem {
  id: string;
  name: string;
  url: string;
  blob?: Blob;
  file?: File;
  metadata: VideoMetadata;
  createdAt: number;
  isSample?: boolean;
}

export type TrimMode = 'fast_stream_copy' | 'precise_reencode';

export interface TrimConfig {
  startTime: number; // in seconds
  endTime: number; // in seconds
  mode?: TrimMode;
}

export interface MergeItem {
  video: VideoItem;
  order: number;
  trimConfig?: TrimConfig;
}

export interface BoundingBox {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  width: number; // percentage 0-100
  height: number; // percentage 0-100
}

export type ObjectRemovalMethod = 'blur' | 'cover' | 'delogo' | 'ai_inpaint';

export type MaskShape = 'rectangle' | 'polygon';

export interface ObjectMask {
  shape: MaskShape;
  boundingBox: BoundingBox;
  feather: number; // 0, 5, 10, 20 px
  tracking: boolean;
}

export interface ObjectRemovalConfig {
  area: BoundingBox;
  method: ObjectRemovalMethod;
  feather: number;
  coverColor?: string; // e.g. '#000000' or sampled
  tracking: boolean;
  applyEntireVideo: boolean;
  showMaskOverlay?: boolean;
  enabled?: boolean; // Tắt/ẩn xóa watermark nếu clip không có watermark (mặc định true)
  targetClipIndex?: number | 'all'; // Áp dụng cho toàn bộ hay chỉ clip cụ thể
  timeRange?: {
    startSec: number;
    endSec: number;
  };
}

export interface WatermarkPreset {
  id: string;
  name: string;
  aspectRatio: '9:16' | '16:9' | 'custom';
  area: BoundingBox;
  description: string;
}

export const NOTEBOOKLM_PRESETS: Record<'9:16' | '16:9', WatermarkPreset> = {
  '9:16': {
    id: 'notebooklm_portrait',
    name: 'NotebookLM (Dọc 9:16 - Shorts/TikTok)',
    aspectRatio: '9:16',
    area: { x: 70, y: 95.2, width: 28, height: 3.8 },
    description: 'Vùng watermark Gemini Notebook ở góc dưới bên phải khổ 9:16',
  },
  '16:9': {
    id: 'notebooklm_landscape',
    name: 'NotebookLM (Ngang 16:9 - YouTube)',
    aspectRatio: '16:9',
    area: { x: 88, y: 95.2, width: 11.2, height: 3.8 },
    description: 'Vùng watermark Gemini Notebook ở góc dưới bên phải khổ 16:9',
  },
};

export interface UnifiedEditPlan {
  video: VideoItem;
  trim?: {
    enabled: boolean;
    startSec: number;
    endSec: number;
  };
  watermark?: {
    enabled: boolean;
    method: 'blur' | 'cover' | 'delogo';
    area: BoundingBox;
    coverColor?: string;
    feather?: number;
    targetClipIndex?: number | 'all';
    timeRange?: {
      startSec: number;
      endSec: number;
    };
  };
  quality: OutputQuality;
}

export interface AllInOnePlan {
  videos: VideoItem[];
  trim?: {
    enabled: boolean;
    startSec: number;
    endSec: number;
  };
  clipTrims?: Array<{
    clipIndex: number;
    startSec: number;
    endSec: number;
  }>;
  watermark?: {
    enabled: boolean;
    method: 'blur' | 'cover' | 'delogo';
    area: BoundingBox;
    coverColor?: string;
    feather?: number;
    targetClipIndex?: number | 'all';
    timeRange?: {
      startSec: number;
      endSec: number;
    };
  };
  textItems?: TextOverlayItem[];
  merge?: {
    enabled: boolean;
    transitions?: { index: number; type: TransitionType; duration: number }[];
    autoTransitions?: boolean;
    defaultTransition?: TransitionType;
    transitionDuration?: number;
  };
  quality: OutputQuality;
}

export interface ObjectTrackingResult {
  supported: boolean;
  frameCount: number;
  trackedFrames?: number;
  message?: string;
}

export interface InpaintingAvailability {
  available: boolean;
  reason: string;
  engineName?: string;
}

export type ProcessingStage =
  | 'idle'
  | 'analyzing'
  | 'processing'
  | 'encoding'
  | 'finalizing'
  | 'completed'
  | 'error';

export interface ProcessingProgress {
  stage: ProcessingStage;
  percent: number;
  message: string;
  currentFrame?: number;
  totalFrames?: number;
  elapsedSeconds?: number;
}

export type ReencodeStatus = 'no_reencode' | 'reencoded' | 'standard';
export type ProcessingEngineType = 'native_ffmpeg' | 'ffmpeg' | 'browser' | 'ai_inpaint';

export interface EngineInfo {
  activeEngine: ProcessingEngineType;
  ffmpegLoaded: boolean;
  isStreamCopyCapable: boolean;
  message?: string;
}

export interface VideoOperationResult {
  success: boolean;
  videoUrl: string;
  videoName: string;
  downloadName: string;
  duration: number;
  sizeBytes: number;
  quality: OutputQuality;
  operation: ToolType;
  metadata: VideoMetadata;
  blob?: Blob;
  reencodeStatus?: ReencodeStatus;
  engineUsed?: ProcessingEngineType;
  error?: string;
}

export const ALL_TRANSITIONS: Array<{
  id: string;
  name: string;
  icon: string;
  category: string;
  desc: string;
}> = [
  { id: 'auto', name: 'Auto Smart Pool', icon: '🎲', category: 'Tự động', desc: 'Luân phiên đổi kiểu thông minh mượt mà' },
  { id: 'fade', name: 'Fade (Mờ dần)', icon: '🌟', category: 'Kinh điển', desc: 'Mờ dần vào clip tiếp theo' },
  { id: 'fadeblack', name: 'Fade Black', icon: '🖤', category: 'Điện ảnh', desc: 'Mờ qua đen phim ảnh sâu lắng' },
  { id: 'fadewhite', name: 'Fade White', icon: '🤍', category: 'Sôi động', desc: 'Chớp sáng trắng nổi bật' },
  { id: 'dissolve', name: 'Dissolve (Hòa tan)', icon: '🌊', category: 'Mềm mại', desc: 'Hòa tan đan xen giữa hai khung hình' },
  { id: 'smoothleft', name: 'Smooth Left', icon: '⬅️', category: 'Lướt êm', desc: 'Lướt mềm sang trái tự nhiên' },
  { id: 'smoothright', name: 'Smooth Right', icon: '➡️', category: 'Lướt êm', desc: 'Lướt mềm sang phải tự nhiên' },
  { id: 'smoothup', name: 'Smooth Up', icon: '⬆️', category: 'Lướt êm', desc: 'Lướt mềm từ dưới lên trên' },
  { id: 'smoothdown', name: 'Smooth Down', icon: '⬇️', category: 'Lướt êm', desc: 'Lướt mềm từ trên xuống dưới' },
  { id: 'slideleft', name: 'Slide Left', icon: '⏪', category: 'Trượt cảnh', desc: 'Đẩy khung hình sang trái' },
  { id: 'slideright', name: 'Slide Right', icon: '⏩', category: 'Trượt cảnh', desc: 'Đẩy khung hình sang phải' },
  { id: 'slideup', name: 'Slide Up', icon: '🔼', category: 'Trượt cảnh', desc: 'Đẩy khung hình từ dưới lên' },
  { id: 'slidedown', name: 'Slide Down', icon: '🔽', category: 'Trượt cảnh', desc: 'Đẩy khung hình từ trên xuống' },
  { id: 'wipeleft', name: 'Wipe Left', icon: '🪟', category: 'Gạt hình', desc: 'Gạt màn hình từ phải sang trái' },
  { id: 'wiperight', name: 'Wipe Right', icon: '🪟', category: 'Gạt hình', desc: 'Gạt màn hình từ trái sang phải' },
  { id: 'wipeup', name: 'Wipe Up', icon: '🪟', category: 'Gạt hình', desc: 'Gạt màn hình từ dưới lên' },
  { id: 'wipedown', name: 'Wipe Down', icon: '🪟', category: 'Gạt hình', desc: 'Gạt màn hình từ trên xuống' },
  { id: 'circlecrop', name: 'Circle Crop', icon: '⭕', category: 'Hình học', desc: 'Thu tròn vào tâm như ống kính máy ảnh' },
  { id: 'circleopen', name: 'Circle Open', icon: '🔘', category: 'Hình học', desc: 'Mở rộng vòng tròn từ tâm' },
  { id: 'circleclose', name: 'Circle Close', icon: '🔴', category: 'Hình học', desc: 'Đóng vòng tròn từ ngoài vào tâm' },
  { id: 'rectcrop', name: 'Rect Crop', icon: '🔲', category: 'Hình học', desc: 'Thu khung chữ nhật sắc nét' },
  { id: 'zoomin', name: 'Zoom In', icon: '💥', category: 'Hiệu ứng', desc: 'Phóng to bùng nổ thu hút mắt' },
  { id: 'pixelize', name: 'Pixelize', icon: '👾', category: 'Kỹ thuật số', desc: 'Hiệu ứng vỡ điểm ảnh pixel' },
  { id: 'radial', name: 'Radial Clock', icon: '💫', category: 'Xoay quét', desc: 'Quét cánh quạt đồng hồ 360 độ' },
  { id: 'hblur', name: 'H-Blur', icon: '🌫️', category: 'Làm mờ', desc: 'Làm mờ chuyển động theo chiều ngang' },
  { id: 'squeezeh', name: 'Squeeze H', icon: '↔️', category: 'Co giãn', desc: 'Nén co giãn ngang đàn hồi' },
  { id: 'squeezev', name: 'Squeeze V', icon: '↕️', category: 'Co giãn', desc: 'Nén co giãn dọc đàn hồi' },
  { id: 'hlslice', name: 'H-Slice', icon: '🥢', category: 'Cắt lát', desc: 'Cắt lát song song theo sọc ngang' },
  { id: 'distance', name: 'Distance 3D', icon: '🌌', category: 'Chiều sâu', desc: 'Lùi sâu vào không gian 3 chiều' },
  { id: 'none', name: 'None (Cắt thẳng)', icon: '🎬', category: 'Cơ bản', desc: 'Cắt thẳng liền mạch không hiệu ứng' },
];
