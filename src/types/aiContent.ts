export type Platform = 'tiktok' | 'youtube' | 'facebook' | 'instagram';

export type ContentTone =
  | 'natural'
  | 'genz'
  | 'professional'
  | 'strong_hook'
  | 'review'
  | 'sales'
  | 'storytelling';

export type TargetLanguage = 'vi' | 'en';

export type VideoPurpose =
  | 'knowledge'
  | 'entertainment'
  | 'review'
  | 'vlog'
  | 'commercial'
  | 'news';

export interface TranscriptSegment {
  start: number; // seconds
  end: number;   // seconds
  text: string;
  speaker?: string;
}

export interface VideoTranscript {
  fullText: string;
  segments: TranscriptSegment[];
  language?: string;
  confidence?: number;
  hasSpeech: boolean;
  engineUsed?: 'gemini-3.5-transcribe' | 'gemini-3.8-flash' | 'fallback';
}

export interface TranscriptOptions {
  targetLanguage?: 'vi' | 'en' | 'auto';
  includeTimestamps?: boolean;
  onProgress?: (message: string) => void;
}

export interface KeyMoment {
  timestampSec: number;
  description: string;
}

export interface VideoUnderstandingContext {
  summary: string;
  subjects?: string[];
  topics?: string[];
  visualHighlights?: string[];
  spokenTopics?: string[];
  language?: string;
  detectedMood?: string;
  keyMoments?: KeyMoment[];
  onScreenText?: string[];
  transcript?: VideoTranscript;
  videoPurpose?: VideoPurpose;
  userNotes?: string;
  editedTranscript?: string;
}

export interface VideoFrameSample {
  timestampSec: number;
  mimeType: string;
  data: string; // base64
}

export interface VideoAnalysisRequest {
  videoName: string;
  duration: number;
  aspectRatio: string;
  hasAudio: boolean;
  frames: VideoFrameSample[];
  transcript?: VideoTranscript;
  videoPurpose?: VideoPurpose;
  userNotes?: string;
}

export interface AIContentGenerationPayload {
  context: VideoUnderstandingContext;
  platform: Platform;
  tone: ContentTone;
  language: TargetLanguage;
  videoName: string;
  videoPurpose?: VideoPurpose;
  userNotes?: string;
  editedTranscript?: string;
  regenerateSeed?: number;
}

export interface AIContentPackage {
  id: string;
  videoId: string;
  videoTitle: string;
  platform: Platform;
  tone: ContentTone;
  language: TargetLanguage;
  videoPurpose?: VideoPurpose;
  title: string;
  alternativeTitles?: string[];
  description: string;
  introduction: string; // 3s opening hook / script intro
  hashtags: string[];
  cta: string;
  trendTip?: string;
  createdAt: number;
  sourceSummary?: string;
  context?: VideoUnderstandingContext;
}

export interface ContentGenerationRequest {
  videoId: string;
  videoName: string;
  durationSeconds: number;
  platform: Platform;
  tone: ContentTone;
  language: TargetLanguage;
  videoPurpose?: VideoPurpose;
  userPromptHint?: string;
  userNotes?: string;
  editedTranscript?: string;
}

export interface VideoAnalysis {
  summary: string;
  keywords: string[];
  pacing: 'fast' | 'moderate' | 'calm';
  detectedMood: string;
  suggestedHooks: string[];
}

