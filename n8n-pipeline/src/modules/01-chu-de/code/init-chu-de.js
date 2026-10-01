const topic = ($json.chatInput || '').trim();

if (!topic) {
  throw new Error('Chủ đề không được để trống. Vui lòng nhập lại.');
}

return [{
  json: {
    candidate_topic: topic,
    attempt: 0,
    max_attempts: 5
  }
}];