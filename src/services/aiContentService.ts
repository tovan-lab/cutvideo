import {
  AIContentPackage,
  ContentGenerationRequest,
  ContentTone,
  Platform,
  TargetLanguage,
  VideoFrameSample,
  VideoPurpose,
  VideoTranscript,
  VideoUnderstandingContext,
} from '../types/aiContent';
import { VideoItem } from '../types/video';
import { transcriptService } from './transcriptService';

export interface IAIContentService {
  checkHealth(): Promise<{ configured: boolean; model: string }>;
  analyzeVideo(
    video: VideoItem,
    options?: {
      transcript?: VideoTranscript;
      videoPurpose?: VideoPurpose;
      userNotes?: string;
      skipTranscript?: boolean;
      onProgress?: (message: string) => void;
    }
  ): Promise<VideoUnderstandingContext>;
  generateContentPackage(
    request: ContentGenerationRequest,
    context?: VideoUnderstandingContext
  ): Promise<AIContentPackage>;
  getCachedContext(videoId: string): VideoUnderstandingContext | undefined;
  updateCachedContext(videoId: string, updates: Partial<VideoUnderstandingContext>): void;
}

class GeminiAIContentService implements IAIContentService {
  // Session cache to prevent repeated video analysis when only changing platform or style
  private sessionAnalysisCache = new Map<string, VideoUnderstandingContext>();

  /**
   * Health check to see if Gemini API key is configured on server
   */
  async checkHealth(): Promise<{ configured: boolean; model: string }> {
    try {
      const res = await fetch('/api/ai/health');
      if (!res.ok) return { configured: false, model: 'gemini-3.8-flash' };
      const data = await res.json();
      return { configured: Boolean(data.geminiConfigured), model: data.model || 'gemini-3.8-flash' };
    } catch {
      return { configured: false, model: 'gemini-3.8-flash' };
    }
  }

  getCachedContext(videoId: string): VideoUnderstandingContext | undefined {
    return this.sessionAnalysisCache.get(videoId);
  }

  updateCachedContext(videoId: string, updates: Partial<VideoUnderstandingContext>): void {
    const existing = this.sessionAnalysisCache.get(videoId);
    if (existing) {
      this.sessionAnalysisCache.set(videoId, { ...existing, ...updates });
    }
  }

  /**
   * Samples representative visual frames across the video duration using offscreen canvas.
   * This gives Gemini actual visual understanding of the video without uploading huge files.
   */
  private async extractKeyframes(video: VideoItem, sampleCount = 6): Promise<VideoFrameSample[]> {
    return new Promise((resolve) => {
      const vid = document.createElement('video');
      vid.crossOrigin = 'anonymous';
      vid.muted = true;
      vid.playsInline = true;
      vid.preload = 'auto';
      vid.src = video.url;

      const duration = Math.max(1, video.metadata.duration || 5);
      const canvas = document.createElement('canvas');
      const targetWidth = 480;
      const targetHeight = Math.round((targetWidth / (video.metadata.width || 1280)) * (video.metadata.height || 720));
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      const timestamps: number[] = [];
      for (let i = 1; i <= sampleCount; i++) {
        timestamps.push(Number(((i / (sampleCount + 1)) * duration).toFixed(2)));
      }

      const frames: VideoFrameSample[] = [];
      let currentIndex = 0;

      const captureNext = () => {
        if (currentIndex >= timestamps.length || !ctx) {
          vid.src = '';
          resolve(frames);
          return;
        }

        const targetTime = timestamps[currentIndex];
        vid.currentTime = targetTime;
      };

      vid.onseeked = () => {
        try {
          if (ctx) {
            ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            const base64Data = dataUrl.split(',')[1];
            if (base64Data) {
              frames.push({
                timestampSec: timestamps[currentIndex],
                mimeType: 'image/jpeg',
                data: base64Data,
              });
            }
          }
        } catch {
          // Canvas tainted or frame capture failure
        }
        currentIndex++;
        captureNext();
      };

      vid.onloadeddata = () => {
        captureNext();
      };

      vid.onerror = () => {
        resolve(frames);
      };
    });
  }

