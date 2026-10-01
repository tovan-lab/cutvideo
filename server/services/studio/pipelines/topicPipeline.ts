import type { PipelineDefinition } from '../types';
import { generateJson } from '../gemini';
import { formatResults, tavilySearch } from '../tavily';
import { appendRow, readRows, sheetsStatus } from '../googleSheets';
import { countWords, topicSimilarity, vnIsoDate } from '../utils';
import { asArray, asText, dedupeSources, SourceRef, sourcesMarkdown } from './shared';

// Cùng ngưỡng với bản n8n: "lạm phát" và "lạm phát Mỹ 2026" không bị coi là trùng.
const SIMILARITY_THRESHOLD = 0.75;
const MAX_ATTEMPTS = 5;

interface Research {
  summary: string;
  key_points: string[];
  data_points: string[];
  sources: SourceRef[];
}

interface Script {
  title: string;
  hook: string;
  sections: { heading: string; content: string; data_cited?: string }[];
  conclusion: string;
  call_to_action: string;
}

export const topicPipeline: PipelineDefinition = {
  id: 'topic',
  name: 'Chủ đề → Kịch bản',
  description: 'Nghiên cứu chủ đề, viết kịch bản thuyết trình 5–8 phút và prompt NotebookLM, lưu vào Google Sheet.',
  inputLabel: 'Chủ đề kinh tế',
  inputPlaceholder: 'Ví dụ: Lãi suất tiết kiệm cuối năm 2026',
  inputRequired: true,
  steps: [
    { id: 'sheet-read', label: 'Đọc chủ đề đã làm' },
    { id: 'dedupe', label: 'Kiểm tra trùng chủ đề' },
    { id: 'search', label: 'Tìm tin mới nhất' },
    { id: 'research', label: 'Tổng hợp nghiên cứu' },
    { id: 'script', label: 'Viết kịch bản' },
    { id: 'notebooklm', label: 'Viết prompt NotebookLM' },
    { id: 'sheet-write', label: 'Lưu vào Google Sheet' },
  ],

  async run(input, ctx) {
    const sheets = sheetsStatus();

    const sheet = await ctx.step('sheet-read', async (h) => {
      if (!sheets.configured) {
        h.skip(`${sheets.reason} — không chống trùng, không lưu`);
        return null;
      }
      const data = await readRows();
      if (!data.keys.includes('topic')) throw new Error('Sheet thiếu cột "topic" ở dòng tiêu đề');
      h.detail(`${data.rows.length} chủ đề đã làm`);
      return data;
    });
    const existing = (sheet?.rows || []).map((r) => r.topic).filter(Boolean);

    const topic = await ctx.step('dedupe', async (h) => {
      if (!existing.length) {
        h.skip('Không có danh sách chủ đề cũ để so');
        return input;
      }
      let candidate = input;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const match = existing.find((t) => topicSimilarity(candidate, t) >= SIMILARITY_THRESHOLD);
        if (!match) {
          h.detail(candidate === input ? 'Không trùng' : `Chủ đề mới: ${candidate}`);
          return candidate;
        }
        ctx.log(`Trùng với chủ đề đã làm: "${match}" — nhờ AI đề xuất chủ đề khác (lần ${attempt + 1})`, 'warn');
        const res = await generateJson<{ new_topic?: string }>(
          `Bạn là biên tập viên nội dung kênh YouTube kinh tế học tiếng Việt.

Chủ đề đang xét (đã bị trùng hoặc quá giống chủ đề cũ): ${candidate}

Danh sách các chủ đề ĐÃ LÀM RỒI (tuyệt đối không được trùng hoặc quá giống):
${existing.join(', ')}

Nhiệm vụ: Đề xuất 1 chủ đề kinh tế MỚI, liên quan đến lĩnh vực kinh tế học, có tính thời sự, thu hút người xem phổ thông, và KHÁC BIỆT rõ ràng với toàn bộ danh sách trên (không phải bản diễn giải khác của cùng 1 chủ đề), vẫn gần với ý của chủ đề đang xét.

Trả về JSON: {"new_topic": "tên chủ đề mới, ngắn gọn, rõ ràng"}`,
          { temperature: 0.8 }
        );
        candidate = asText(res.new_topic) || candidate;
      }
      throw new Error(`Đã thử ${MAX_ATTEMPTS} lần nhưng chưa tìm được chủ đề không trùng. Hãy nhập chủ đề khác.`);
    });

    const search = await ctx.step('search', async (h) => {
      const res = await tavilySearch({
        query: `${topic} kinh tế mới nhất`,
        topic: 'news',
        max_results: 8,
        include_answer: true,
      });
      h.detail(`${res.results.length} nguồn`);
      if (!res.results.length) throw new Error('Không tìm thấy nguồn tin nào cho chủ đề này');
      return res;
    });

    const research = await ctx.step('research', async (h) => {
      const r = await generateJson<Research>(
        `Bạn là chuyên gia nghiên cứu kinh tế, tổng hợp thông tin cho kênh YouTube kinh tế học tiếng Việt.

Chủ đề: ${topic}

Kết quả tìm kiếm mới nhất (nguồn thực tế, không được bịa thêm số liệu ngoài đây):
${formatResults(search.results)}

Tóm tắt nhanh từ công cụ search: ${search.answer || '(không có)'}

Nhiệm vụ: Tổng hợp thành dữ liệu nghiên cứu có cấu trúc, CHỈ dựa trên thông tin có trong các nguồn ở trên. Nếu một số liệu không có trong nguồn, đừng tự bịa ra.

Trả về JSON:
{
  "summary": "tóm tắt tổng quan 3-5 câu về chủ đề, dựa trên nguồn",
  "key_points": ["luận điểm chính 1", "..."],
  "data_points": ["số liệu/thống kê cụ thể kèm nguồn/ngày nếu có", "..."],
  "sources": [{"title": "tên nguồn", "url": "link nguồn"}]
}`,
        { temperature: 0.3 }
      );
      const sources = dedupeSources(
        asArray<SourceRef>(r.sources).length
          ? asArray<SourceRef>(r.sources)
          : search.results.map((s) => ({ title: s.title, url: s.url }))
      );
      const out: Research = {
        summary: asText(r.summary),
        key_points: asArray<string>(r.key_points),
        data_points: asArray<string>(r.data_points),
        sources,
      };
      h.detail(`${out.key_points.length} luận điểm · ${out.data_points.length} số liệu`);
      return out;
    });

    const sourcesText = research.sources.map((s) => `${s.title}: ${s.url}`).join(' | ');

    const script = await ctx.step('script', async (h) => {
      const s = await generateJson<Script>(
        `Bạn là biên kịch video thuyết trình cho kênh YouTube kinh tế học tiếng Việt, phong cách dễ hiểu, có dẫn chứng số liệu, phù hợp video 5-8 phút.

Chủ đề: ${topic}

Dữ liệu nghiên cứu (CHỈ dùng thông tin này, không bịa thêm số liệu):
Tóm tắt: ${research.summary}
Luận điểm chính: ${research.key_points.join('; ')}
Số liệu: ${research.data_points.join('; ')}
Nguồn: ${sourcesText}

Nhiệm vụ: Viết kịch bản thuyết trình hoàn chỉnh gồm: mở đầu gây chú ý (hook), 3-5 phần nội dung chính (mỗi phần có tiêu đề nhỏ, nội dung thuyết minh, số liệu dẫn chứng kèm nguồn), phần kết luận, và lời kêu gọi hành động (like/subscribe/để lại ý kiến).

Trả về JSON:
{
  "title": "tiêu đề video",
  "hook": "đoạn mở đầu gây chú ý (2-3 câu)",
  "sections": [{"heading": "tiêu đề phần", "content": "nội dung thuyết minh đầy đủ", "data_cited": "số liệu/nguồn được trích dẫn"}],
  "conclusion": "đoạn kết luận",
  "call_to_action": "lời kêu gọi hành động"
}`,
        { temperature: 0.6, maxOutputTokens: 16384 }
      );
      if (!asArray(s.sections).length) throw new Error('Kịch bản thiếu phần nội dung (sections)');
      h.detail(`${s.sections.length} phần · ${s.title}`);
      return s;
    });

    const scriptText = [
      `TIÊU ĐỀ: ${script.title || topic}`,
      `MỞ ĐẦU: ${script.hook || ''}`,
      ...script.sections.map(
        (s, i) => `PHẦN ${i + 1} - ${s.heading}:\n${s.content}\n(Dẫn chứng: ${s.data_cited || ''})`
      ),
      `KẾT LUẬN: ${script.conclusion || ''}`,
      `CTA: ${script.call_to_action || ''}`,
    ].join('\n\n');

    const notebookPrompt = await ctx.step('notebooklm', async () => {
      const r = await generateJson<{ notebooklm_prompt?: string }>(
        `Bạn là chuyên gia viết prompt cho NotebookLM (tính năng "Video Overview" / "Audio Overview" tùy chỉnh theo hướng dẫn của người dùng).

Kịch bản video đã hoàn chỉnh:
${scriptText}

Nhiệm vụ: Viết 1 đoạn HƯỚNG DẪN (prompt) bằng tiếng Việt để dán vào ô "Customize" của NotebookLM khi tạo Video Overview, sao cho video do NotebookLM tạo ra bám sát đúng nội dung, cấu trúc, giọng điệu và thứ tự các phần của kịch bản trên. Prompt cần nêu rõ: đối tượng khán giả, giọng điệu mong muốn, cấu trúc theo đúng các phần (mở đầu - nội dung - kết luận - CTA), những số liệu/luận điểm bắt buộc phải nhắc tới, và độ dài mong muốn.

Trả về JSON: {"notebooklm_prompt": "toàn bộ đoạn hướng dẫn hoàn chỉnh, sẵn sàng copy-paste"}`,
        { temperature: 0.4 }
      );
      const text = asText(r.notebooklm_prompt);
      if (!text) throw new Error('AI không trả về prompt NotebookLM');
      return text;
    });

    const warnings: string[] = [];
    await ctx.step('sheet-write', async (h) => {
      if (!sheet) {
        h.skip(sheets.reason || 'Chưa cấu hình Google Sheet');
        warnings.push('Chưa lưu vào Google Sheet vì chưa cấu hình (xem .env.example).');
        return;
      }
      const today = vnIsoDate();
      await appendRow(sheet.headers, {
        topic,
        research_data: JSON.stringify({
          summary: research.summary,
          key_points: research.key_points,
          data_points: research.data_points,
        }),
        sources: sourcesText,
        script: scriptText,
        prompt: notebookPrompt,
        status: 'ready',
        date_created: today,
        date_updated: today,
      });
      h.detail('Đã thêm 1 dòng, status = ready');
    });

    const markdown = [
      `# ${script.title || topic}`,
      topic !== input ? `> Chủ đề "${input}" đã làm rồi — AI đổi sang: **${topic}**` : '',
      '## Nghiên cứu',
      research.summary,
      '### Luận điểm chính',
      research.key_points.map((p) => `- ${p}`).join('\n'),
      '### Số liệu',
      research.data_points.map((p) => `- ${p}`).join('\n') || '_Không có số liệu cụ thể trong nguồn._',
      '## Kịch bản',
      `**Mở đầu:** ${script.hook}`,
      ...script.sections.map(
        (s, i) => `### Phần ${i + 1}. ${s.heading}\n${s.content}${s.data_cited ? `\n\n_Dẫn chứng: ${s.data_cited}_` : ''}`
      ),
      `### Kết luận\n${script.conclusion}`,
      `**Kêu gọi hành động:** ${script.call_to_action}`,
      '## Prompt NotebookLM',
      notebookPrompt,
      '## Nguồn tham khảo',
      sourcesMarkdown(research.sources),
    ]
      .filter(Boolean)
      .join('\n\n');

    return {
      title: script.title || topic,
      markdown,
      copyBlocks: [
        { label: 'Prompt NotebookLM', text: notebookPrompt },
        { label: 'Kịch bản (văn bản)', text: scriptText },
        { label: 'Tiêu đề video', text: script.title || topic },
      ],
      warnings,
      wordCount: countWords(markdown),
    };
  },
};
