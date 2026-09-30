import { SEOPlatform, TitleTone, VideoFacts } from './types';

export interface PlatformRule {
  name: string;
  maxTitleLength: number;
  bestTitleLengthRange: [number, number];
  primaryKeywordInTitleChars: number; // keyword must appear within first N chars
  minHashtags: number;
  maxHashtags: number;
  requiredHashtags?: string[];
  maxTagsCount?: number;
  maxTagsTotalLength?: number;
  descriptionRules: string;
  generalRules: string;
}

export const PLATFORM_RULES: Record<SEOPlatform, PlatformRule> = {
  youtube_long: {
    name: 'YouTube Video Dài',
    maxTitleLength: 100,
    bestTitleLengthRange: [50, 70],
    primaryKeywordInTitleChars: 40,
    minHashtags: 3,
    maxHashtags: 5,
    maxTagsCount: 15,
    maxTagsTotalLength: 500,
    descriptionRules:
      '150 ký tự đầu của mô tả PHẢI chứa từ khóa chính và nêu bật giá trị cốt lõi của video. Nếu video >60 giây, bổ sung danh sách mốc thời gian chương (bắt đầu bằng 00:00). Kêu gọi người xem Đăng ký kênh (Subscribe) và bật chuông.',
    generalRules:
      'Tiêu đề chuẩn SEO, giật tít đúng sự thật, từ khóa chính xuất hiện trong 40 ký tự đầu. Kèm 10-15 thẻ tags có liên quan trực tiếp, tổng độ dài tags không vượt quá 500 ký tự.',
  },
  youtube_shorts: {
    name: 'YouTube Shorts',
    maxTitleLength: 60,
    bestTitleLengthRange: [30, 50],
    primaryKeywordInTitleChars: 30,
    minHashtags: 3,
    maxHashtags: 5,
    requiredHashtags: ['#shorts'],
    descriptionRules: 'Mô tả súc tích chỉ từ 1-2 câu, nêu rõ điểm thú vị nhất của clip.',
    generalRules: 'Tiêu đề ngắn gọn ≤60 ký tự, bắt buộc có hashtag #shorts trong mô tả hoặc tiêu đề.',
  },
  tiktok: {
    name: 'TikTok',
    maxTitleLength: 70,
    bestTitleLengthRange: [30, 60],
    primaryKeywordInTitleChars: 30,
    minHashtags: 3,
    maxHashtags: 5,
    descriptionRules:
      'Dòng đầu tiên là câu Hook gây tò mò chứa từ khóa chính. Tổng độ dài mô tả/caption từ 100 đến 300 ký tự.',
    generalRules: 'Hashtag thịnh hành đúng ngách, viết liền không dấu, tối đa 2 emoji.',
  },
  facebook: {
    name: 'Facebook Reels / Post',
    maxTitleLength: 80,
    bestTitleLengthRange: [40, 70],
    primaryKeywordInTitleChars: 40,
    minHashtags: 1,
    maxHashtags: 3,
    descriptionRules:
      'Câu mở đầu ≤125 ký tự để không bị ẩn sau nút "Xem thêm". Kế tiếp là 1-2 câu tóm tắt nội dung và 1 câu hỏi mở kích thích khán giả để lại bình luận.',
    generalRules: 'Giọng văn tự nhiên, thân thiện chia sẻ, chỉ dùng 1-3 hashtag trọng tâm.',
  },
  instagram: {
    name: 'Instagram Reels',
    maxTitleLength: 70,
    bestTitleLengthRange: [35, 60],
    primaryKeywordInTitleChars: 35,
    minHashtags: 3,
    maxHashtags: 5,
    descriptionRules:
      'Dòng đầu tiên chứa từ khóa chính, câu văn tinh tế, tổng độ dài caption từ 125 đến 300 ký tự, ngắt dòng thoáng.',
    generalRules: 'Tối đa 2 emoji, hashtag viết liền không dấu, câu từ chỉn chu thẩm mỹ.',
  },
};

export const TITLE_TONE_GUIDELINES: Record<TitleTone, { label: string; desc: string; prompt: string }> = {
  professional: {
    label: 'Chuyên nghiệp',
    desc: 'Chuẩn mực, học thuật, đáng tin cậy',
    prompt: 'Giọng văn chuyên nghiệp, lập luận chắc chắn, ngữ điệu uy tín, tập trung vào giá trị thực tế.',
  },
  curiosity: {
    label: 'Tò mò / Câu hỏi',
    desc: 'Kích thích khám phá, khoảng trống thông tin',
    prompt: 'Đặt câu hỏi hoặc nêu nghi vấn gây tò mò, mở ra khoảng trống tò mò (curiosity gap) khiến người xem phải bấm vào.',
  },
  numbers: {
    label: 'Con số nổi bật',
    desc: 'Số liệu cụ thể, mốc thời gian rõ ràng',
    prompt: 'Nhấn mạnh vào các con số, thời gian, dữ liệu định lượng cụ thể được trích xuất trực tiếp từ video.',
  },
  natural: {
    label: 'Tự nhiên',
    desc: 'Gần gũi, đời thường như trò chuyện',
    prompt: 'Văn phong đời thường, gần gũi, thân thiện như lời chia sẻ thật tâm giữa những người bạn.',
  },
};

/**
 * Builds the strict instruction prompt for Gemini Content Generation based on VideoFacts and rules
 */
