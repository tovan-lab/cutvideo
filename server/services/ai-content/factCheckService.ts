import { GoogleGenAI, Type } from '@google/genai';
import { MatchDetail, PlatformSEOItem, VideoFacts } from '../../../src/lib/ai-content/types';
import { PLATFORM_RULES } from '../../../src/lib/ai-content/platform-rules';
import { AI_CONFIG } from '../../config/aiConfig';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

export class FactCheckService {
  /**
   * Verifies fact alignment between generated content and ground truth VideoFacts.
   * Auto-rewrites claims that fail verification (up to 2 iterations).
   */
  async verifyAndRepair(
    item: PlatformSEOItem,
    facts: VideoFacts,
    iteration = 1
  ): Promise<PlatformSEOItem> {
    const ai = getGeminiClient();
    if (!ai) return item;

    console.log(`[FactCheck] Verifying ${item.platform} content (iteration ${iteration}/2)...`);

    // 1. Programmatic rule verification (lengths, hashtags, tags limit)
    const rule = PLATFORM_RULES[item.platform];
    const title = item.titles[item.selectedTitleIndex] || item.titles[0] || '';

    // Check tags total length for YouTube
    if (rule.maxTagsTotalLength && item.tags.length > 0) {
      let currentTagsLength = 0;
      const validTags: string[] = [];
      for (const t of item.tags) {
        if (currentTagsLength + t.length + 1 <= rule.maxTagsTotalLength) {
          validTags.push(t);
          currentTagsLength += t.length + 1;
        }
      }
      item.tags = validTags;
    }

    // 2. Gemini Semantic Fact Verification
    const verificationPrompt = `
BẠN LÀ CHUYÊN GIA KIỂM DUYỆT SỰ THẬT NỘI DUNG (FACT CHECKING & GROUND TRUTH AUDITOR).
Nhiệm vụ: Đối chiếu từng phát biểu / câu khẳng định trong TIÊU ĐỀ và MÔ TẢ với SỰ THẬT VIDEO (VIDEO FACTS).

SỰ THẬT VIDEO (100% GROUND TRUTH):
- Định dạng: ${facts.video_type}
- Chủ đề: ${facts.main_topic}
- Tóm tắt thực tế: "${facts.summary}"
- Chữ trên màn hình: ${facts.on_screen_text.join(' | ') || '(Không có)'}
- Thực thể / Tên riêng: ${facts.entities.map((e) => e.name).join(', ') || '(Không có)'}
- Số liệu & sự kiện: ${facts.numbers_and_facts.map((n) => n.fact).join('; ') || '(Không có)'}

NỘI DUNG CẦN ĐỐI CHIẾU:
- Tiêu đề: "${title}"
- Mô tả: "${item.description}"

QUY TẮC:
- Mọi câu khẳng định về số liệu, sự kiện, triển lãm, nhân vật PHẢI có căn cứ từ Video Facts.
- Nếu video là "màn hình kết thúc" hoặc "intro" mà nội dung bịa ra một chủ đề tin tức/triển lãm khác -> supported: false.
- Liệt kê từng phát biểu (claim), đánh giá supported: true/false, mốc thời gian (nếu có), và lý do.
`;

    try {
      const models = [AI_CONFIG.MODELS.PRIMARY, AI_CONFIG.MODELS.FALLBACK, 'gemini-2.5-flash', 'gemini-2.0-flash'];
      let response: any = null;
      for (const m of models) {
        try {
          response = await ai.models.generateContent({
            model: m,
            contents: verificationPrompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
              claims: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    claim: { type: Type.STRING },
                    supported: { type: Type.BOOLEAN },
                    timestamp: { type: Type.STRING },
                    reason: { type: Type.STRING },
                  },
                  required: ['claim', 'supported'],
                },
                description: 'Danh sách các phát biểu được kiểm tra đối chiếu với video facts.',
              },
              rewrite_needed: {
                type: Type.BOOLEAN,
                description: 'True nếu có phát biểu bị bịa đặt hoặc sai lệch cần viết lại.',
              },
              corrected_description: {
                type: Type.STRING,
                description: 'Bản mô tả đã được sửa sạch mọi chi tiết bịa đặt, bám 100% sự thật video.',
              },
              corrected_titles: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3 tiêu đề đã được sửa bám sát sự thật.',
              },
            },
            required: ['claims', 'rewrite_needed'],
          },
        },
      });
      break;
    } catch (e) {
      continue;
    }
  }

      const parsed = JSON.parse(response.text || '{}');
      const claims: MatchDetail[] = Array.isArray(parsed.claims) ? parsed.claims : [];

      const supportedCount = claims.filter((c) => c.supported).length;
      const totalCount = claims.length || 1;
      const score = Math.round((supportedCount / totalCount) * 100);

      item.match_details = claims;
      item.match_score = score;

      // If under 100% or rewrite needed and we haven't exceeded 2 iterations
      if ((score < 100 || parsed.rewrite_needed) && iteration < 2) {
        console.warn(`[FactCheck] Score is ${score}%. Auto-repairing with corrected text...`);
        if (parsed.corrected_description) {
          item.description = parsed.corrected_description.trim();
        }
        if (Array.isArray(parsed.corrected_titles) && parsed.corrected_titles.length > 0) {
          item.titles = parsed.corrected_titles.slice(0, 3);
        }
        // Run second verification pass
        return await this.verifyAndRepair(item, facts, iteration + 1);
      }
    } catch (err) {
      console.warn(`[FactCheck] Verification error (skipped gracefully):`, err);
    }

    return item;
  }
}

export const factCheckService = new FactCheckService();
