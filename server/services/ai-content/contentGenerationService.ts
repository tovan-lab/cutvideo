import { GoogleGenAI, Type } from '@google/genai';
import {
  PlatformSEOItem,
  SEOPlatform,
  TitleTone,
  VideoFacts,
} from '../../../src/lib/ai-content/types';
import { buildPromptForPlatform, PLATFORM_RULES } from '../../../src/lib/ai-content/platform-rules';
import { AI_CONFIG } from '../../config/aiConfig';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

async function callGenAIWithRetry(ai: GoogleGenAI, prompt: string, schema: any) {
  const models = [AI_CONFIG.MODELS.PRIMARY, AI_CONFIG.MODELS.FALLBACK, 'gemini-2.5-flash', 'gemini-2.0-flash'];
  let lastErr: any = null;
  for (const model of models) {
    try {
      return await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      });
    } catch (e: any) {
      lastErr = e;
      console.warn(`[ContentGen] Model ${model} retry error: ${e?.message?.slice(0, 120)}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw lastErr;
}

export class ContentGenerationService {
  /**
   * Generates tailored SEO content package for a single platform
   */
  async generateForPlatform(
    platform: SEOPlatform,
    facts: VideoFacts,
    primaryKeyword: string,
    suggestedKeywords: string[],
    keywordSourcesMap: Record<string, string>,
    tone: TitleTone,
    channelName?: string,
    userContext?: string
  ): Promise<PlatformSEOItem> {
    const ai = getGeminiClient();
    if (!ai) {
      throw new Error('GEMINI_API_KEY chưa được cấu hình.');
    }

    const prompt = buildPromptForPlatform(
      platform,
      facts,
      primaryKeyword,
      suggestedKeywords,
      tone,
      channelName,
      userContext
    );

    const rule = PLATFORM_RULES[platform];

    const response = await callGenAIWithRetry(ai, prompt, {
      type: Type.OBJECT,
      properties: {
        titles: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Chính xác 3 phương án tiêu đề khác nhau chuẩn SEO và đúng luật ký tự.',
        },
        description: {
          type: Type.STRING,
          description: 'Nội dung mô tả / caption hoàn chỉnh cho nền tảng.',
        },
        hashtags: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Danh sách hashtag viết liền không dấu.',
        },
        tags: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: '10-15 từ khóa tags cho YouTube (hoặc mảng rỗng nếu là TikTok/FB/IG).',
        },
      },
      required: ['titles', 'description', 'hashtags'],
    });

    const parsed = JSON.parse(response.text || '{}');

    let titles: string[] = Array.isArray(parsed.titles) ? parsed.titles : [];
    if (titles.length === 0) {
      titles = [facts.main_topic, `${primaryKeyword} - ${facts.main_topic}`, `Khám phá ${facts.main_topic}`];
    }
    // Ensure titles meet maximum length constraint
    titles = titles.slice(0, 3).map((t) => t.trim().slice(0, rule.maxTitleLength));

    let description = (parsed.description || '').trim();
    let hashtags: string[] = Array.isArray(parsed.hashtags)
      ? parsed.hashtags.map((h: string) => (h.startsWith('#') ? h : `#${h}`).replace(/\s+/g, ''))
      : [];

    // Ensure required hashtags (e.g. #shorts for YouTube shorts)
    if (rule.requiredHashtags) {
      for (const req of rule.requiredHashtags) {
        if (!hashtags.includes(req)) {
          hashtags.push(req);
        }
      }
    }

    let tags: string[] = Array.isArray(parsed.tags) ? parsed.tags.map((t: string) => t.trim()) : [];
    if (platform === 'youtube_long' || platform === 'youtube_shorts') {
      if (tags.length === 0) {
        tags = [primaryKeyword, ...suggestedKeywords.slice(0, 10)];
      }
    } else {
      tags = [];
    }

    return {
      platform,
      titles,
      selectedTitleIndex: 0,
      description,
      hashtags,
      tags,
      primary_keyword: primaryKeyword,
      keyword_sources: keywordSourcesMap,
      match_score: 100, // will be verified by FactCheckService in Step 4
      match_details: [],
    };
  }
}

export const contentGenerationService = new ContentGenerationService();
