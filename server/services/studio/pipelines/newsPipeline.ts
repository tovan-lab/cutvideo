import type { PipelineContext, PipelineDefinition } from '../types';
import { generateJson } from '../gemini';
import { formatResults, TavilyResult, tavilySearch } from '../tavily';
import { hasYouTube, searchRecentVideos } from '../youtube';
import { formatUsdComparison, getVcbUsdComparison } from '../marketData';
import { countWords, normalizeVi, vnDateLabel } from '../utils';
import { asArray, asText, dedupeSources, SourceRef, sourcesMarkdown } from './shared';

interface Highlight {
  title: string;
  summary: string;
  numbers: string[];
  source_title: string;
  url: string;
  published: string;
  engagement: string;
}

interface Digest {
  platform: string;
  overview: string;
  themes: string[];
  highlights: Highlight[];
}

interface RawItem {
  title: string;
  url: string;
  content: string;
  published: string;
  engagement: string;
}

interface Collected {
  platform: string;
  raw: string;
  sources: SourceRef[];
  items: RawItem[];
}

interface EditorOutput {
  report_markdown: string;
  titles: string[];
  thumbnail: string;
  descriptions: string[];
}

const PLATFORMS = [
  { id: 'google', name: 'Google / Báo chí' },
  { id: 'youtube', name: 'YouTube' },
  { id: 'tiktok', name: 'TikTok' },
  { id: 'facebook', name: 'Facebook' },
] as const;

const REQUIRED_HEADINGS = [
  '## 1. TIN NÓNG NHẤT HÔM NAY',
  '## 2. THỊ TRƯỜNG TRONG NGÀY',
  '## 3. TIN ĐÁNG CHÚ Ý KHÁC',
  '## 4. NHẬN ĐỊNH CỦA KÊNH',
  '## 5. CÂU HỎI CHO KHÁN GIẢ',
  '## PHỤ LỤC',
];

const toSources = (results: TavilyResult[]): SourceRef[] => results.map((r) => ({ title: r.title, url: r.url }));
const toItems = (results: TavilyResult[]): RawItem[] =>
  results.map((r) => ({ title: r.title, url: r.url, content: r.content || '', published: r.published_date || '', engagement: '' }));

/** Khi Gemini không tóm tắt được: dùng thẳng dữ liệu đã tìm để bước biên tập vẫn có tư liệu. */
function rawDigest(c: Collected): Digest {
  return {
    platform: c.platform,
    overview: '(AI chưa tóm tắt được — dưới đây là dữ liệu gốc đã thu thập)',
    themes: [],
    highlights: c.items.slice(0, 6).map((it) => ({
      title: it.title,
      summary: it.content.slice(0, 400),
      numbers: [],
      source_title: it.title,
      url: it.url,
      published: it.published,
      engagement: it.engagement,
    })),
  };
}

async function collectGoogle(): Promise<Collected> {
  const [vn, world] = await Promise.all([
    tavilySearch({ query: 'tin tức kinh tế Việt Nam hôm nay', topic: 'news', time_range: 'day', max_results: 10 }),
    tavilySearch({ query: 'global economy markets news today', topic: 'news', time_range: 'day', max_results: 6 }),
  ]);
  const results = [...vn.results, ...world.results];
  return {
    platform: 'Google / Báo chí',
    raw: `TRONG NƯỚC:\n${formatResults(vn.results)}\n\nQUỐC TẾ:\n${formatResults(world.results)}`,
    sources: toSources(results),
    items: toItems(results),
  };
}