export function buildPromptForPlatform(
  platform: SEOPlatform,
  facts: VideoFacts,
  primaryKeyword: string,
  suggestedKeywords: string[],
  tone: TitleTone,
  channelName?: string,
  userContext?: string
): string {
  const rule = PLATFORM_RULES[platform];
  const toneGuide = TITLE_TONE_GUIDELINES[tone];

  const isIntroOrOutro = facts.video_type === 'intro' || facts.video_type === 'màn hình kết thúc';

  let specialTypeInstruction = '';
  if (isIntroOrOutro) {
    specialTypeInstruction = `
[LƯU Ý CỰC KỲ QUAN TRỌNG VỀ BẢN CHẤT VIDEO]:
Video này được xác định là: "${facts.video_type.toUpperCase()}".
${facts.is_low_information ? 'Video có thời lượng ngắn hoặc ít thông tin chi tiết.' : ''}
TUYỆT ĐỐI KHÔNG BỊA RA một chủ đề thời sự, sự kiện, triển lãm hay câu chuyện không có trong video!
HÃY TẠO NỘI DUNG ĐÚNG VỚI BẢN CHẤT:
- Nếu là "màn hình kết thúc": Đây là đoạn kết video, lời cảm ơn khán giả đã theo dõi kênh, kêu gọi đăng ký kênh (Subscribe), theo dõi các bản tin tiếp theo của kênh ${channelName || facts.on_screen_text[0] || 'kênh'}.
- Nếu là "intro": Đoạn mở đầu giới thiệu kênh và chào mừng khán giả.
`;
  }

  return `
BẠN LÀ CHUYÊN GIA TỐI ƯU HÓA NỘI DUNG VÀ SEO CHO NỀN TẢNG: ${rule.name.toUpperCase()}

DỮ LIỆU SỰ THẬT TỪ VIDEO (VIDEO FACTS - 100% GROUND TRUTH):
- Loại video: ${facts.video_type}
- Chủ đề cốt lõi: ${facts.main_topic}
- Tóm tắt thực tế: "${facts.summary}"
- Chữ xuất hiện trên màn hình: ${facts.on_screen_text.length > 0 ? facts.on_screen_text.join(' | ') : '(Không có chữ)'}
- Thực thể / Tên riêng: ${facts.entities.map((e) => `${e.name} (${e.type})`).join(', ') || '(Không có)'}
- Số liệu & Sự kiện: ${facts.numbers_and_facts.map((n) => n.fact).join('; ') || '(Không có)'}
- Thời lượng: ${facts.duration_sec}s · Khung hình: ${facts.orientation}
${channelName ? `- Tên kênh phát hành: "${channelName}"` : ''}
${userContext ? `- Bối cảnh bổ sung do người dùng cung cấp: "${userContext}"` : ''}
${facts.transcript.length > 0 ? `- Trích đoạn lời thoại: ${facts.transcript.slice(0, 5).map((t) => `"${t.text}"`).join(' ')}` : ''}

${specialTypeInstruction}

TỪ KHÓA ĐÃ NGHIÊN CỨU:
- Từ khóa chính (Primary Keyword): "${primaryKeyword}"
- Các từ khóa liên quan được tìm kiếm nhiều: ${suggestedKeywords.slice(0, 6).join(', ')}

PHONG CÁCH TIÊU ĐỀ: ${toneGuide.label} (${toneGuide.prompt})

YÊU CẦU QUY TẮC CỤ THỂ CHO NỀN TẢNG ${platform.toUpperCase()}:
1. TIÊU ĐỀ (TITLES):
   - Tạo chính xác 3 PHƯƠNG ÁN TIÊU ĐỀ KHÁC NHAU.
   - Độ dài tối đa: ${rule.maxTitleLength} ký tự (tốt nhất trong khoảng ${rule.bestTitleLengthRange[0]}-${rule.bestTitleLengthRange[1]} ký tự).
   - Từ khóa chính "${primaryKeyword}" PHẢI nằm trong ${rule.primaryKeywordInTitleChars} ký tự đầu tiên của tiêu đề.
   - Tuyệt đối không bịa số liệu hay thông tin không có trong Video Facts.
2. MÔ TẢ (DESCRIPTION):
   - ${rule.descriptionRules}
   - Tiếng Việt có dấu chuẩn xác, hành văn tự nhiên, không nhồi nhét từ khóa.
3. HASHTAGS:
   - Cung cấp từ ${rule.minHashtags} đến ${rule.maxHashtags} hashtags liên quan trực tiếp đến video.
   - BẮT BUỘC viết liền không dấu (ví dụ: #kinhte8phut, #bantin, #shorts).
   ${rule.requiredHashtags ? `- Bắt buộc có các hashtag sau: ${rule.requiredHashtags.join(', ')}` : ''}
4. TAGS (Chỉ dành cho YouTube):
   ${
     platform === 'youtube_long' || platform === 'youtube_shorts'
       ? '- 10 đến 15 tags từ khóa dạng chuỗi ngắn gọn, tổng độ dài các tags cộng lại ≤ 500 ký tự.'
       : '- Để mảng rỗng [] cho các nền tảng khác.'
   }
5. ICON/EMOJI:
   - Tối đa 2 emoji trong toàn bộ bài viết để giữ độ chuyên nghiệp.

TRẢ VỀ KẾT QUẢ ĐÚNG SCHEMA JSON.
`;
}
