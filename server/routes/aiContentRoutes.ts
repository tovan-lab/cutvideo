import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { geminiVideoFactsService } from '../services/ai-content/geminiVideoFactsService';
import { keywordResearchService } from '../services/ai-content/keywordResearchService';
import { contentGenerationService } from '../services/ai-content/contentGenerationService';
import { factCheckService } from '../services/ai-content/factCheckService';
import {
  PlatformSEOItem,
  SEOContentPackage,
  SEOPlatform,
  TitleTone,
  VideoFacts,
} from '../../src/lib/ai-content/types';

export const aiContentRouter = Router();

// Dedicated temporary upload folder for AI Content
const tempUploadDir = path.resolve(process.cwd(), 'uploads', 'ai-content-temp');
if (!fs.existsSync(tempUploadDir)) {
  fs.mkdirSync(tempUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, tempUploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `ai_video_${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
});

/**
 * 1. Upload Video for AI Inspection
 */
aiContentRouter.post('/upload', upload.single('video'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'NO_FILE', message: 'Vui lòng chọn file video.' });
    }

    return res.json({
      success: true,
      filePath: req.file.path,
      fileName: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype || 'video/mp4',
      sizeBytes: req.file.size,
    });
  } catch (err: any) {
    console.error('[aiContentRouter] upload error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Lỗi tải video lên server.' });
  }
});

/**
 * 2. Step 1: Extract Video Facts (100% Ground Truth via Gemini Files API)
 */
aiContentRouter.post('/extract-facts', async (req: Request, res: Response) => {
  try {
    const { filePath, originalName, mimeType } = req.body;
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({
        success: false,
        error: 'FILE_NOT_FOUND',
        message: 'Không tìm thấy file video tạm thời trên server. Hãy upload lại.',
      });
    }

    console.log(`[aiContentRouter] Extracting video facts for ${originalName}...`);
    const facts = await geminiVideoFactsService.extractVideoFacts(filePath, originalName, mimeType);

    return res.json({
      success: true,
      videoFacts: facts,
    });
  } catch (err: any) {
    console.error('[aiContentRouter] extract-facts error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Lỗi trích xuất sự thật video.' });
  }
});

/**
 * 3. Step 2: Research Real Keywords (YouTube Suggest + Google Suggest + YouTube Data API)
 */
aiContentRouter.post('/research-keywords', async (req: Request, res: Response) => {
  try {
    const { videoFacts, channelName, userKeyword } = req.body;
    if (!videoFacts) {
      return res.status(400).json({ success: false, error: 'NO_FACTS', message: 'Thiếu dữ liệu Video Facts.' });
    }

    const keywordResult = await keywordResearchService.researchKeywords(videoFacts, channelName, userKeyword);

    return res.json({
      success: true,
      keywordResearch: keywordResult,
    });
  } catch (err: any) {
    console.error('[aiContentRouter] research-keywords error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Lỗi nghiên cứu từ khóa.' });
  }
});

/**
 * 4. Step 3 & 4: Full Multi-Platform Content Generation & Fact-Check Verification
 */
aiContentRouter.post('/generate-seo-package', async (req: Request, res: Response) => {
  try {
    const {
      videoFacts,
      selectedPlatforms,
      keywordResearch,
      channelName,
      primaryKeyword,
      userContext,
      titleTone = 'professional',
      includeTranscript = true,
    } = req.body;

    if (!videoFacts || !Array.isArray(selectedPlatforms) || selectedPlatforms.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PARAMS',
        message: 'Vui lòng cung cấp Video Facts và ít nhất 1 nền tảng.',
      });
    }

    // Determine primary keyword
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

    console.log(`[aiContentRouter] Generating SEO content for ${selectedPlatforms.length} platforms...`);

    const platformResults: Partial<Record<SEOPlatform, PlatformSEOItem>> = {};

    // Generate and fact-check for each selected platform
    for (const platform of selectedPlatforms as SEOPlatform[]) {
      // Step 3: Write tailored content
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

      // Step 4: Verify facts against VideoFacts and auto-repair if needed
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

    return res.json({
      success: true,
      package: seoPackage,
    });
  } catch (err: any) {
    console.error('[aiContentRouter] generate-seo-package error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Lỗi tạo nội dung SEO.' });
  }
});
