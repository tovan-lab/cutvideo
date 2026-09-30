import { GoogleGenAI } from '@google/genai';
import { KeywordResearchResult, KeywordScoreItem, VideoFacts } from '../../../src/lib/ai-content/types';
import { AI_CONFIG } from '../../config/aiConfig';

interface CacheEntry {
  data: KeywordResearchResult;
  timestamp: number;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const cache = new Map<string, CacheEntry>();

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

/**
 * Fetch with strict timeout helper (default 8s)
 */
async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    return null;
  }
}

export class KeywordResearchService {
  /**
   * Main entry point for Real Keyword Research with 6-hour caching
   */
  async researchKeywords(
    facts: VideoFacts,
    channelName?: string,
    userKeyword?: string
  ): Promise<KeywordResearchResult> {
    const cacheKey = `${facts.main_topic}_${facts.video_type}_${channelName || ''}_${userKeyword || ''}`.toLowerCase();
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log(`[KeywordResearch] Serving from 6h cache for key: ${cacheKey}`);
      return cached.data;
    }

    console.log(`[KeywordResearch] Running keyword research for topic: "${facts.main_topic}"...`);

    // 1. Generate 5-8 root Vietnamese seed keywords from VideoFacts
    const seedKeywords = this.generateSeedKeywords(facts, channelName, userKeyword);

    // 2. Fetch suggestions from YouTube Suggest & Google Suggest in parallel
    const [ytSuggestions, googleSuggestions, ytApiTags, trendingSocial] = await Promise.all([
      this.fetchYouTubeSuggestions(seedKeywords),
      this.fetchGoogleSuggestions(seedKeywords),
      this.fetchYouTubeDataApiTags(seedKeywords[0] || facts.main_topic),
      this.fetchSocialTrendingKeywords(facts),
    ]);

    // 3. Score keywords based on frequency, multi-source occurrence and relevance to VideoFacts
    const scoredKeywords = this.scoreAndFilterKeywords(
      facts,
      seedKeywords,
      ytSuggestions,
      googleSuggestions,
      ytApiTags,
      trendingSocial
    );

    const result: KeywordResearchResult = {
      seed_keywords: seedKeywords,
      youtube_suggestions: ytSuggestions.slice(0, 15),
      google_suggestions: googleSuggestions.slice(0, 15),
      trending_tags: [...ytApiTags, ...trendingSocial].slice(0, 15),
      scored_keywords: scoredKeywords.slice(0, 12),
    };

