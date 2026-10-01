const resp = $input.first().json;
const results = resp.results || [];

const formatted = results.map((r, i) =>
  `[Nguồn ${i + 1}] ${r.title}\nURL: ${r.url}\nNgày: ${r.published_date || 'không rõ'}\nTóm tắt: ${r.content}\n`
).join('\n---\n');

const topic = $('Code: Kiểm tra trùng chủ đề').first().json.candidate_topic;

return [{
  json: {
    topic: topic,
    search_answer: resp.answer || '',
    search_results_text: formatted || 'Không tìm thấy kết quả tìm kiếm.',
    raw_sources: results.map(r => ({ title: r.title, url: r.url, published_date: r.published_date || null }))
  }
}];