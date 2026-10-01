let inputItem = $input.first().json;
let raw = '';

if (inputItem.content && inputItem.content.parts) {
  raw = inputItem.content.parts.filter(p => !p.thought).map(p => p.text || '').join('');
} else if (inputItem.text) {
  raw = inputItem.text;
} else if (typeof inputItem === 'string') {
  raw = inputItem;
} else {
  raw = JSON.stringify(inputItem);
}

let cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
let parsed;
try {
  parsed = JSON.parse(cleaned);
} catch (e) {
  throw new Error('AI trả JSON đề xuất chủ đề không hợp lệ: ' + e.message);
}

// Lấy từ node tăng số lần thử để attempt không bị quay về giá trị trước khi tăng.
const prev = $('Code: Tăng số lần thử').last().json;

return [{
  json: {
    candidate_topic: parsed.new_topic || prev.candidate_topic,
    attempt: prev.attempt,
    max_attempts: prev.max_attempts,
    existing_topics: prev.existing_topics
  }
}];