  /**
   * Analyzes real video visual content AND audio speech via Gemini Multimodal Pipeline
   */
  async analyzeVideo(
    video: VideoItem,
    options?: {
      transcript?: VideoTranscript;
      videoPurpose?: VideoPurpose;
      userNotes?: string;
      skipTranscript?: boolean;
      onProgress?: (message: string) => void;
    }
  ): Promise<VideoUnderstandingContext> {
    const onProgress = options?.onProgress;

    // 1. Check in-memory session cache first if no new options are forced
    if (this.sessionAnalysisCache.has(video.id) && !options?.userNotes && !options?.videoPurpose) {
      onProgress?.('Sử dụng dữ liệu phân tích video từ bộ nhớ phiên...');
      return this.sessionAnalysisCache.get(video.id)!;
    }

    // 2. Audio Transcription Phase (Skip or execute safely)
    let videoTranscript = options?.transcript;
    if (!videoTranscript) {
      if (options?.skipTranscript) {
        onProgress?.('Bỏ qua tạo lời thoại theo yêu cầu — Tập trung phân tích hình ảnh & bắt trend...');
        videoTranscript = {
          fullText: '',
          segments: [],
          hasSpeech: false,
          language: 'vi',
          engineUsed: 'fallback',
        };
      } else {
        try {
          onProgress?.('Đang phân tích âm thanh & lời nói từ video...');
          videoTranscript = await transcriptService.transcribe(video, {
            targetLanguage: 'auto',
            onProgress,
          });
        } catch (transcribeError) {
          console.warn('Transcription failed or unsupported, proceeding with visual-only analysis:', transcribeError);
          videoTranscript = {
            fullText: '',
            segments: [],
            hasSpeech: false,
            language: 'vi',
            engineUsed: 'fallback',
          };
        }
      }
    }

    // 3. Visual Sampling Phase (Sample 7-8 keyframes across the video)
    onProgress?.('Đang trích xuất các khung hình đại diện từ video...');
    const frames = await this.extractKeyframes(video, 7);

    // 4. Multimodal Unified Understanding Phase
    onProgress?.('AI Gemini đang xem video và phân tích chủ đề, bối cảnh, xu hướng...');
    try {
      const response = await fetch('/api/ai/analyze-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoName: video.name,
          duration: video.metadata.duration,
          aspectRatio: video.metadata.aspectRatio,
          hasAudio: video.metadata.hasAudio,
          frames,
          transcript: videoTranscript,
          videoPurpose: options?.videoPurpose,
          userNotes: options?.userNotes,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Không thể phân tích video qua Gemini.');
      }

      const context: VideoUnderstandingContext = result.context;
      // Ensure transcript is attached
      context.transcript = videoTranscript;
      context.videoPurpose = options?.videoPurpose || 'knowledge';
      context.userNotes = options?.userNotes || '';

      // Save to cache for session
      this.sessionAnalysisCache.set(video.id, context);
      return context;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Lỗi kết nối Gemini API.';
      console.warn('Gemini analysis error:', errorMsg);

      // Fallback context based on actual probed metadata and transcript
      const fallbackContext: VideoUnderstandingContext = {
        summary: `Video "${video.name}" (${video.metadata.aspectRatio}, thời lượng ${Math.round(video.metadata.duration)}s). Ghi nhận các chuyển động và diễn biến thị giác thực tế.${
          videoTranscript && videoTranscript.hasSpeech
            ? ` Lời thoại phát hiện: "${videoTranscript.fullText.slice(0, 100)}..."`
            : ''
        }`,
        subjects: ['Chủ thể video', 'Nội dung thị giác'],
        topics: ['Trải nghiệm', 'Xu hướng nội dung'],
        visualHighlights: [`Tỉ lệ khung hình ${video.metadata.aspectRatio}`, `${video.metadata.fps} FPS`],
        detectedMood: 'Tự nhiên & Bắt mắt',
        transcript: videoTranscript,
        videoPurpose: options?.videoPurpose || 'knowledge',
        userNotes: options?.userNotes || '',
      };
      this.sessionAnalysisCache.set(video.id, fallbackContext);
      return fallbackContext;
    }
  }

  /**
   * Generates social content package tailored for platform, style, language, and unified context
   */
  async generateContentPackage(
    request: ContentGenerationRequest,
    context?: VideoUnderstandingContext
  ): Promise<AIContentPackage> {
    // Ensure we have a video understanding context
    let videoContext = context;
    if (!videoContext && this.sessionAnalysisCache.has(request.videoId)) {
      videoContext = this.sessionAnalysisCache.get(request.videoId);
    }

    if (!videoContext) {
      // Default placeholder if context wasn't passed
      videoContext = {
        summary: `Video "${request.videoName}" với thời lượng ${Math.round(request.durationSeconds)} giây.`,
        subjects: ['Chủ thể video'],
        topics: ['Nội dung mạng xã hội'],
        videoPurpose: request.videoPurpose || 'knowledge',
      };
    }

    try {
      const response = await fetch('/api/ai/generate-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: videoContext,
          platform: request.platform,
          tone: request.tone,
          language: request.language,
          videoName: request.videoName,
          videoPurpose: request.videoPurpose || videoContext.videoPurpose,
          userNotes: request.userNotes || videoContext.userNotes,
          editedTranscript: request.editedTranscript || videoContext.editedTranscript,
          regenerateSeed: Date.now(),
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Không thể tạo nội dung qua Gemini API.');
      }

      const data = result.data;
      return {
        id: `ai_${Date.now()}`,
        videoId: request.videoId,
        videoTitle: request.videoName,
        platform: request.platform,
        tone: request.tone,
        language: request.language,
        videoPurpose: request.videoPurpose || videoContext.videoPurpose,
        title: data.title,
        alternativeTitles: Array.isArray(data.alternativeTitles) ? data.alternativeTitles : [],
        introduction: data.introduction,
        description: data.description,
        hashtags: Array.isArray(data.hashtags) ? data.hashtags : ['#videocontent', '#creator'],
        cta: data.cta,
        trendTip: data.trendTip || '',
        createdAt: Date.now(),
        sourceSummary: data.sourceSummary || videoContext.summary,
        context: videoContext,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Lỗi gọi API.';
      throw new Error(errorMsg);
    }
  }
}

export const aiContentService: IAIContentService = new GeminiAIContentService();
