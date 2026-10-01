const rows = $input.all();
const existingTopics = rows.map(r => r.json.topic).filter(Boolean);
const init = $('Code: Init chủ đề').first().json;

return [{
  json: {
    candidate_topic: init.candidate_topic,
    attempt: init.attempt,
    max_attempts: init.max_attempts,
    existing_topics: existingTopics
  }
}];