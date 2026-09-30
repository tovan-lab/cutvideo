import { GoogleGenAI, Type, createPartFromUri } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import { VideoFacts } from '../../../src/lib/ai-content/types';
import { AI_CONFIG } from '../../config/aiConfig';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-ai-content',
      },
    },
  });
}

/**
 * Robust retry helper with exponential backoff & model fallback
 */
async function callWithRetry(
  ai: GoogleGenAI,
  requestConfig: {
    contents: any;
    config?: any;
  }
) {
  const models = [AI_CONFIG.MODELS.PRIMARY, AI_CONFIG.MODELS.FALLBACK, 'gemini-2.5-flash', 'gemini-2.0-flash'];
  let lastError: any = null;

  for (const modelName of models) {
    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[VideoFacts] Invoking ${modelName} (attempt ${attempt}/${maxRetries})...`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: requestConfig.contents,
          config: requestConfig.config,
        });
        return { response, modelUsed: modelName };
      } catch (err: any) {
        lastError = err;
        const msg = err?.message || String(err);
        console.warn(`[VideoFacts] ${modelName} attempt ${attempt} warning: ${msg.slice(0, 160)}`);

        const isRateLimitOrBusy =
          msg.includes('503') ||
          msg.includes('429') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('RESOURCE_EXHAUSTED');

        if (isRateLimitOrBusy && attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
          continue;
        }
        break;
      }
    }
  }

  throw lastError || new Error('Không thể phân tích video qua Gemini. Vui lòng thử lại sau.');
}

export class GeminiVideoFactsService {
  /**
   * Extract ground truth Video Facts using Gemini Files API with full audio & video inspection
   */
  async extractVideoFacts(filePath: string, originalName: string, mimeType: string): Promise<VideoFacts> {
    const ai = getGeminiClient();
    if (!ai) {
      throw new Error('GEMINI_API_KEY chưa được cấu hình trong .env');
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`Tập tin video không tồn tại tại: ${filePath}`);
    }

    const fileSize = fs.statSync(filePath).size;
    console.log(`[VideoFacts] Processing video: ${originalName} (${(fileSize / (1024 * 1024)).toFixed(2)} MB)...`);

    let uploadedFile: any = null;
    let filePart: any = null;

    try {
      // 1. Upload video to Gemini Files API
      console.log(`[VideoFacts] Uploading to Gemini Files API...`);
      uploadedFile = await ai.files.upload({
        file: new Blob([fs.readFileSync(filePath)]),
        config: {
          displayName: originalName || path.basename(filePath),
          mimeType: mimeType || 'video/mp4',
        },
      });

      console.log(`[VideoFacts] Uploaded file id: ${uploadedFile.name}. Waiting for processing...`);

      // 2. Poll file status until ACTIVE
      let getFile = await ai.files.get({ name: uploadedFile.name as string });
      let waitSeconds = 0;
      while (getFile.state === 'PROCESSING') {
        if (waitSeconds > 60) {
          throw new Error('Gemini xử lý video quá thời gian chờ (timeout > 60s).');
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
        waitSeconds += 3;
        getFile = await ai.files.get({ name: uploadedFile.name as string });
        console.log(`[VideoFacts] File status: ${getFile.state} (${waitSeconds}s)`);
      }

      if (getFile.state === 'FAILED') {
        throw new Error('Gemini Files API thông báo xử lý video thất bại.');
      }

      if (uploadedFile.uri && uploadedFile.mimeType) {
        filePart = createPartFromUri(uploadedFile.uri, uploadedFile.mimeType);
      }
    } catch (uploadErr) {
      console.warn(`[VideoFacts] Files API upload had an issue, checking fallback:`, uploadErr);
      // Fallback for smaller files: read as base64 inlineData
      if (fileSize < 20 * 1024 * 1024) {
        const fileBuffer = fs.readFileSync(filePath);
        filePart = {
          inlineData: {
            mimeType: mimeType || 'video/mp4',
            data: fileBuffer.toString('base64'),
          },
        };
      } else {
        throw uploadErr;
      }
    }

    // 3. Strict System Instruction & JSON Schema
    const systemPrompt = `
BẠN LÀ MỘT HỆ THỐNG TRÍCH XUẤT SỰ THẬT TỪ VIDEO (VIDEO GROUND TRUTH EXTRACTION AI).
QUY TẮC BẤT DI BẤT DỊCH (GROUND TRUTH RULES):
1. BẠN CHỈ ĐƯỢC PHÉP GHI NHẬN NHỮNG GÌ BẠN TẬN MẮT NHÌN THẤY HOẶC TẬN TAI NGHE THẤY TRONG VIDEO NÀY.
2. TUYỆT ĐỐI KHÔNG SUY ĐOÁN, KHÔNG TỰ BỊA RA CHỦ ĐỀ KHÔNG CÓ TRONG VIDEO.
3. PHÂN LOẠI CHÍNH XÁC VIDEO_TYPE:
   - "màn hình kết thúc": Nếu video là màn hình outro ở cuối, có dòng chữ như "Cảm ơn bạn đã xem", "Đăng ký kênh", nút subscribe, giới thiệu video tiếp theo.
   - "intro": Nếu video là đoạn intro mở đầu kênh, nhạc hiệu, logo kênh.
   - "quảng cáo": Nếu video thuần quảng cáo sản phẩm/dịch vụ ngắn.
   - "nội dung chính": Nếu video có nội dung bài giảng, tin tức, trải nghiệm đầy đủ.
   - "khác": Các trường hợp khác.
4. ĐỌC CHÍNH XÁC TẤT CẢ DÒNG CHỮ TRÊN MÀN HÌNH (on_screen_text): Tên kênh, slogan, tiêu đề phụ đề, ghi chú xuất hiện trên khung hình (Ví dụ: "KINH TẾ 8 PHÚT", "Cảm ơn bạn đã xem!", "Đăng ký kênh để nhận bản tin kinh tế mỗi ngày").
5. NẾU VIDEO QUÁ NGẮN HOẶC ÍT THÔNG TIN:
   - Đặt "is_low_information": true.
   - Tóm tắt đúng bản chất ngắn gọn: ví dụ "Màn hình kết thúc của kênh Kinh Tế 8 Phút cảm ơn người xem và kêu gọi đăng ký kênh".
   - TUYỆT ĐỐI KHÔNG BỊA RA các chủ đề như triển lãm nghệ thuật, du lịch, nấu ăn hay tin tức nào khác!
6. BÓC LỜI THOẠI (TRANSCRIPT): Ghi lại chính xác âm thanh nếu có lời nói. Nếu không có tiếng nói con người (chỉ có nhạc nền hoặc im lặng), để transcript là mảng rỗng [].
`;

    const contents = [
      { text: systemPrompt },
      filePart,
      {
        text: 'Hãy phân tích toàn diện cả hình ảnh và âm thanh của video và trả về kết quả theo schema JSON quy định.',
      },
    ];

    const { response } = await callWithRetry(ai, {
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: 'Tóm tắt sự thật chân thực 1-3 câu dựa trên những gì thấy và nghe được, không bịa đặt.',
            },
            main_topic: {
              type: Type.STRING,
              description: 'Chủ đề chính xác của video (Ví dụ: "Màn hình kết thúc & Lời cảm ơn kênh Kinh Tế 8 Phút").',
            },
            sub_topics: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Các chủ đề phụ xuất hiện trong video.',
            },
            entities: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  type: { type: Type.STRING, description: 'channel | brand | person | place | product | concept' },
                },
                required: ['name', 'type'],
              },
              description: 'Danh sách thực thể, tên kênh, tên người, thương hiệu nhìn thấy hoặc nghe thấy.',
            },
            numbers_and_facts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  fact: { type: Type.STRING },
                  timestamp: { type: Type.STRING },
                },
                required: ['fact'],
              },
              description: 'Các con số, thời gian, sự kiện cụ thể có trong video.',
            },
            on_screen_text: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Tất cả các đoạn chữ hiển thị trên màn hình video.',
            },
            transcript: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  start: { type: Type.NUMBER },
                  text: { type: Type.STRING },
                },
                required: ['start', 'text'],
              },
              description: 'Bóc tách lời thoại thực tế từ âm thanh.',
            },
            chapters: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  start: { type: Type.STRING },
                  title: { type: Type.STRING },
                },
                required: ['start', 'title'],
              },
              description: 'Các mốc thời gian chương bắt đầu bằng 00:00.',
            },
            video_type: {
              type: Type.STRING,
              enum: ['nội dung chính', 'intro', 'màn hình kết thúc', 'quảng cáo', 'khác'],
              description: 'Định dạng và bản chất thực của video.',
            },
            duration_sec: {
              type: Type.NUMBER,
              description: 'Thời lượng video bằng giây.',
            },
            orientation: {
              type: Type.STRING,
              description: 'Tỉ lệ hiển thị (16:9 ngang, 9:16 dọc, hoặc 1:1 vuông).',
            },
            is_low_information: {
              type: Type.BOOLEAN,
              description: 'True nếu video quá ngắn hoặc là màn hình tĩnh/ít thông tin.',
            },
          },
          required: ['summary', 'main_topic', 'video_type', 'on_screen_text'],
        },
      },
    });

    // Cleanup uploaded file from Gemini storage in background
    if (uploadedFile?.name) {
      ai.files.delete({ name: uploadedFile.name }).catch((err) => {
        console.warn(`[VideoFacts] Note: file deletion:`, err?.message || err);
      });
    }

    const text = response.text || '{}';
    const parsed = JSON.parse(text);

    return {
      summary: parsed.summary || 'Không có tóm tắt',
      main_topic: parsed.main_topic || 'Chưa xác định',
      sub_topics: Array.isArray(parsed.sub_topics) ? parsed.sub_topics : [],
      entities: Array.isArray(parsed.entities) ? parsed.entities : [],
      numbers_and_facts: Array.isArray(parsed.numbers_and_facts) ? parsed.numbers_and_facts : [],
      on_screen_text: Array.isArray(parsed.on_screen_text) ? parsed.on_screen_text : [],
      transcript: Array.isArray(parsed.transcript) ? parsed.transcript : [],
      chapters: Array.isArray(parsed.chapters) ? parsed.chapters : [],
      video_type: parsed.video_type || 'nội dung chính',
      duration_sec: typeof parsed.duration_sec === 'number' ? parsed.duration_sec : 0,
      orientation: parsed.orientation || '16:9',
      is_low_information: Boolean(parsed.is_low_information),
    };
  }
}

export const geminiVideoFactsService = new GeminiVideoFactsService();
