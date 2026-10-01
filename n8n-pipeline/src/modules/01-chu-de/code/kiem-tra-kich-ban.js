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
let script;
try {
  script = JSON.parse(cleaned);
} catch (e) {
  throw new Error('AI trả JSON kịch bản không hợp lệ: ' + e.message);
}

if (!Array.isArray(script.sections) || script.sections.length === 0) {
  throw new Error('Kịch bản thiếu phần nội dung (sections).');
}

const topic = $('Code: Kiểm tra dữ liệu nghiên cứu').first().json.topic;
const currentDate = new Date().toISOString().split('T')[0];

const scriptText = [
  `TIÊU ĐỀ: ${script.title || topic}`,
  `MỞ ĐẦU: ${script.hook || ''}`,
  ...script.sections.map((s, i) => `PHẦN ${i + 1} - ${s.heading}:\n${s.content}\n(Dẫn chứng: ${s.data_cited || ''})`),
  `KẾT LUẬN: ${script.conclusion || ''}`,
  `CTA: ${script.call_to_action || ''}`
].join('\n\n');

return [{
  json: {
    topic: topic,
    script_json: script,
    script_text: scriptText,
    status: 'scripted',
    date_updated: currentDate
  }
}];