import { geminiVideoFactsService } from '../server/services/ai-content/geminiVideoFactsService';
import { keywordResearchService } from '../server/services/ai-content/keywordResearchService';
import { contentGenerationService } from '../server/services/ai-content/contentGenerationService';
import { factCheckService } from '../server/services/ai-content/factCheckService';
import {
  PlatformSEOItem,
  SEOContentPackage,
  SEOPlatform,
  TitleTone,
} from '../src/lib/ai-content/types';

export async function handleRequest(req: any, res: any) {
  // 1. Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  // Parse path
  let pathStr = (req.url || '').split('?')[0];
  if (Array.isArray(req.query?.path)) {
    pathStr = '/' + req.query.path.join('/');
  }

  // Parse body if needed
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {}
  }
  body = body || {};

  try {
    // 1. Health check
    if (pathStr.endsWith('/health') || pathStr === '/health' || pathStr === '/api/health') {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify({ status: 'ok', serverless: true, time: new Date().toISOString() }));
      return;
    }

    // 2. create-upload-session
    if (pathStr.includes('create-upload-session')) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            success: false,
            error: 'API_KEY_MISSING',
            message: 'GEMINI_API_KEY chưa được cấu hình trong Environment Variables của Vercel.',
          })
        );
        return;
      }

      const { fileName, fileSize, mimeType } = body;
      if (!fileSize) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            success: false,
            error: 'INVALID_PARAMS',
            message: 'Thiếu thông tin kích thước video.',
          })
        );
        return;
      }

      const cleanFileName = fileName || 'video.mp4';
      const cleanMimeType = mimeType || 'video/mp4';

      console.log(`[Serverless] Creating Gemini Resumable Upload session for ${cleanFileName} (${fileSize} bytes)...`);

      const initRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': String(fileSize),
          'X-Goog-Upload-Header-Content-Type': cleanMimeType,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file: {
            display_name: cleanFileName,
          },
        }),
      });

      if (!initRes.ok) {
        const errText = await initRes.text();
        res.statusCode = initRes.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            success: false,
            error: 'GEMINI_SESSION_FAILED',
            message: `Không thể tạo phiên tải lên Gemini (${initRes.status}): ${errText.slice(0, 100)}`,
          })
        );
        return;
      }

      const uploadUrl = initRes.headers.get('x-goog-upload-url');
      if (!uploadUrl) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            success: false,
            error: 'NO_UPLOAD_URL',
            message: 'Không nhận được đường dẫn tải lên từ Gemini.',
          })
        );
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, uploadUrl }));
      return;
    }

    // 3. extract-facts
    if (pathStr.includes('extract-facts')) {
      const { filePath, fileUri, fileName, originalName, mimeType } = body;
      if (!filePath && !fileUri) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            success: false,
            error: 'NO_VIDEO_SOURCE',
            message: 'Vui lòng cung cấp file video hoặc đường dẫn tải lên hợp lệ.',
          })
        );
        return;
      }

      const displayName = originalName || fileName || 'video.mp4';
      console.log(`[Serverless] Extracting video facts for ${displayName}...`);

      const facts = await geminiVideoFactsService.extractVideoFacts({
        filePath,
        fileUri,
        fileName,
        originalName: displayName,
        mimeType: mimeType || 'video/mp4',
      });

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, videoFacts: facts }));
      return;
    }

    // 4. research-keywords
    if (pathStr.includes('research-keywords')) {
      const { videoFacts, channelName, userKeyword } = body;
      if (!videoFacts) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: 'NO_FACTS', message: 'Thiếu dữ liệu Video Facts.' }));
        return;
      }

      const keywordResult = await keywordResearchService.researchKeywords(videoFacts, channelName, userKeyword);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, keywordResearch: keywordResult }));
      return;
    }

    // 5. generate-seo-package
    if (pathStr.includes('generate-seo-package')) {
      const {
        videoFacts,
        selectedPlatforms,
        keywordResearch,
        channelName,
        primaryKeyword,
        userContext,
        titleTone = 'professional',
        includeTranscript = true,
      } = body;

      if (!videoFacts || !Array.isArray(selectedPlatforms) || selectedPlatforms.length === 0) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            success: false,
            error: 'INVALID_PARAMS',
            message: 'Vui lòng cung cấp Video Facts và ít nhất 1 nền tảng.',
          })
        );
        return;
      }

      const effectivePrimaryKeyword =
        primaryKeyword?.trim() ||
        keywordResearch?.scored_keywords?.[0]?.keyword ||
        videoFacts.entities?.[0]?.name ||
        videoFacts.main_topic ||
        'video';

      const suggestedKeywords = (keywordResearch?.scored_keywords || [])
        .map((k: { keyword: string }) => k.keyword)
        .slice(0, 10);

      const keywordSourcesMap: Record<string, string> = {};
      if (keywordResearch?.scored_keywords) {
        for (const item of keywordResearch.scored_keywords) {
          keywordSourcesMap[item.keyword] = (item.sources || []).join(' + ');
        }
      }

      const platformResults: Partial<Record<SEOPlatform, PlatformSEOItem>> = {};
      for (const platform of selectedPlatforms as SEOPlatform[]) {
        const generatedItem = await contentGenerationService.generateForPlatform(
          platform,
          videoFacts,
          effectivePrimaryKeyword,
          suggestedKeywords,
          keywordSourcesMap,
          titleTone as TitleTone,
          channelName,
          userContext
        );
        const verifiedItem = await factCheckService.verifyAndRepair(generatedItem, videoFacts);
        platformResults[platform] = verifiedItem;
      }

      const seoPackage: SEOContentPackage = {
        videoFacts,
        platforms: platformResults,
        selectedPlatforms: selectedPlatforms as SEOPlatform[],
        keywordResearch: keywordResearch || {
          seed_keywords: [],
          youtube_suggestions: [],
          google_suggestions: [],
          trending_tags: [],
          scored_keywords: [],
        },
        channelName,
        primaryKeyword: effectivePrimaryKeyword,
        userContext,
        titleTone,
        includeTranscript,
        generatedAt: Date.now(),
      };

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, package: seoPackage }));
      return;
    }

    // Fallback 404
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        error: 'NOT_FOUND',
        message: `Endpoint không tồn tại: ${pathStr}`,
      })
    );
  } catch (err: any) {
    console.error('[Serverless Error]:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        error: 'SERVERLESS_INTERNAL_ERROR',
        message: err?.message || String(err),
        stack: err?.stack,
      })
    );
  }
}