    cache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  }

  /**
   * Derive seed keywords strictly based on VideoFacts (no hallucination)
   */
  private generateSeedKeywords(facts: VideoFacts, channelName?: string, userKeyword?: string): string[] {
    const seeds = new Set<string>();

    if (userKeyword?.trim()) {
      seeds.add(userKeyword.trim());
    }

    if (channelName?.trim()) {
      seeds.add(channelName.trim());
    }

    // Add channel / entities from on-screen text
    for (const text of facts.on_screen_text) {
      if (text.length > 2 && text.length < 35) {
        seeds.add(text.trim());
      }
    }

    for (const entity of facts.entities) {
      if (entity.name) {
        seeds.add(entity.name.trim());
      }
    }

    if (facts.main_topic && facts.main_topic.length < 40) {
      seeds.add(facts.main_topic);
    }

    // If it's a specific type (e.g. ending screen)
    if (facts.video_type === 'màn hình kết thúc') {
      seeds.add('kết thúc video');
      seeds.add('cảm ơn đã xem');
      seeds.add('đăng ký kênh');
    } else if (facts.video_type === 'intro') {
      seeds.add('giới thiệu kênh');
    }

    // Return 5-8 unique keywords
    return Array.from(seeds).slice(0, 8);
  }

  /**
   * YouTube Search Suggest API (timeout 8s)
   */
  private async fetchYouTubeSuggestions(seeds: string[]): Promise<string[]> {
    const suggestions = new Set<string>();
    const promises = seeds.slice(0, 4).map(async (query) => {
      const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=vi&gl=VN&q=${encodeURIComponent(query)}`;
      const json = await fetchWithTimeout(url, 8000);
      if (Array.isArray(json) && Array.isArray(json[1])) {
        for (const item of json[1]) {
          if (typeof item === 'string') suggestions.add(item);
        }
      }
    });

    await Promise.allSettled(promises);
    return Array.from(suggestions);
  }

  /**
   * Google Search Suggest API (timeout 8s)
   */
  private async fetchGoogleSuggestions(seeds: string[]): Promise<string[]> {
    const suggestions = new Set<string>();
    const promises = seeds.slice(0, 4).map(async (query) => {
      const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=vi&gl=VN&q=${encodeURIComponent(query)}`;
      const json = await fetchWithTimeout(url, 8000);
      if (Array.isArray(json) && Array.isArray(json[1])) {
        for (const item of json[1]) {
          if (typeof item === 'string') suggestions.add(item);
        }
      }
    });

    await Promise.allSettled(promises);
    return Array.from(suggestions);
  }

  /**
   * YouTube Data API v3 (Search top videos within last 30 days)
   * Gracefully skipped if YOUTUBE_API_KEY is omitted or invalid.
   */
  private async fetchYouTubeDataApiTags(query: string): Promise<string[]> {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return [];

    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
        query
      )}&type=video&regionCode=VN&relevanceLanguage=vi&order=viewCount&publishedAfter=${thirtyDaysAgo}&maxResults=5&key=${apiKey}`;

      const res = await fetchWithTimeout(url, 8000);
      if (!res || !Array.isArray(res.items)) return [];

      const tags = new Set<string>();
      for (const item of res.items) {
        if (item.snippet?.title) {
          // Extract keywords or hashtags from title
          const title = item.snippet.title;
          const matches = title.match(/#[\w\d\p{L}]+/gu) || [];
          matches.forEach((m: string) => tags.add(m));
          tags.add(title.slice(0, 40));
        }
      }
      return Array.from(tags).slice(0, 10);
    } catch {
      return [];
    }
  }

  /**
   * Social Trending Keywords via Gemini with Google Search Grounding
   */
  private async fetchSocialTrendingKeywords(facts: VideoFacts): Promise<string[]> {
    const ai = getGeminiClient();
    if (!ai) return [];

    try {
      const prompt = `Dựa vào chủ đề: "${facts.main_topic}", hãy liệt kê 5-7 cụm từ tìm kiếm hoặc hashtag đang thịnh hành nhất tại Việt Nam trên TikTok, Facebook, Instagram liên quan trực tiếp đến chủ đề này. Chỉ trả về danh sách các từ cách nhau bởi dấu phẩy, không giải thích.`;
      const response = await ai.models.generateContent({
        model: AI_CONFIG.MODELS.PRIMARY,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const text = response.text || '';
      return text
        .split(/[,;\n]/)
        .map((s) => s.trim().replace(/^[-*•#\d.]+\s*/, ''))
        .filter((s) => s.length > 2 && s.length < 35);
    } catch {
      return [];
    }
  }

  /**
   * Multi-source Scoring & Strict Relevance Filtering against VideoFacts
   */
  private scoreAndFilterKeywords(
    facts: VideoFacts,
    seeds: string[],
    ytSuggestions: string[],
    googleSuggestions: string[],
    ytApiTags: string[],
    social: string[]
  ): KeywordScoreItem[] {
    const map = new Map<string, { count: number; sources: Set<string> }>();

    const record = (kw: string, src: string) => {
      const clean = kw.toLowerCase().trim();
      if (!clean || clean.length < 2 || clean.length > 45) return;
      if (!map.has(clean)) {
        map.set(clean, { count: 0, sources: new Set() });
      }
      const entry = map.get(clean)!;
      entry.count += 1;
      entry.sources.add(src);
    };

    seeds.forEach((k) => record(k, 'Seed Fact'));
    ytSuggestions.forEach((k) => record(k, 'YouTube Suggest'));
    googleSuggestions.forEach((k) => record(k, 'Google Suggest'));
    ytApiTags.forEach((k) => record(k, 'YouTube Top'));
    social.forEach((k) => record(k, 'Social Trend'));

    const items: KeywordScoreItem[] = [];

    // Fact relevance checker
    const factTextPool = `${facts.main_topic} ${facts.summary} ${facts.on_screen_text.join(' ')} ${facts.entities
      .map((e) => e.name)
      .join(' ')}`.toLowerCase();

    for (const [kw, val] of map.entries()) {
      // Relevance test: Must share at least one keyword token or be directly related
      const tokens = kw.split(/\s+/).filter((t) => t.length > 2);
      const isRelevant =
        facts.video_type === 'màn hình kết thúc' || facts.video_type === 'intro'
          ? kw.includes('kênh') ||
            kw.includes('đăng ký') ||
            kw.includes('cảm ơn') ||
            kw.includes('xem') ||
            tokens.some((t) => factTextPool.includes(t))
          : tokens.some((t) => factTextPool.includes(t));

      // DISCARD keywords that have no relevance to the video facts
      if (!isRelevant) {
        continue;
      }

      // Base score: number of sources * 25 + occurrence count
      const score = Math.min(100, val.sources.size * 25 + val.count * 5);

      items.push({
        keyword: kw,
        score,
        sources: Array.from(val.sources),
      });
    }

    return items.sort((a, b) => b.score - a.score);
  }
}

export const keywordResearchService = new KeywordResearchService();
