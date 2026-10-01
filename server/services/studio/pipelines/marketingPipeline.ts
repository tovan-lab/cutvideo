import type { PipelineDefinition } from '../types';
import { generateJson } from '../gemini';
import { formatResults, TavilyResult, tavilySearch } from '../tavily';
import { countWords, vnDateLabel } from '../utils';
import { asArray, asText, dedupeSources, SourceRef, sourcesMarkdown } from './shared';

interface Evidence {
  fact: string;
  source_title: string;
  url: string;
}

interface Trend {
  name: string;
  why_now: string;
  evidence: Evidence[];
  score_fresh: number;
  score_hot: number;
  score_vn: number;
}

interface Playbook {
  trend: string;
  goal: string;
  steps: string[];
  tools: string[];
  example: Evidence;
  kpis: string[];
}

interface Ideas {
  mistakes: { mistake: string; fix: string }[];
  videos: { topic: string; title: string; thumbnail: string; description: string }[];
}

const SOCIAL_DOMAINS = ['youtube.com', 'tiktok.com', 'facebook.com'];

const total = (t: Trend) => (Number(t.score_fresh) || 0) + (Number(t.score_hot) || 0) + (Number(t.score_vn) || 0);

export const marketingPipeline: PipelineDefinition = {
  id: 'marketing',
  name: 'Xu hướng marketing',
  description: 'Quét trend marketing 7 ngày, chọn 5–6 xu hướng mạnh nhất, viết quy trình áp dụng và gợi ý 3 video.',
  inputLabel: 'Tập trung vào mảng (không bắt buộc)',
  inputPlaceholder: 'Ví dụ: TikTok Shop, AI marketing, F&B',
  inputRequired: false,
  steps: [
    { id: 'scan-news', label: 'Quét tin marketing 7 ngày', group: 'scan' },
    { id: 'scan-social', label: 'Quét trend mạng xã hội', group: 'scan' },
    { id: 'score', label: 'Chấm điểm & chọn xu hướng' },
    { id: 'playbooks', label: 'Viết quy trình áp dụng' },
    { id: 'ideas', label: 'Sai lầm & ý tưởng video' },
    { id: 'assemble', label: 'Hoàn thiện báo cáo' },
  ],

  async run(input, ctx) {
    const today = vnDateLabel();
    const focus = input.trim();
    const focusVi = focus ? ` ${focus}` : '';

    const [news, social] = await Promise.all([
      ctx.step('scan-news', async (h) => {
        const [vn, global] = await Promise.all([
          tavilySearch({ query: `xu hướng marketing mới nhất Việt Nam${focusVi}`, topic: 'news', time_range: 'week', max_results: 10 }),
          tavilySearch({ query: `latest marketing trends this week${focusVi}`, topic: 'news', time_range: 'week', max_results: 8 }),
        ]);
        h.detail(`${vn.results.length} tin trong nước · ${global.results.length} tin quốc tế`);
        return { vn: vn.results, global: global.results };
      }),
      ctx.step('scan-social', async (h) => {
        const settled = await Promise.allSettled(
          SOCIAL_DOMAINS.map((domain) =>
            tavilySearch({
              query: `xu hướng marketing${focusVi} mới nhất`,
              topic: 'general',
              time_range: 'week',
              include_domains: [domain],
              max_results: 6,
            })
          )
        );
        const byDomain: Record<string, TavilyResult[]> = {};
        settled.forEach((r, i) => {
          byDomain[SOCIAL_DOMAINS[i]] = r.status === 'fulfilled' ? r.value.results : [];
          if (r.status === 'rejected') ctx.log(`Quét ${SOCIAL_DOMAINS[i]}: ${r.reason?.message}`, 'warn');
        });
        h.detail(SOCIAL_DOMAINS.map((d) => `${d.split('.')[0]} ${byDomain[d].length}`).join(' · '));
        return byDomain;
      }),
    ]);

    const allResults = [...news.vn, ...news.global, ...Object.values(social).flat()];
    if (!allResults.length) throw new Error('Không tìm thấy nguồn marketing nào trong 7 ngày qua. Thử bỏ bớt từ khóa tập trung.');
    const sources: SourceRef[] = dedupeSources(allResults.map((r) => ({ title: r.title, url: r.url })));

    const scored = await ctx.step('score', async (h) => {
      const r = await generateJson<{ overview: string; trends: Trend[] }>(
        `Bạn là chiến lược gia marketing, nghiên cứu xu hướng để làm video giáo dục về marketing cho khán giả Việt Nam. Hôm nay: ${today}.${focus ? `\nTập trung vào: ${focus}.` : ''}

TIN MARKETING TRONG NƯỚC (7 ngày):
${formatResults(news.vn, 500)}

TIN MARKETING QUỐC TẾ (7 ngày):
${formatResults(news.global, 500)}

MẠNG XÃ HỘI:
${SOCIAL_DOMAINS.map((d) => `[${d}]\n${formatResults(social[d], 400)}`).join('\n\n')}

Nhiệm vụ: Xác định 5–6 xu hướng marketing mạnh nhất hiện nay dựa trên dữ liệu trên. Mỗi xu hướng chấm 3 điểm từ 1 đến 10:
- score_fresh: độ mới (xuất hiện hoặc tăng tốc gần đây)
- score_hot: độ nóng (được nhắc nhiều, nhiều nguồn)
- score_vn: mức phù hợp với doanh nghiệp/nhà sáng tạo Việt Nam
Chỉ dùng bằng chứng có trong dữ liệu, url phải lấy từ dữ liệu.

Trả về JSON:
{
  "overview": "3-5 câu: bức tranh marketing tuần này",
  "trends": [{"name": "", "why_now": "2-3 câu vì sao nổi lên lúc này", "evidence": [{"fact": "", "source_title": "", "url": ""}], "score_fresh": 0, "score_hot": 0, "score_vn": 0}]
}`,
        { temperature: 0.3, maxOutputTokens: 16384 }
      );
      const trends = asArray<Trend>(r.trends).sort((a, b) => total(b) - total(a)).slice(0, 6);
      if (trends.length < 3) throw new Error(`Chỉ tìm được ${trends.length} xu hướng, chưa đủ để lập báo cáo`);
      h.detail(`${trends.length} xu hướng · cao nhất: ${trends[0].name}`);
      return { overview: asText(r.overview), trends };
    });

    const trendsJson = JSON.stringify(scored.trends.map((t) => ({ name: t.name, why_now: t.why_now, evidence: t.evidence })));

    const playbooks = await ctx.step('playbooks', async (h) => {
      const r = await generateJson<{ playbooks: Playbook[] }>(
        `Bạn là chuyên gia triển khai marketing. Với MỖI xu hướng dưới đây, viết 1 quy trình áp dụng thực tế cho doanh nghiệp nhỏ và nhà sáng tạo nội dung Việt Nam.

XU HƯỚNG:
${trendsJson}

Yêu cầu cho mỗi quy trình:
- goal: mục tiêu cụ thể, đo được
- steps: 5–7 bước hành động, mỗi bước 1–2 câu, bắt đầu bằng động từ
- tools: công cụ/nền tảng cụ thể dùng được ở Việt Nam
- example: 1 ví dụ thực tế lấy từ phần evidence của xu hướng (giữ nguyên url); không có thì để url rỗng và nói rõ là ví dụ minh họa
- kpis: 3–4 chỉ số đo hiệu quả

Trả về JSON: {"playbooks": [{"trend": "tên xu hướng", "goal": "", "steps": [""], "tools": [""], "example": {"fact": "", "source_title": "", "url": ""}, "kpis": [""]}]}`,
        { temperature: 0.5, maxOutputTokens: 24576 }
      );
      const list = asArray<Playbook>(r.playbooks);
      h.detail(`${list.length} quy trình`);
      return list;
    });

    const ideas = await ctx.step('ideas', async (h) => {
      const r = await generateJson<Ideas>(
        `Bạn là biên tập viên kênh YouTube/TikTok về marketing cho người Việt.

XU HƯỚNG TUẦN NÀY:
${trendsJson}

Nhiệm vụ:
1. mistakes: 5 sai lầm phổ biến khi chạy theo các xu hướng này, mỗi sai lầm kèm cách khắc phục.
2. videos: 3 ý tưởng video. Mỗi ý tưởng có: topic (chủ đề), title (tiêu đề YouTube DƯỚI 70 ký tự, có con số cụ thể), thumbnail (TỐI ĐA 6 chữ), description (mô tả video 80–120 từ, có 3–5 hashtag).

Trả về JSON: {"mistakes": [{"mistake": "", "fix": ""}], "videos": [{"topic": "", "title": "", "thumbnail": "", "description": ""}]}`,
        { temperature: 0.7 }
      );
      const out: Ideas = { mistakes: asArray(r.mistakes), videos: asArray(r.videos) };
      h.detail(`${out.mistakes.length} sai lầm · ${out.videos.length} video`);
      return out;
    });

    return ctx.step('assemble', async (h) => {
      const warnings: string[] = [];
      if (playbooks.length < scored.trends.length) {
        warnings.push(`Có ${playbooks.length} quy trình cho ${scored.trends.length} xu hướng`);
      }
      ideas.videos.forEach((v, i) => {
        if ((v.title || '').length >= 70) warnings.push(`Tiêu đề video ${i + 1} dài ${v.title.length} ký tự (cần dưới 70)`);
        if (countWords(v.thumbnail || '') > 6) warnings.push(`Thumbnail video ${i + 1} quá 6 chữ`);
      });

      const link = (e?: Evidence) => (e?.url ? ` — [${e.source_title || 'nguồn'}](${e.url})` : '');
      const markdown = [
        `# XU HƯỚNG MARKETING – ${today}${focus ? ` · ${focus}` : ''}`,
        '## 1. BỨC TRANH TUẦN NÀY',
        scored.overview,
        `## 2. ${scored.trends.length} XU HƯỚNG NÓNG NHẤT`,
        '| # | Xu hướng | Độ mới | Độ nóng | Hợp với VN | Tổng /30 |\n|---|---|---|---|---|---|\n' +
          scored.trends
            .map((t, i) => `| ${i + 1} | ${t.name} | ${t.score_fresh} | ${t.score_hot} | ${t.score_vn} | **${total(t)}** |`)
            .join('\n'),
        ...scored.trends.map(
          (t, i) =>
            `### ${i + 1}. ${t.name}\n${t.why_now}\n\n${asArray<Evidence>(t.evidence)
              .map((e) => `- ${e.fact}${link(e)}`)
              .join('\n')}`
        ),
        '## 3. QUY TRÌNH ÁP DỤNG',
        ...playbooks.map((p, i) =>
          [
            `### 3.${i + 1}. ${p.trend}`,
            `**Mục tiêu:** ${p.goal}`,
            `**Các bước:**\n${asArray<string>(p.steps).map((s, j) => `${j + 1}. ${s}`).join('\n')}`,
            `**Công cụ:** ${asArray<string>(p.tools).join(', ')}`,
            `**Ví dụ thực tế:** ${p.example?.fact || ''}${link(p.example)}`,
            `**Chỉ số đo:**\n${asArray<string>(p.kpis).map((k) => `- ${k}`).join('\n')}`,
          ].join('\n\n')
        ),
        '## 4. SAI LẦM CẦN TRÁNH',
        ideas.mistakes.map((m) => `- **${m.mistake}** → ${m.fix}`).join('\n'),
        '## 5. ĐỀ XUẤT 3 VIDEO',
        ...ideas.videos.map(
          (v, i) =>
            `### Video ${i + 1}: ${v.topic}\n**Tiêu đề:** ${v.title} _(${(v.title || '').length} ký tự)_\n\n**Thumbnail:** ${v.thumbnail}\n\n**Mô tả:** ${v.description}`
        ),
        '> Muốn làm tiếp? Chọn quy trình **Chủ đề → Kịch bản** và nhập chủ đề của video bạn chọn.',
        '## NGUỒN THAM KHẢO',
        sourcesMarkdown(sources),
      ].join('\n\n');

      const wordCount = countWords(markdown);
      h.detail(warnings.length ? `${warnings.length} cảnh báo · ${wordCount} từ` : `Đạt yêu cầu · ${wordCount} từ`);
      return {
        title: `Xu hướng marketing – ${today}`,
        markdown,
        copyBlocks: [
          ...ideas.videos.flatMap((v, i) => [
            { label: `Video ${i + 1} — tiêu đề`, text: v.title },
            { label: `Video ${i + 1} — mô tả`, text: v.description },
          ]),
          { label: 'Toàn bộ báo cáo (markdown)', text: markdown },
        ],
        warnings,
        wordCount,
      };
    });
  },
};