async function collectYouTube(ctx: PipelineContext): Promise<Collected> {
  if (!hasYouTube()) {
    ctx.log('Thiếu YOUTUBE_API_KEY — agent YouTube dùng Tavily (không có lượt xem)', 'warn');
    return collectBySite('YouTube', 'youtube.com');
  }
  const videos = await searchRecentVideos('kinh tế|chứng khoán|giá vàng|tỷ giá|lãi suất', 48, 15);
  return {
    platform: 'YouTube',
    raw: videos.length
      ? videos
          .map(
            (v, i) =>
              `[${i + 1}] ${v.title}\nKênh: ${v.channel}\nURL: ${v.url}\nĐăng: ${v.publishedAt}\nLượt xem: ${v.views.toLocaleString('vi-VN')} · Thích: ${v.likes.toLocaleString('vi-VN')} · Bình luận: ${v.comments.toLocaleString('vi-VN')}\nMô tả: ${v.description}`
          )
          .join('\n---\n')
      : '(không có video trong 48 giờ qua)',
    sources: videos.map((v) => ({ title: `${v.title} — ${v.channel}`, url: v.url })),
    items: videos.map((v) => ({
      title: `${v.title} — ${v.channel}`,
      url: v.url,
      content: v.description,
      published: v.publishedAt,
      engagement: `${v.views.toLocaleString('vi-VN')} lượt xem, ${v.likes.toLocaleString('vi-VN')} thích, ${v.comments.toLocaleString('vi-VN')} bình luận`,
    })),
  };
}

async function collectBySite(platform: string, domain: string): Promise<Collected> {
  const res = await tavilySearch({
    query: 'kinh tế chứng khoán giá vàng tỷ giá Việt Nam',
    topic: 'general',
    time_range: 'week',
    include_domains: [domain],
    max_results: 10,
  });
  return { platform, raw: formatResults(res.results, 500), sources: toSources(res.results), items: toItems(res.results) };
}

function digestPrompt(c: Collected, today: string): string {
  return `Bạn là agent theo dõi tin kinh tế trên nền tảng ${c.platform} cho kênh YouTube kinh tế tiếng Việt. Hôm nay: ${today}.

Dữ liệu thu thập được (CHỈ dùng dữ liệu này, không bịa thêm):
${c.raw}

Nhiệm vụ:
- Chọn tối đa 6 nội dung đáng chú ý nhất về kinh tế, tài chính, thị trường. Bỏ nội dung không liên quan kinh tế hoặc rõ ràng đã cũ hơn 48 giờ (với TikTok/Facebook chấp nhận trong 7 ngày nếu không rõ ngày).
- Mọi con số phải lấy nguyên văn từ dữ liệu. Không có thì để mảng rỗng.
- "engagement": lượt xem/tương tác nếu dữ liệu có, không có thì "".

Trả về JSON:
{
  "platform": "${c.platform}",
  "overview": "2-3 câu: nền tảng này đang bàn về kinh tế thế nào",
  "themes": ["chủ đề được bàn nhiều 1", "..."],
  "highlights": [{"title": "", "summary": "2-3 câu", "numbers": ["con số kèm đơn vị"], "source_title": "", "url": "", "published": "", "engagement": ""}]
}`;
}

/** Vị trí phần thân của một mục (sau dòng tiêu đề, trước tiêu đề kế tiếp). */
function sectionRange(markdown: string, heading: string, nextHeading: string): [number, number] | null {
  const start = markdown.indexOf(heading);
  if (start < 0) return null;
  const bodyStart = start + heading.length;
  const next = markdown.indexOf(nextHeading, bodyStart);
  return [bodyStart, next < 0 ? markdown.length : next];
}

