import 'dotenv/config';
import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import { inpaintingRouter } from './server/routes/inpaintingRoutes';
import { videoRouter } from './server/routes/videoRoutes';
import { aiContentRouter } from './server/routes/aiContentRoutes';
import { studioRouter } from './server/routes/studioRoutes';
import { AI_CONFIG } from './server/config/aiConfig';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Mount routers
app.use('/api/inpainting', inpaintingRouter);
app.use('/api/video', videoRouter);
app.use('/api/ai-content', aiContentRouter);
app.use('/api/studio', studioRouter);

// Shared Gemini client setup
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Helper to call Gemini models with retry and automatic fallback.
 * Prioritizes 'gemini-3.8-flash', and falls back to 'gemini-3.5-flash' on 503, 429, or model errors.
 */
async function callGeminiWithRetry(
  ai: GoogleGenAI,
  requestConfig: {
    contents: any;
    config?: any;
  }
) {
  const models = [AI_CONFIG.MODELS.PRIMARY, AI_CONFIG.MODELS.FALLBACK];
  let lastError: any = null;

  for (const modelName of models) {
    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Gemini] Calling model ${modelName} (attempt ${attempt}/${maxRetries})...`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: requestConfig.contents,
          config: requestConfig.config,
        });
        return { response, modelUsed: modelName };
      } catch (err: any) {
        lastError = err;
        const msg = err?.message || String(err);
        const status = err?.status || err?.code;
        console.warn(`[Gemini] Model ${modelName} attempt ${attempt} error: ${msg.slice(0, 160)}`);

        const isOverloadedOrRateLimited =
          msg.includes('503') ||
          msg.includes('high demand') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          status === 503 ||
          status === 429;

        if (isOverloadedOrRateLimited && attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
          continue;
        }
        break;
      }
    }
  }

  throw lastError || new Error('Hệ thống AI Gemini đang bận hoặc quá tải. Vui lòng thử lại sau giây lát.');
}

/**
 * Endpoint 0: Transcribe Audio using Gemini Audio Model (with automatic fallback & graceful handling)
 */
app.post('/api/ai/transcribe-audio', async (req: Request, res: Response) => {
  try {
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(400).json({
        success: false,
        error: 'API_KEY_MISSING',
        message: 'GEMINI_API_KEY chưa được cấu hình. Vui lòng thêm trong Settings > Secrets của AI Studio.',
      });
    }

    const { audioData, mimeType = 'audio/wav', duration = 0, language } = req.body;

    if (!audioData) {
      return res.json({
        success: true,
        transcript: {
          fullText: '',
          segments: [],
          language: language || 'vi',
          hasSpeech: false,
          engineUsed: 'none',
        },
      });
    }

    let fullText = '';
    let segments: Array<{ start: number; end: number; text: string; speaker?: string }> = [];
    let detectedLanguage = language || 'vi';
    let hasSpeech = false;

    try {
      const { response: structResponse, modelUsed } = await callGeminiWithRetry(ai, {
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: audioData,
              },
            },
            {
              text: `Phân tích âm thanh của video (thời lượng thực tế ~${Math.round(duration)}s).
Nhiệm vụ:
1. Xác định xem có lời nói/giọng nói con người (speech) hay không (hasSpeech: true/false). Nếu chỉ có nhạc nền, tiếng ồn hoặc im lặng, đặt hasSpeech: false.
2. Nếu có giọng nói, hãy chép chính xác toàn bộ lời thoại (fullText) và phân tách thành các đoạn phân cảnh có mốc thời gian bắt đầu (start) và kết thúc (end) thực tế bằng giây. Không tự bịa mốc thời gian nếu không nghe rõ.
3. Nhận diện ngôn ngữ chính (language, ví dụ "vi" hoặc "en").
4. Trả về đúng định dạng JSON theo schema.`,
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              hasSpeech: {
                type: Type.BOOLEAN,
                description: 'True nếu video có giọng nói/lời thoại con người thực sự, False nếu chỉ có nhạc nền hoặc im lặng.',
              },
              language: {
                type: Type.STRING,
                description: 'Ngôn ngữ chính nhận diện được (ví dụ "vi", "en").',
              },
              fullText: {
                type: Type.STRING,
                description: 'Toàn bộ nội dung lời thoại được phiên âm đầy đủ.',
              },
              segments: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    start: { type: Type.NUMBER, description: 'Giây bắt đầu đoạn nói' },
                    end: { type: Type.NUMBER, description: 'Giây kết thúc đoạn nói' },
                    text: { type: Type.STRING, description: 'Nội dung câu nói trong đoạn này' },
                    speaker: { type: Type.STRING, description: 'Tên hoặc nhãn người nói nếu nhận diện được' },
                  },
                  required: ['start', 'end', 'text'],
                },
                description: 'Danh sách các đoạn phân cảnh thời gian thật của lời nói.',
              },
            },
            required: ['hasSpeech', 'fullText'],
          },
        },
      });

      const structJson = JSON.parse(structResponse.text || '{}');
      if (structJson.hasSpeech) {
        hasSpeech = true;
        fullText = structJson.fullText || '';
        if (Array.isArray(structJson.segments)) {
          segments = structJson.segments.filter(
            (s: { start?: number; end?: number; text?: string }) =>
              typeof s.start === 'number' && typeof s.end === 'number' && s.end >= s.start && s.text
          );
        }
        detectedLanguage = structJson.language || detectedLanguage;
      }

      return res.json({
        success: true,
        transcript: {
          fullText: fullText.trim(),
          segments,
          language: detectedLanguage,
          hasSpeech,
          engineUsed: modelUsed,
        },
      });
    } catch (transcribeErr: unknown) {
      console.warn('Audio transcribe failed or skipped, returning empty speech transcript gracefully:', transcribeErr);
      return res.json({
        success: true,
        transcript: {
          fullText: '',
          segments: [],
          language: detectedLanguage,
          hasSpeech: false,
          engineUsed: 'fallback',
        },
      });
    }
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error in transcribe-audio:', err);
    return res.json({
      success: true,
      transcript: {
        fullText: '',
        segments: [],
        language: 'vi',
        hasSpeech: false,
        engineUsed: 'fallback',
      },
    });
  }
});

/**
 * Endpoint 1: Analyze Video Frames & Extract Real Understanding Context
 */
app.post('/api/ai/analyze-video', async (req: Request, res: Response) => {
  try {
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(400).json({
        success: false,
        error: 'API_KEY_MISSING',
        message: 'GEMINI_API_KEY chưa được cấu hình. Vui lòng thêm trong Settings > Secrets của AI Studio.',
      });
    }

    const { videoName, duration, aspectRatio, hasAudio, frames, transcript, videoPurpose, userNotes } = req.body;

    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'NO_FRAMES',
        message: 'Không có dữ liệu khung hình video để phân tích.',
      });
    }

    // Build multimodal prompt parts combining Visual + Audio Transcript + Purpose
    let transcriptContext = '';
    if (transcript && transcript.hasSpeech && transcript.fullText) {
      transcriptContext = `
NỘI DUNG LỜI NÓI (TRANSCRIPT) THỰC TẾ TRÍCH XUẤT TỪ ÂM THANH VIDEO:
"${transcript.fullText}"
${
  Array.isArray(transcript.segments) && transcript.segments.length > 0
    ? `Các mốc thời gian lời nói:\n` +
      transcript.segments
        .map((s: { start: number; end: number; text: string }) => `[${s.start}s - ${s.end}s]: "${s.text}"`)
        .slice(0, 15)
        .join('\n')
    : ''
}`;
    } else {
      transcriptContext = `\n(Lưu ý: Video không phát hiện lời nói hoặc là video tĩnh/âm thanh nền).\n`;
    }

    const purposeMap: Record<string, string> = {
      knowledge: 'Giáo dục / Chia sẻ kiến thức / Hướng dẫn cách làm',
      entertainment: 'Giải trí / Hài hước / Viral thu hút người xem',
      review: 'Đánh giá / Review sản phẩm / Trải nghiệm thực tế',
      vlog: 'Vlog đời sống / Du lịch / Câu chuyện hàng ngày',
      commercial: 'Tiếp thị / Bán hàng / Giới thiệu sản phẩm dịch vụ',
      news: 'Tin tức / Sự kiện / Bình luận chuyên sâu',
    };

    const textPrompt = `Bạn là chuyên gia phân tích nội dung video hàng đầu (Video Understanding AI).
Dưới đây là dữ liệu thực tế được trích xuất trực tiếp từ video:
- Tên tập tin: ${videoName || 'video.mp4'}
- Thời lượng: ${Math.round(duration || 0)} giây
- Tỉ lệ khung hình: ${aspectRatio || '16:9'}
- Có âm thanh: ${hasAudio ? 'Có' : 'Không'}
${videoPurpose ? `- Mục đích video được chỉ định: ${purposeMap[videoPurpose] || videoPurpose}` : ''}
${userNotes ? `- Ghi chú bổ sung từ người dùng: "${userNotes}"` : ''}
${transcriptContext}

NHIỆM VỤ CỦA BẠN:
1. QUAN SÁT KỸ CÁC BỨC ẢNH KHUNG HÌNH (Visual Analysis):
   - Nhận diện các chủ thể chính (con người, đồ vật, sản phẩm, địa danh, phong cảnh).
   - Xác định bối cảnh, màu sắc, hành động đang diễn ra.
   - Đọc các dòng chữ (text overlay, bảng hiệu, nhãn dán) nếu xuất hiện trên màn hình.
2. KẾT HỢP VỚI LỜI NÓI THỰC TẾ TRONG TRANSCRIPT (Unified Context):
   - Đối chiếu những gì nhân vật nói với những gì hiển thị trên màn hình.
   - Trích xuất bản tóm tắt hợp nhất chân thực (Unified Summary).
   - Xác định các khoảnh khắc then chốt (Key Moments) kèm mốc thời gian ước tính.
3. Trả về kết quả JSON theo đúng schema quy định.`;

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: textPrompt },
    ];

    // Add sampled image parts
    for (const frame of frames) {
      if (frame.data) {
        parts.push({
          inlineData: {
            mimeType: frame.mimeType || 'image/jpeg',
            data: frame.data,
          },
        });
      }
    }

    const { response, modelUsed } = await callGeminiWithRetry(ai, {
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: 'Bản tóm tắt hợp nhất 1-3 câu kết hợp chính xác những gì nhìn thấy trên khung hình và những gì được nói trong transcript (hoặc thuần túy thị giác nếu không có tiếng).',
            },
            subjects: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Danh sách các chủ thể chính (người, sản phẩm, vật thể, địa danh nhìn thấy trong video).',
            },
            topics: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Các chủ đề cốt lõi của video.',
            },
            visualHighlights: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Các chi tiết thị giác đáng chú ý hoặc khoảnh khắc ấn tượng trong các khung hình.',
            },
            spokenTopics: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Các ý chính hoặc luận điểm được người nói đề cập trong âm thanh (nếu có).',
            },
            onScreenText: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Các đoạn chữ hiển thị trên màn hình (nếu có).',
            },
            keyMoments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  timestampSec: { type: Type.NUMBER, description: 'Mốc thời gian giây trong video' },
                  description: { type: Type.STRING, description: 'Mô tả diễn biến quan trọng tại mốc thời gian này' },
                },
                required: ['timestampSec', 'description'],
              },
              description: 'Các mốc thời gian then chốt trong video.',
            },
            detectedMood: {
              type: Type.STRING,
              description: 'Không khí / phong cách / cảm xúc của video (ví dụ: Năng động, Hài hước, Trầm lắng, Hào hứng, Chuyên nghiệp).',
            },
            language: {
              type: Type.STRING,
              description: 'Ngôn ngữ nhận diện được trong bối cảnh và lời nói video.',
            },
          },
          required: ['summary', 'subjects', 'topics'],
        },
      },
    });

    const responseText = response.text || '';
    if (!responseText) {
      throw new Error('Gemini API không trả về nội dung phân tích.');
    }
    let context;
    try {
      context = JSON.parse(responseText);
    } catch {
      console.error('Failed to parse Gemini analysis JSON response:', responseText);
      return res.status(500).json({
        success: false,
        error: 'JSON_PARSE_ERROR',
        message: 'Dữ liệu phân tích từ Gemini không đúng định dạng JSON hợp lệ.',
      });
    }

    // Attach transcript and metadata to context
    if (transcript) {
      context.transcript = transcript;
    }
    if (videoPurpose) {
      context.videoPurpose = videoPurpose;
    }
    if (userNotes) {
      context.userNotes = userNotes;
    }
    context.engineUsed = modelUsed;

    return res.json({
      success: true,
      context,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error in analyze-video:', err);
    return res.status(500).json({
      success: false,
      error: 'GEMINI_ANALYSIS_FAILED',
      message: err.message || 'Không thể phân tích video qua Gemini API.',
    });
  }
});

/**
 * Endpoint 2: Generate Tailored Social Media Content from Video Context
 */
app.post('/api/ai/generate-content', async (req: Request, res: Response) => {
  try {
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(400).json({
        success: false,
        error: 'API_KEY_MISSING',
        message: 'GEMINI_API_KEY chưa được cấu hình. Vui lòng thêm trong Settings > Secrets của AI Studio.',
      });
    }

    const {
      context,
      platform = 'tiktok',
      tone = 'strong_hook',
      language = 'vi',
      videoName,
      videoPurpose,
      userNotes,
      editedTranscript,
      regenerateSeed,
    } = req.body;

    if (!context || !context.summary) {
      return res.status(400).json({
        success: false,
        error: 'NO_CONTEXT',
        message: 'Thiếu dữ liệu phân tích video để tạo nội dung.',
      });
    }

    const platformGuidelines: Record<string, string> = {
      tiktok:
        'Tối ưu cho TikTok: Tiêu đề ngắn gọn giật tít, Hook 3s đầu cực mạnh kích thích tò mò giữ chân người xem, mô tả súc tích kèm emoji hợp xu hướng, hashtag thịnh hành viral, CTA ngắn gọn kêu gọi thả tim/follow.',
      youtube:
        'Tối ưu cho YouTube/Shorts: Tiêu đề chuẩn SEO kích thích tỷ lệ click CTR cao, mô tả chi tiết có phân đoạn mốc thời gian hợp lý, hashtag từ khóa tìm kiếm, CTA đăng ký kênh và bật chuông.',
      facebook:
        'Tối ưu cho Facebook Reels/Post: Caption tự nhiên, có ngữ cảnh và chiều sâu chia sẻ, bố cục thoáng dễ đọc trên điện thoại, kích thích bình luận thảo luận cộng đồng, CTA chia sẻ bài viết.',
      instagram:
        'Tối ưu cho Instagram Reels/Feed: Tiêu đề súc tích thẩm mỹ, hook thị giác cuốn hút, caption ngắn gọn có spacing tinh tế, cụm hashtag chọn lọc chất lượng cao, CTA lưu/share reel.',
    };

    const toneGuidelines: Record<string, string> = {
      natural: 'Tự nhiên: Gần gũi, chân thành, trò chuyện thân mật như bạn bè chia sẻ.',
      genz: 'Gen Z: Ngôn từ năng động, bắt trend mạng xã hội, sắc sảo, dùng từ ngữ giới trẻ tự nhiên không gượng gạo.',
      professional: 'Chuyên nghiệp: Chuẩn mực, uy tín, lập luận rõ ràng, mang tính chuyên gia và giáo dục cao.',
      strong_hook: 'Hook mạnh: Tập trung tối đa vào 3 giây đầu tiên với câu hỏi giật mình, khoảng trống tò mò (curiosity gap) để chặn lướt.',
      review: 'Review: Khách quan, đánh giá trực tiếp trải nghiệm thực tế, nêu rõ điểm thích và điểm cần lưu ý.',
      sales: 'Bán hàng: Nêu bật lợi ích, giải quyết nỗi đau của khán giả, tính khan hiếm/cấp bách và thúc đẩy hành động ngay.',
      storytelling: 'Storytelling: Kể một câu chuyện có bối cảnh -> nút thắt -> bài học hoặc trải nghiệm ý nghĩa chạm cảm xúc.',
    };

    const purposeGuidelines: Record<string, string> = {
      knowledge: 'Mục đích: Giáo dục / Chia sẻ kiến thức. Làm rõ giá trị học được, các bước thực hiện ngắn gọn, lời khuyên lưu lại để tra cứu.',
      entertainment: 'Mục đích: Giải trí / Hài hước / Viral. Đẩy mạnh tính dí dỏm, cao trào, yếu tố bất ngờ, kích thích share cho bạn bè.',
      review: 'Mục đích: Đánh giá / Review sản phẩm / Trải nghiệm. Dẫn chứng chân thực từ hình ảnh và lời nói, nhận xét ưu/nhược điểm rõ ràng.',
      vlog: 'Mục đích: Vlog đời sống / Du lịch. Kể lại cảm xúc, hành trình, sự kết nối đồng hành với người xem.',
      commercial: 'Mục đích: Tiếp thị / Bán hàng. Nhấn mạnh vấn đề của người xem -> giải pháp -> kêu gọi đặt hàng hoặc tìm hiểu ngay.',
      news: 'Mục đích: Tin tức / Sự kiện. Cung cấp thông tin khách quan, chính xác, nêu bật điểm nóng.',
    };

    const effectivePurpose = videoPurpose || context.videoPurpose || 'knowledge';
    const effectiveNotes = userNotes || context.userNotes || '';
    const transcriptText =
      editedTranscript ||
      context.editedTranscript ||
      (context.transcript && context.transcript.hasSpeech ? context.transcript.fullText : '');

    const targetLangPrompt =
      language === 'en'
        ? 'Target Language: English. Write in natural, engaging native English.'
        : 'Ngôn ngữ đích: Tiếng Việt. Viết bằng tiếng Việt tự nhiên, trôi chảy, đúng văn phong mạng xã hội Việt Nam.';

    const systemPrompt = `Bạn là chuyên gia sáng tạo nội dung mạng xã hội & giám đốc tăng trưởng kênh triệu view (Viral Content Strategist).
Dưới đây là BỐI CẢNH THỰC TẾ ĐƯỢC QUAN SÁT TỪ VIDEO:
- Tóm tắt hình ảnh video: "${context.summary}"
- Các chủ thể nhìn thấy trong hình: ${Array.isArray(context.subjects) ? context.subjects.join(', ') : 'Chủ thể video'}
- Các chủ đề cốt lõi: ${Array.isArray(context.topics) ? context.topics.join(', ') : 'Chủ đề chính'}
- Chi tiết thị giác ấn tượng: ${Array.isArray(context.visualHighlights) ? context.visualHighlights.join(', ') : 'Hình ảnh video'}
- Chữ hiển thị trên màn hình: ${Array.isArray(context.onScreenText) ? context.onScreenText.join(', ') : 'Không có'}
- Cảm xúc/Không khí: ${context.detectedMood || 'Tự nhiên'}
${
  transcriptText
    ? `- Lời thoại từ âm thanh video: "${transcriptText}"`
    : '- Lưu ý: Video tập trung vào hình ảnh thị giác (không có lời thoại hoặc không cần tạo lời thoại).'
}
${effectiveNotes ? `- Ghi chú bổ sung từ người dùng: "${effectiveNotes}"` : ''}

CHIẾN LƯỢC NỘI DUNG YÊU CẦU:
- Nền tảng đích: ${platform.toUpperCase()} (${platformGuidelines[platform] || ''})
- Phong cách / Tông giọng: ${tone.toUpperCase()} (${toneGuidelines[tone] || ''})
- ${purposeGuidelines[effectivePurpose] || ''}
- ${targetLangPrompt}
${regenerateSeed ? `- Seed: ${regenerateSeed}. Hãy tạo các biến thể tiêu đề và góc tiếp cận mới lạ.` : ''}

NHIỆM VỤ ĐẶC BIỆT CỦA BẠN:
1. Rút ra TIÊU ĐỀ CHÍNH cực cuốn hút, kèm 3-4 TIÊU ĐỀ THAY THẾ (Hook tò mò, Gây sốc/Kích thích, Bắt trend hiện tại, Chuẩn SEO).
2. Viết HOOK 3 GIÂY ĐẦU TIÊN mở màn để người dùng dừng lướt xem tiếp.
3. Viết MÔ TẢ / CAPTION hoàn chỉnh, ngắt dòng thoáng, dễ đọc trên di động, có câu hỏi kích thích tranh luận/comment.
4. Chọn lọc 6-10 HASHTAG THỊNH HÀNH kết hợp cả hashtag viral lớn (#fyp, #xuhuong, #trending...) và hashtag ngách sâu đúng với nội dung thực tế của video.
5. Đưa ra 1 MẸO XU HƯỚNG (Trend Tip) gợi ý thể loại nhạc nền hoặc cách đăng video để bùng nổ tương tác.
Trả về dữ liệu JSON theo đúng schema.`;

    const { response, modelUsed } = await callGeminiWithRetry(ai, {
      contents: systemPrompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: 'Tiêu đề video chính cuốn hút nhất, đạt CTR cao.',
            },
            alternativeTitles: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Danh sách 3-4 tiêu đề thay thế: [Hook tò mò], [Gây sốc / Gián tiếp], [Bắt trend mạng xã hội], [Chuẩn SEO tìm kiếm].',
            },
            introduction: {
              type: Type.STRING,
              description: 'Câu mở đầu hoặc kịch bản hook 3 giây đầu tiên (định dạng [00:00 - 00:03]: "...") giúp giữ chân người xem ngay lập tức.',
            },
            description: {
              type: Type.STRING,
              description: 'Phần mô tả/caption chi tiết, ngắt dòng đẹp mắt, có câu hỏi kích thích bình luận, phù hợp với định dạng nền tảng đã chọn.',
            },
            hashtags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Danh sách 6-10 hashtag chuẩn xu hướng bắt đầu bằng dấu #, bao gồm cả hashtag lớn và hashtag ngách.',
            },
            cta: {
              type: Type.STRING,
              description: 'Lời kêu gọi hành động (Call To Action) tự nhiên, kích thích tương tác.',
            },
            trendTip: {
              type: Type.STRING,
              description: 'Mẹo xu hướng: Gợi ý nhạc nền thịnh hành (Trending BGM) hoặc thời điểm/cách đăng để tối ưu thuật toán.',
            },
            sourceSummary: {
              type: Type.STRING,
              description: 'Một câu ngắn xác nhận nội dung thực tế mà AI đã nhận diện được từ video.',
            },
          },
          required: ['title', 'introduction', 'description', 'hashtags', 'cta'],
        },
      },
    });

    const responseText = response.text || '{}';
    const parsedData = JSON.parse(responseText);
    parsedData.engineUsed = modelUsed;

    return res.json({
      success: true,
      data: parsedData,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error in generate-content:', err);
    return res.status(500).json({
      success: false,
      error: 'GEMINI_GENERATION_FAILED',
      message: err.message || 'Không thể tạo nội dung qua Gemini API.',
    });
  }
});

/**
 * Health check endpoint for API key presence check
 */
app.get('/api/ai/health', (req: Request, res: Response) => {
  const hasKey = Boolean(process.env.GEMINI_API_KEY);
  return res.json({
    status: 'ok',
    geminiConfigured: hasKey,
    model: 'gemini-3.8-flash',
  });
});

// Configure Vite in development or static serve in production
const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
