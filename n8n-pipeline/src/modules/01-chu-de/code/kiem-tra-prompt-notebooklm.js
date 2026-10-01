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
  throw new Error('AI trả JSON prompt không hợp lệ: ' + e.message);
}

const prevNode = $('Code: Kiểm tra kịch bản').first().json;
const currentDate = new Date().toISOString().split('T')[0];

return [{
  json: {
    topic: prevNode.topic,
    notebooklm_prompt: parsed.notebooklm_prompt || '',
    status: 'ready',
    date_updated: currentDate
  }
}];