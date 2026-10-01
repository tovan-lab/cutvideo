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
let research;
try {
  research = JSON.parse(cleaned);
} catch (e) {
  throw new Error('AI trả JSON nghiên cứu không hợp lệ: ' + e.message);
}

const searchNode = $('Code: Định dạng kết quả tìm kiếm').first().json;
const topic = searchNode.topic;
const currentDate = new Date().toISOString().split('T')[0];

const sources = Array.isArray(research.sources) && research.sources.length
  ? research.sources
  : searchNode.raw_sources;

return [{
  json: {
    topic: topic,
    summary: research.summary || '',
    key_points: Array.isArray(research.key_points) ? research.key_points : [],
    data_points: Array.isArray(research.data_points) ? research.data_points : [],
    sources: sources,
    research_data: JSON.stringify({
      summary: research.summary || '',
      key_points: research.key_points || [],
      data_points: research.data_points || []
    }),
    sources_text: sources.map(s => `${s.title}: ${s.url}`).join(' | '),
    status: 'researched',
    date_created: currentDate,
    date_updated: currentDate
  }
}];