export const newsPipeline: PipelineDefinition = {
  id: 'news',
  name: 'Bản tin kinh tế',
  description: '4 agent quét Google, YouTube, TikTok, Facebook cùng số liệu thị trường, viết bản tin khoảng 3.000 từ.',
  inputLabel: 'Ghi chú thêm (không bắt buộc)',
  inputPlaceholder: 'Ví dụ: ưu tiên tin bất động sản',
  inputRequired: false,
  steps: [
    ...PLATFORMS.map((p) => ({ id: p.id, label: p.name, group: 'agents' })),
    { id: 'market', label: 'Số liệu thị trường', group: 'agents' },
    { id: 'editor', label: 'Biên tập bản tin' },
    { id: 'validate', label: 'Kiểm tra chất lượng' },
  ],

  async run(input, ctx) {
    const today = vnDateLabel();

    const runAgent = (id: string, collect: () => Promise<Collected>) =>
      ctx.step(id, async (h) => {
        const collected = await collect();
        h.detail(`${collected.sources.length} nguồn → AI tóm tắt`);
        if (!collected.sources.length) {
          h.skip('Không tìm thấy nội dung');
          return { digest: null, sources: [] as SourceRef[] };
        }
        try {
          const d = await generateJson<Digest>(digestPrompt(collected, today), { temperature: 0.2 });
          const digest: Digest = {
            platform: collected.platform,
            overview: asText(d.overview),
            themes: asArray<string>(d.themes),
            highlights: asArray<Highlight>(d.highlights),
          };
          h.detail(`${digest.highlights.length} tin nổi bật từ ${collected.sources.length} nguồn`);
          return { digest, sources: collected.sources };
        } catch (err: any) {
          ctx.log(`${collected.platform}: AI tóm tắt lỗi, chuyển dữ liệu gốc cho bước biên tập — ${err.message}`, 'warn');
          h.detail(`AI tóm tắt lỗi — dùng ${Math.min(collected.items.length, 6)} nguồn gốc`);
          return { digest: rawDigest(collected), sources: collected.sources };
        }
      });

    const [agentResults, market] = await Promise.all([
      Promise.allSettled([
        runAgent('google', collectGoogle),
        runAgent('youtube', () => collectYouTube(ctx)),
        runAgent('tiktok', () => collectBySite('TikTok', 'tiktok.com')),
        runAgent('facebook', () => collectBySite('Facebook', 'facebook.com')),
      ]),
      ctx
        .step('market', async (h) => {
          const [usd, stock, goldFuel] = await Promise.allSettled([
            getVcbUsdComparison(),
            tavilySearch({ query: 'VN-Index hôm nay đóng cửa điểm', topic: 'news', time_range: 'day', max_results: 6, include_answer: true }),
            tavilySearch({ query: 'giá vàng miếng SJC hôm nay; giá xăng điều chỉnh kỳ này', topic: 'news', time_range: 'day', max_results: 6, include_answer: true }),
          ]);
          const parts: string[] = [];
          const sources: SourceRef[] = [];
          if (usd.status === 'fulfilled') {
            parts.push(formatUsdComparison(usd.value));
            sources.push({ title: 'Tỷ giá Vietcombank', url: usd.value.source });
          } else ctx.log(`Tỷ giá Vietcombank: ${usd.reason?.message}`, 'warn');
          for (const [label, r] of [['CHỨNG KHOÁN', stock], ['VÀNG & XĂNG', goldFuel]] as const) {
            if (r.status === 'fulfilled') {
              parts.push(`${label} (tin trong ngày):\nTóm tắt: ${r.value.answer || ''}\n${formatResults(r.value.results, 500)}`);
              sources.push(...toSources(r.value.results));
            } else ctx.log(`Số liệu ${label}: ${r.reason?.message}`, 'warn');
          }
          if (!parts.length) throw new Error('Không lấy được số liệu thị trường nào');
          h.detail(usd.status === 'fulfilled' ? `USD bán ra ${usd.value.today.sell.toLocaleString('vi-VN')} đ` : 'Chỉ có tin trong ngày');
          return { text: parts.join('\n\n'), sources };
        })
        .catch(() => ({ text: '(Không lấy được số liệu thị trường — ghi "chưa có dữ liệu")', sources: [] as SourceRef[] })),
    ]);

    const agentErrors = agentResults
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => r.reason?.message || String(r.reason));
    const agents = agentResults
      .filter((r): r is PromiseFulfilledResult<{ digest: Digest | null; sources: SourceRef[] }> => r.status === 'fulfilled')
      .map((r) => r.value);
    const digests = agents.map((a) => a.digest).filter((d): d is Digest => Boolean(d?.highlights.length));
    if (!digests.length) {
      throw new Error(`Cả 4 agent đều không lấy được tin. ${agentErrors[0] ? `Lỗi đầu tiên: ${agentErrors[0]}` : 'Không tìm thấy nội dung nào.'}`);
    }

    const allSources = dedupeSources([...agents.flatMap((a) => a.sources), ...market.sources]);

    const editor = await ctx.step('editor', async (h) => {
      h.detail(`Viết từ ${digests.length} nền tảng, ${allSources.length} nguồn`);
      return generateJson<EditorOutput>(
        `Bạn là biên tập viên trưởng của kênh YouTube kinh tế tiếng Việt. Viết BẢN TIN KINH TẾ ngày ${today}.
${input ? `Yêu cầu thêm của biên tập: ${input}\n` : ''}
SỐ LIỆU THỊ TRƯỜNG:
${market.text}

TÓM TẮT TỪ 4 AGENT (JSON):
${JSON.stringify(digests, null, 1)}

QUY TẮC BẮT BUỘC:
- Mọi con số phải có trong dữ liệu trên. Thiếu số liệu thì ghi "chưa có dữ liệu", tuyệt đối không đoán.
- Trích nguồn ngay trong câu bằng link markdown [Tên nguồn](url), chỉ dùng url có trong dữ liệu.
- Tiếng Việt tự nhiên, dễ hiểu cho người xem phổ thông.

"report_markdown" phải đúng khung sau (giữ nguyên các dòng tiêu đề), tổng khoảng 2.700–3.000 từ:

# BẢN TIN KINH TẾ – ${today}

## 1. TIN NÓNG NHẤT HÔM NAY
(1 tin quan trọng nhất: chuyện gì xảy ra, con số chính, vì sao quan trọng, nguồn — khoảng 350 từ)

## 2. THỊ TRƯỜNG TRONG NGÀY
(Bảng markdown 4 cột: | Chỉ số | Hôm nay | Thay đổi so với hôm qua | Nguồn |, các dòng: VN-Index; Vàng miếng SJC (mua/bán); Tỷ giá USD Vietcombank (bán ra); Giá xăng RON 95 chỉ khi có điều chỉnh. Sau bảng 2–3 câu nhận xét.)

## 3. TIN ĐÁNG CHÚ Ý KHÁC
(2–3 tin, mỗi tin là một mục ### có tiêu đề, 2–3 câu, có con số và nguồn; ít nhất 1 tin quốc tế)

## 4. NHẬN ĐỊNH CỦA KÊNH
[ĐỂ TRỐNG]

## 5. CÂU HỎI CHO KHÁN GIẢ
(1 câu hỏi gần gũi, liên quan tới tin nóng nhất, để người xem bình luận)

## PHỤ LỤC: MỖI NỀN TẢNG ĐANG BÀN GÌ
### Google / Báo chí
### YouTube
### TikTok
### Facebook
(mỗi nền tảng 350–450 từ: chủ đề được bàn nhiều, nội dung nổi bật kèm lượt xem/tương tác nếu có, nhận xét xu hướng; nền tảng không có dữ liệu thì ghi rõ "chưa thu thập được dữ liệu")

Không viết phần nguồn tham khảo và phần gợi ý video trong report_markdown (hệ thống tự thêm).

Trả về JSON:
{
  "report_markdown": "toàn bộ bản tin theo khung trên",
  "titles": ["3 tiêu đề YouTube, mỗi tiêu đề DƯỚI 70 ký tự và có con số cụ thể"],
  "thumbnail": "câu chữ cho thumbnail, TỐI ĐA 6 chữ",
  "descriptions": ["mô tả video phương án 1 (80–120 từ, có 3–5 hashtag)", "mô tả video phương án 2 (80–120 từ, giọng khác, có 3–5 hashtag)"]
}`,
        { temperature: 0.5, maxOutputTokens: 32768 }
      );
    });

    return ctx.step('validate', async (h) => {
      const warnings: string[] = [];
      let report = asText(editor.report_markdown);
      if (!report) throw new Error('AI không trả về nội dung bản tin');

      const firstLine = `# BẢN TIN KINH TẾ – ${today}`;
      if (!report.startsWith('# ')) report = `${firstLine}\n\n${report}`;
      else report = report.replace(/^# .*$/m, firstLine);

      const normalized = normalizeVi(report);
      for (const heading of REQUIRED_HEADINGS) {
        if (!normalized.includes(normalizeVi(heading))) warnings.push(`Thiếu mục "${heading.replace(/^#+ /, '')}"`);
      }
      const section2 = sectionRange(report, '## 2.', '## 3.');
      if (section2 && !report.slice(...section2).includes('|')) warnings.push('Mục 2 không có bảng số liệu');

      // Mục 4 luôn để trống cho kênh tự viết.
      const section4 = sectionRange(report, '## 4. NHẬN ĐỊNH CỦA KÊNH', '## 5.');
      if (section4 && report.slice(...section4).trim() !== '[ĐỂ TRỐNG]') {
        report = `${report.slice(0, section4[0])}\n[ĐỂ TRỐNG]\n\n${report.slice(section4[1])}`;
        warnings.push('Mục 4 không đúng "[ĐỂ TRỐNG]" — đã tự đặt lại');
      }

      const titles = asArray<string>(editor.titles).map((t) => t.trim()).filter(Boolean);
      if (titles.length !== 3) warnings.push(`Có ${titles.length} tiêu đề thay vì 3`);
      titles.forEach((t, i) => {
        if (t.length >= 70) warnings.push(`Tiêu đề ${i + 1} dài ${t.length} ký tự (cần dưới 70)`);
        if (!/\d/.test(t)) warnings.push(`Tiêu đề ${i + 1} chưa có con số`);
      });
      const thumbnail = asText(editor.thumbnail);
      const thumbWords = countWords(thumbnail);
      if (!thumbnail) warnings.push('Thiếu câu chữ thumbnail');
      else if (thumbWords > 6) warnings.push(`Câu thumbnail có ${thumbWords} chữ (tối đa 6)`);
      const descriptions = asArray<string>(editor.descriptions).map((d) => d.trim()).filter(Boolean);
      if (descriptions.length < 2) warnings.push(`Có ${descriptions.length} mô tả video thay vì 2`);

      const markdown = [
        report,
        '## NGUỒN THAM KHẢO',
        sourcesMarkdown(allSources),
        '## GỢI Ý CHO VIDEO',
        '**Tiêu đề YouTube:**',
        titles.map((t, i) => `${i + 1}. ${t} _(${t.length} ký tự)_`).join('\n'),
        `**Chữ thumbnail:** ${thumbnail}`,
        ...descriptions.map((d, i) => `**Mô tả video ${i + 1}:**\n\n${d}`),
      ].join('\n\n');

      const wordCount = countWords(markdown);
      if (wordCount < 2500) warnings.push(`Bản tin có ${wordCount} từ, ngắn hơn mục tiêu ~3.000`);
      if (wordCount > 3800) warnings.push(`Bản tin có ${wordCount} từ, dài hơn mục tiêu ~3.000`);
      h.detail(warnings.length ? `${warnings.length} cảnh báo · ${wordCount} từ` : `Đạt yêu cầu · ${wordCount} từ`);

      return {
        title: `Bản tin kinh tế – ${today}`,
        markdown,
        copyBlocks: [
          ...titles.map((t, i) => ({ label: `Tiêu đề ${i + 1}`, text: t })),
          { label: 'Chữ thumbnail', text: thumbnail },
          ...descriptions.map((d, i) => ({ label: `Mô tả video ${i + 1}`, text: d })),
          { label: 'Toàn bộ bản tin (markdown)', text: markdown },
        ],
        warnings,
        wordCount,
      };
    });
  },
};
