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
  | 'circlecrop'
  | 'circleopen'
  | 'zoomin'
  | 'pixelize'
  | 'hblur'
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
  watermark?: {
    enabled: boolean;
    method: 'blur' | 'cover' | 'delogo';
    area: BoundingBox;
    coverColor?: string;
    feather?: number;
  };
  textItems?: TextOverlayItem[];
  merge?: {
    enabled: boolean;
    transitions?: { index: number; type: TransitionType; duration: number }[];
    autoTransitions?: boolean;
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
