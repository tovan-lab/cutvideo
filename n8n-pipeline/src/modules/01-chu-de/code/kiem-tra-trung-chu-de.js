function normalize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/\u0111/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function tokens(str) {
  return new Set(normalize(str).split(/\s+/).filter(Boolean));
}

// Tr\u00f9ng khi gi\u1ed1ng h\u1ec7t, ho\u1eb7c t\u1ef7 l\u1ec7 t\u1eeb chung (Jaccard) t\u1eeb 0.75 tr\u1edf l\u00ean.
// "l\u1ea1m ph\u00e1t" v\u00e0 "l\u1ea1m ph\u00e1t M\u1ef9 2026" ch\u1ec9 chung 2/4 t\u1eeb n\u00ean kh\u00f4ng b\u1ecb coi l\u00e0 tr\u00f9ng.
const SIMILARITY_THRESHOLD = 0.75;

const data = $input.first().json;
const candidateTokens = tokens(data.candidate_topic);

const isDuplicate = (data.existing_topics || []).some(t => {
  const existingTokens = tokens(t);
  if (!existingTokens.size || !candidateTokens.size) return false;
  const shared = [...candidateTokens].filter(w => existingTokens.has(w)).length;
  const union = new Set([...candidateTokens, ...existingTokens]).size;
  return shared / union >= SIMILARITY_THRESHOLD;
});

return [{
  json: {
    ...data,
    is_duplicate: isDuplicate
  }
}];