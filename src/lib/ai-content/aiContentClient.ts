import {
  AIContentSEOProgress,
  KeywordResearchResult,
  SEOContentPackage,
  SEOPlatform,
  TitleTone,
  VideoFacts,
} from './types';
import { VideoItem } from '../../types/video';

export interface VideoUploadResult {
  filePath?: string;
  fileUri?: string;
  fileName?: string;
  originalName: string;
  mimeType: string;
}

export class AIContentClient {
  /**
   * Upload video either directly to Google Gemini Files API (bypassing Vercel 4.5MB limit)
   * or via server upload /api/ai-content/upload as fallback.
   */
  async uploadVideo(
    video: VideoItem,
    onProgress?: (p: AIContentSEOProgress) => void
  ): Promise<VideoUploadResult> {
    onProgress?.({ step: 'reading_video', message: 'Chuẩn bị dữ liệu video...', percent: 5 });

    let fileOrBlob: Blob | File | null = null;
    if (video.file) {
      fileOrBlob = video.file;
    } else if (video.blob) {
      fileOrBlob = video.blob;
    } else if (video.url) {
      const res = await fetch(video.url);
      fileOrBlob = await res.blob();
    }

    if (!fileOrBlob) {
      throw new Error('Không thể tìm thấy dữ liệu tập tin video để phân tích.');
    }

    const fileName = video.name.endsWith('.mp4') ? video.name : `${video.name}.mp4`;
    const mimeType = fileOrBlob.type || 'video/mp4';
    const fileSize = fileOrBlob.size;

    // Strategy 1: Attempt direct upload to Google Gemini Files API via resumable upload session
    // This completely bypasses Vercel 4.5MB limits and works for videos up to 2GB.
    try {
      onProgress?.({ step: 'reading_video', message: 'Đang khởi tạo phiên tải lên đám mây...', percent: 10 });
      const sessionRes = await fetch('/api/ai-content/create-upload-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, fileSize, mimeType }),
      });

      if (sessionRes.ok) {
        const sessionData = await sessionRes.json();
        if (sessionData.uploadUrl) {
          onProgress?.({ step: 'reading_video', message: 'Đang tải video trực tiếp lên Gemini Cloud...', percent: 18 });
          const uploadRes = await fetch(sessionData.uploadUrl, {
            method: 'POST',
            headers: {
              'Content-Length': String(fileSize),
              'X-Goog-Upload-Offset': '0',
              'X-Goog-Upload-Command': 'upload, finalize',
            },
            body: fileOrBlob,
          });

          if (uploadRes.ok) {
            const uploadJson = await uploadRes.json();
            if (uploadJson.file && uploadJson.file.uri) {
              return {
                fileUri: uploadJson.file.uri,
                fileName: uploadJson.file.name,
                originalName: fileName,
                mimeType: uploadJson.file.mimeType || mimeType,
              };
            }
          } else {
            console.warn('[AIContentClient] Direct upload failed with status:', uploadRes.status, 'falling back to server upload');
          }
        }
      }
    } catch (directErr) {
      console.warn('[AIContentClient] Direct upload attempt error, falling back to server upload:', directErr);
    }

    // Strategy 2: Fallback to server multipart upload (/api/ai-content/upload)
    onProgress?.({ step: 'reading_video', message: 'Tải video lên engine phân tích...', percent: 15 });

    const formData = new FormData();
    formData.append('video', fileOrBlob, fileName);

    const res = await fetch('/api/ai-content/upload', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Lỗi tải video lên server (${res.status})`);
    }

    const json = await res.json();
    return {
      filePath: json.filePath,
      originalName: json.originalName || video.name,
      mimeType: json.mimeType || 'video/mp4',
    };
  }

  /**
   * Step 1: Extract Video Facts
   */
  async extractVideoFacts(
    sourceOrPath: string | VideoUploadResult,
    originalNameOrProgress?: string | ((p: AIContentSEOProgress) => void),
    mimeTypeOpt?: string,
    onProgressOpt?: (p: AIContentSEOProgress) => void
  ): Promise<VideoFacts> {
    let sourcePayload: any;
    let onProgress: ((p: AIContentSEOProgress) => void) | undefined;

    if (typeof sourceOrPath === 'string') {
      sourcePayload = {
        filePath: sourceOrPath,
        originalName: typeof originalNameOrProgress === 'string' ? originalNameOrProgress : 'video.mp4',
        mimeType: mimeTypeOpt || 'video/mp4',
      };
      onProgress = onProgressOpt;
    } else {
      sourcePayload = sourceOrPath;
      onProgress = typeof originalNameOrProgress === 'function' ? originalNameOrProgress : onProgressOpt;
    }

    onProgress?.({
      step: 'reading_video',
      message: 'Đang đọc hình ảnh & âm thanh thực tế qua Gemini (Video Facts)...',
      percent: 25,
    });

    const res = await fetch('/api/ai-content/extract-facts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sourcePayload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Không thể trích xuất sự thật video.');
    }

    const json = await res.json();
    return json.videoFacts;
  }

  /**
   * Step 2: Keyword Research
   */
  async researchKeywords(
    facts: VideoFacts,
    channelName?: string,
    userKeyword?: string,
    onProgress?: (p: AIContentSEOProgress) => void
  ): Promise<KeywordResearchResult> {
    onProgress?.({
      step: 'researching_keywords',
      message: 'Đang nghiên cứu từ khóa thực tế từ YouTube Suggest, Google Suggest & Trending...',
      percent: 50,
    });

    const res = await fetch('/api/ai-content/research-keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoFacts: facts, channelName, userKeyword }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Không thể nghiên cứu từ khóa.');
    }

    const json = await res.json();
    return json.keywordResearch;
  }

  /**
   * Step 3 & 4: Generate SEO Content & Fact-Check Verification
   */
  async generateSEOPackage(
    params: {
      videoFacts: VideoFacts;
      selectedPlatforms: SEOPlatform[];
      keywordResearch: KeywordResearchResult;
      channelName?: string;
      primaryKeyword?: string;
      userContext?: string;
      titleTone: TitleTone;
      includeTranscript: boolean;
    },
    onProgress?: (p: AIContentSEOProgress) => void
  ): Promise<SEOContentPackage> {
    onProgress?.({
      step: 'writing_content',
      message: `Đang viết nội dung chuẩn SEO cho ${params.selectedPlatforms.length} nền tảng...`,
      percent: 75,
    });

    const res = await fetch('/api/ai-content/generate-seo-package', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Không thể tạo gói nội dung SEO.');
    }

    onProgress?.({
      step: 'checking_facts',
      message: 'Đang đối chiếu từng câu với sự thật video & chuẩn hóa quy tắc...',
      percent: 90,
    });

    const json = await res.json();

    onProgress?.({
      step: 'done',
      message: 'Hoàn tất phân tích & tạo nội dung SEO chuẩn xác 100%!',
      percent: 100,
    });

    return json.package;
  }
}

export const aiContentClient = new AIContentClient();
