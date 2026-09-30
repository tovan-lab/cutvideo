// server/services/ai-content/geminiVideoFactsService.ts
import { GoogleGenAI, Type, createPartFromUri } from "@google/genai";
import * as fs from "fs";
import * as path from "path";

// server/config/aiConfig.ts
var AI_CONFIG = {
  MODELS: {
    PRIMARY: "gemini-3.8-flash",
    FALLBACK: "gemini-3.5-flash",
    FLASH: "gemini-3.8-flash",
    TRANSCRIBE: "gemini-3.8-flash"
  },
  LIMITS: {
    MAX_AUDIO_DURATION_SEC: 1800
    // 30 mins
  }
};

// server/services/ai-content/geminiVideoFactsService.ts
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-ai-content"
      }
    }
  });
}
async function callWithRetry(ai, requestConfig) {
  const models = [AI_CONFIG.MODELS.PRIMARY, AI_CONFIG.MODELS.FALLBACK, "gemini-2.5-flash", "gemini-2.0-flash"];
  let lastError = null;
  for (const modelName of models) {
    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[VideoFacts] Invoking ${modelName} (attempt ${attempt}/${maxRetries})...`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: requestConfig.contents,
          config: requestConfig.config
        });
        return { response, modelUsed: modelName };
      } catch (err) {
        lastError = err;
        const msg = err?.message || String(err);
        console.warn(`[VideoFacts] ${modelName} attempt ${attempt} warning: ${msg.slice(0, 160)}`);
        const isRateLimitOrBusy = msg.includes("503") || msg.includes("429") || msg.includes("UNAVAILABLE") || msg.includes("RESOURCE_EXHAUSTED");
        if (isRateLimitOrBusy && attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
          continue;
        }
        break;
      }
    }
  }
  throw lastError || new Error("Kh\xF4ng th\u1EC3 ph\xE2n t\xEDch video qua Gemini. Vui l\xF2ng th\u1EED l\u1EA1i sau.");
}
var GeminiVideoFactsService = class {
  /**
   * Extract ground truth Video Facts using Gemini Files API with full audio & video inspection
   */
  async extractVideoFacts(sourceOrPath, legacyOriginalName, legacyMimeType) {
    const ai = getGeminiClient();
    if (!ai) {
      throw new Error("GEMINI_API_KEY ch\u01B0a \u0111\u01B0\u1EE3c c\u1EA5u h\xECnh trong .env");
    }
    const source = typeof sourceOrPath === "string" ? { filePath: sourceOrPath, originalName: legacyOriginalName, mimeType: legacyMimeType } : sourceOrPath;
    const originalName = source.originalName || source.fileName || "video.mp4";
    const mimeType = source.mimeType || "video/mp4";
    let filePart = null;
    let uploadedFile = source.fileName ? { name: source.fileName } : null;
    if (source.fileUri) {
      console.log(`[VideoFacts] Using direct Gemini file URI: ${source.fileUri} (${originalName})...`);
      if (source.fileName) {
        try {
          let getFile = await ai.files.get({ name: source.fileName });
          let waitSeconds = 0;
          while (getFile.state === "PROCESSING") {
            if (waitSeconds > 60) {
              throw new Error("Gemini x\u1EED l\xFD video qu\xE1 th\u1EDDi gian ch\u1EDD (timeout > 60s).");
            }
            await new Promise((resolve) => setTimeout(resolve, 3e3));
            waitSeconds += 3;
            getFile = await ai.files.get({ name: source.fileName });
            console.log(`[VideoFacts] File status: ${getFile.state} (${waitSeconds}s)`);
          }
          if (getFile.state === "FAILED") {
            throw new Error("Gemini Files API th\xF4ng b\xE1o x\u1EED l\xFD video th\u1EA5t b\u1EA1i.");
          }
        } catch (pollErr) {
          console.warn("[VideoFacts] Warning checking file state:", pollErr);
        }
      }
      filePart = createPartFromUri(source.fileUri, mimeType);
    } else if (source.filePath) {
      const filePath = source.filePath;
      if (!fs.existsSync(filePath)) {
        throw new Error(`T\u1EADp tin video kh\xF4ng t\u1ED3n t\u1EA1i t\u1EA1i: ${filePath}`);
      }
      const fileSize = fs.statSync(filePath).size;
      console.log(`[VideoFacts] Processing local video: ${originalName} (${(fileSize / (1024 * 1024)).toFixed(2)} MB)...`);
      try {
        console.log(`[VideoFacts] Uploading to Gemini Files API...`);
        uploadedFile = await ai.files.upload({
          file: new Blob([fs.readFileSync(filePath)]),
          config: {
            displayName: originalName || path.basename(filePath),
            mimeType
          }
        });
        console.log(`[VideoFacts] Uploaded file id: ${uploadedFile.name}. Waiting for processing...`);
        let getFile = await ai.files.get({ name: uploadedFile.name });
        let waitSeconds = 0;
        while (getFile.state === "PROCESSING") {
          if (waitSeconds > 60) {
            throw new Error("Gemini x\u1EED l\xFD video qu\xE1 th\u1EDDi gian ch\u1EDD (timeout > 60s).");
          }
          await new Promise((resolve) => setTimeout(resolve, 3e3));
          waitSeconds += 3;
          getFile = await ai.files.get({ name: uploadedFile.name });
          console.log(`[VideoFacts] File status: ${getFile.state} (${waitSeconds}s)`);
        }
        if (getFile.state === "FAILED") {
          throw new Error("Gemini Files API th\xF4ng b\xE1o x\u1EED l\xFD video th\u1EA5t b\u1EA1i.");
        }
        if (uploadedFile.uri && uploadedFile.mimeType) {
          filePart = createPartFromUri(uploadedFile.uri, uploadedFile.mimeType);
        }
      } catch (uploadErr) {
        console.warn(`[VideoFacts] Files API upload had an issue, checking fallback:`, uploadErr);
        if (fileSize < 20 * 1024 * 1024) {
          const fileBuffer = fs.readFileSync(filePath);
          filePart = {
            inlineData: {
              mimeType,
              data: fileBuffer.toString("base64")
            }
          };
        } else {
          throw uploadErr;
        }
      }
    } else {
      throw new Error("Thi\u1EBFu ngu\u1ED3n video (c\u1EA7n filePath ho\u1EB7c fileUri).");
    }
    const systemPrompt = `
B\u1EA0N L\xC0 M\u1ED8T H\u1EC6 TH\u1ED0NG TR\xCDCH XU\u1EA4T S\u1EF0 TH\u1EACT T\u1EEA VIDEO (VIDEO GROUND TRUTH EXTRACTION AI).
QUY T\u1EAEC B\u1EA4T DI B\u1EA4T D\u1ECACH (GROUND TRUTH RULES):
1. B\u1EA0N CH\u1EC8 \u0110\u01AF\u1EE2C PH\xC9P GHI NH\u1EACN NH\u1EEENG G\xCC B\u1EA0N T\u1EACN M\u1EAET NH\xCCN TH\u1EA4Y HO\u1EB6C T\u1EACN TAI NGHE TH\u1EA4Y TRONG VIDEO N\xC0Y.
2. TUY\u1EC6T \u0110\u1ED0I KH\xD4NG SUY \u0110O\xC1N, KH\xD4NG T\u1EF0 B\u1ECAA RA CH\u1EE6 \u0110\u1EC0 KH\xD4NG C\xD3 TRONG VIDEO.
3. PH\xC2N LO\u1EA0I CH\xCDNH X\xC1C VIDEO_TYPE:
   - "m\xE0n h\xECnh k\u1EBFt th\xFAc": N\u1EBFu video l\xE0 m\xE0n h\xECnh outro \u1EDF cu\u1ED1i, c\xF3 d\xF2ng ch\u1EEF nh\u01B0 "C\u1EA3m \u01A1n b\u1EA1n \u0111\xE3 xem", "\u0110\u0103ng k\xFD k\xEAnh", n\xFAt subscribe, gi\u1EDBi thi\u1EC7u video ti\u1EBFp theo.
   - "intro": N\u1EBFu video l\xE0 \u0111o\u1EA1n intro m\u1EDF \u0111\u1EA7u k\xEAnh, nh\u1EA1c hi\u1EC7u, logo k\xEAnh.
   - "qu\u1EA3ng c\xE1o": N\u1EBFu video thu\u1EA7n qu\u1EA3ng c\xE1o s\u1EA3n ph\u1EA9m/d\u1ECBch v\u1EE5 ng\u1EAFn.
   - "n\u1ED9i dung ch\xEDnh": N\u1EBFu video c\xF3 n\u1ED9i dung b\xE0i gi\u1EA3ng, tin t\u1EE9c, tr\u1EA3i nghi\u1EC7m \u0111\u1EA7y \u0111\u1EE7.
   - "kh\xE1c": C\xE1c tr\u01B0\u1EDDng h\u1EE3p kh\xE1c.
4. \u0110\u1ECCC CH\xCDNH X\xC1C T\u1EA4T C\u1EA2 D\xD2NG CH\u1EEE TR\xCAN M\xC0N H\xCCNH (on_screen_text): T\xEAn k\xEAnh, slogan, ti\xEAu \u0111\u1EC1 ph\u1EE5 \u0111\u1EC1, ghi ch\xFA xu\u1EA5t hi\u1EC7n tr\xEAn khung h\xECnh (V\xED d\u1EE5: "KINH T\u1EBE 8 PH\xDAT", "C\u1EA3m \u01A1n b\u1EA1n \u0111\xE3 xem!", "\u0110\u0103ng k\xFD k\xEAnh \u0111\u1EC3 nh\u1EADn b\u1EA3n tin kinh t\u1EBF m\u1ED7i ng\xE0y").
5. N\u1EBEU VIDEO QU\xC1 NG\u1EAEN HO\u1EB6C \xCDT TH\xD4NG TIN:
   - \u0110\u1EB7t "is_low_information": true.
   - T\xF3m t\u1EAFt \u0111\xFAng b\u1EA3n ch\u1EA5t ng\u1EAFn g\u1ECDn: v\xED d\u1EE5 "M\xE0n h\xECnh k\u1EBFt th\xFAc c\u1EE7a k\xEAnh Kinh T\u1EBF 8 Ph\xFAt c\u1EA3m \u01A1n ng\u01B0\u1EDDi xem v\xE0 k\xEAu g\u1ECDi \u0111\u0103ng k\xFD k\xEAnh".
   - TUY\u1EC6T \u0110\u1ED0I KH\xD4NG B\u1ECAA RA c\xE1c ch\u1EE7 \u0111\u1EC1 nh\u01B0 tri\u1EC3n l\xE3m ngh\u1EC7 thu\u1EADt, du l\u1ECBch, n\u1EA5u \u0103n hay tin t\u1EE9c n\xE0o kh\xE1c!
6. B\xD3C L\u1EDCI THO\u1EA0I (TRANSCRIPT): Ghi l\u1EA1i ch\xEDnh x\xE1c \xE2m thanh n\u1EBFu c\xF3 l\u1EDDi n\xF3i. N\u1EBFu kh\xF4ng c\xF3 ti\u1EBFng n\xF3i con ng\u01B0\u1EDDi (ch\u1EC9 c\xF3 nh\u1EA1c n\u1EC1n ho\u1EB7c im l\u1EB7ng), \u0111\u1EC3 transcript l\xE0 m\u1EA3ng r\u1ED7ng [].
`;
    const contents = [
      { text: systemPrompt },
      filePart,
      {
        text: "H\xE3y ph\xE2n t\xEDch to\xE0n di\u1EC7n c\u1EA3 h\xECnh \u1EA3nh v\xE0 \xE2m thanh c\u1EE7a video v\xE0 tr\u1EA3 v\u1EC1 k\u1EBFt qu\u1EA3 theo schema JSON quy \u0111\u1ECBnh."
      }
    ];
    const { response } = await callWithRetry(ai, {
      contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: "T\xF3m t\u1EAFt s\u1EF1 th\u1EADt ch\xE2n th\u1EF1c 1-3 c\xE2u d\u1EF1a tr\xEAn nh\u1EEFng g\xEC th\u1EA5y v\xE0 nghe \u0111\u01B0\u1EE3c, kh\xF4ng b\u1ECBa \u0111\u1EB7t."
            },
            main_topic: {
              type: Type.STRING,
              description: 'Ch\u1EE7 \u0111\u1EC1 ch\xEDnh x\xE1c c\u1EE7a video (V\xED d\u1EE5: "M\xE0n h\xECnh k\u1EBFt th\xFAc & L\u1EDDi c\u1EA3m \u01A1n k\xEAnh Kinh T\u1EBF 8 Ph\xFAt").'
            },
            sub_topics: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "C\xE1c ch\u1EE7 \u0111\u1EC1 ph\u1EE5 xu\u1EA5t hi\u1EC7n trong video."
            },
            entities: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  type: { type: Type.STRING, description: "channel | brand | person | place | product | concept" }
                },
                required: ["name", "type"]
              },
              description: "Danh s\xE1ch th\u1EF1c th\u1EC3, t\xEAn k\xEAnh, t\xEAn ng\u01B0\u1EDDi, th\u01B0\u01A1ng hi\u1EC7u nh\xECn th\u1EA5y ho\u1EB7c nghe th\u1EA5y."
            },
            numbers_and_facts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  fact: { type: Type.STRING },
                  timestamp: { type: Type.STRING }
                },
                required: ["fact"]
              },
              description: "C\xE1c con s\u1ED1, th\u1EDDi gian, s\u1EF1 ki\u1EC7n c\u1EE5 th\u1EC3 c\xF3 trong video."
            },
            on_screen_text: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "T\u1EA5t c\u1EA3 c\xE1c \u0111o\u1EA1n ch\u1EEF hi\u1EC3n th\u1ECB tr\xEAn m\xE0n h\xECnh video."
            },
            transcript: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  start: { type: Type.NUMBER },
                  text: { type: Type.STRING }
                },
                required: ["start", "text"]
              },
              description: "B\xF3c t\xE1ch l\u1EDDi tho\u1EA1i th\u1EF1c t\u1EBF t\u1EEB \xE2m thanh."
            },
            chapters: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  start: { type: Type.STRING },
                  title: { type: Type.STRING }
                },
                required: ["start", "title"]
              },
              description: "C\xE1c m\u1ED1c th\u1EDDi gian ch\u01B0\u01A1ng b\u1EAFt \u0111\u1EA7u b\u1EB1ng 00:00."
            },
            video_type: {
              type: Type.STRING,
              enum: ["n\u1ED9i dung ch\xEDnh", "intro", "m\xE0n h\xECnh k\u1EBFt th\xFAc", "qu\u1EA3ng c\xE1o", "kh\xE1c"],
              description: "\u0110\u1ECBnh d\u1EA1ng v\xE0 b\u1EA3n ch\u1EA5t th\u1EF1c c\u1EE7a video."
            },
            duration_sec: {
              type: Type.NUMBER,
              description: "Th\u1EDDi l\u01B0\u1EE3ng video b\u1EB1ng gi\xE2y."
            },
            orientation: {
              type: Type.STRING,
              description: "T\u1EC9 l\u1EC7 hi\u1EC3n th\u1ECB (16:9 ngang, 9:16 d\u1ECDc, ho\u1EB7c 1:1 vu\xF4ng)."
            },
            is_low_information: {
              type: Type.BOOLEAN,
              description: "True n\u1EBFu video qu\xE1 ng\u1EAFn ho\u1EB7c l\xE0 m\xE0n h\xECnh t\u0129nh/\xEDt th\xF4ng tin."
            }
          },
          required: ["summary", "main_topic", "video_type", "on_screen_text"]
        }
      }
    });
    if (uploadedFile?.name) {
      ai.files.delete({ name: uploadedFile.name }).catch((err) => {
        console.warn(`[VideoFacts] Note: file deletion:`, err?.message || err);
      });
    }
    const text = response.text || "{}";
    const parsed = JSON.parse(text);
    return {
      summary: parsed.summary || "Kh\xF4ng c\xF3 t\xF3m t\u1EAFt",
      main_topic: parsed.main_topic || "Ch\u01B0a x\xE1c \u0111\u1ECBnh",
      sub_topics: Array.isArray(parsed.sub_topics) ? parsed.sub_topics : [],
      entities: Array.isArray(parsed.entities) ? parsed.entities : [],
      numbers_and_facts: Array.isArray(parsed.numbers_and_facts) ? parsed.numbers_and_facts : [],
      on_screen_text: Array.isArray(parsed.on_screen_text) ? parsed.on_screen_text : [],
      transcript: Array.isArray(parsed.transcript) ? parsed.transcript : [],
      chapters: Array.isArray(parsed.chapters) ? parsed.chapters : [],
      video_type: parsed.video_type || "n\u1ED9i dung ch\xEDnh",
      duration_sec: typeof parsed.duration_sec === "number" ? parsed.duration_sec : 0,
      orientation: parsed.orientation || "16:9",
      is_low_information: Boolean(parsed.is_low_information)
    };
  }
};
var geminiVideoFactsService = new GeminiVideoFactsService();

// server/services/ai-content/keywordResearchService.ts
import { GoogleGenAI as GoogleGenAI2 } from "@google/genai";
var CACHE_TTL_MS = 6 * 60 * 60 * 1e3;
var cache = /* @__PURE__ */ new Map();
function getGeminiClient2() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI2({ apiKey });
}
async function fetchWithTimeout(url, timeoutMs = 8e3) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    return null;
  }
}
var KeywordResearchService = class {
  /**
   * Main entry point for Real Keyword Research with 6-hour caching
   */
  async researchKeywords(facts, channelName, userKeyword) {
    const cacheKey = `${facts.main_topic}_${facts.video_type}_${channelName || ""}_${userKeyword || ""}`.toLowerCase();
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log(`[KeywordResearch] Serving from 6h cache for key: ${cacheKey}`);
      return cached.data;
    }
    console.log(`[KeywordResearch] Running keyword research for topic: "${facts.main_topic}"...`);
    const seedKeywords = this.generateSeedKeywords(facts, channelName, userKeyword);
    const [ytSuggestions, googleSuggestions, ytApiTags, trendingSocial] = await Promise.all([
      this.fetchYouTubeSuggestions(seedKeywords),
      this.fetchGoogleSuggestions(seedKeywords),
      this.fetchYouTubeDataApiTags(seedKeywords[0] || facts.main_topic),
      this.fetchSocialTrendingKeywords(facts)
    ]);
    const scoredKeywords = this.scoreAndFilterKeywords(
      facts,
      seedKeywords,
      ytSuggestions,
      googleSuggestions,
      ytApiTags,
      trendingSocial
    );
    const result = {
      seed_keywords: seedKeywords,
      youtube_suggestions: ytSuggestions.slice(0, 15),
      google_suggestions: googleSuggestions.slice(0, 15),
      trending_tags: [...ytApiTags, ...trendingSocial].slice(0, 15),
      scored_keywords: scoredKeywords.slice(0, 12)
    };
    cache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  }
  /**
   * Derive seed keywords strictly based on VideoFacts (no hallucination)
   */
  generateSeedKeywords(facts, channelName, userKeyword) {
    const seeds = /* @__PURE__ */ new Set();
    if (userKeyword?.trim()) {
      seeds.add(userKeyword.trim());
    }
    if (channelName?.trim()) {
      seeds.add(channelName.trim());
    }
    for (const text of facts.on_screen_text) {
      if (text.length > 2 && text.length < 35) {
        seeds.add(text.trim());
      }
    }
    for (const entity of facts.entities) {
      if (entity.name) {
        seeds.add(entity.name.trim());
      }
    }
    if (facts.main_topic && facts.main_topic.length < 40) {
      seeds.add(facts.main_topic);
    }
    if (facts.video_type === "m\xE0n h\xECnh k\u1EBFt th\xFAc") {
      seeds.add("k\u1EBFt th\xFAc video");
      seeds.add("c\u1EA3m \u01A1n \u0111\xE3 xem");
      seeds.add("\u0111\u0103ng k\xFD k\xEAnh");
    } else if (facts.video_type === "intro") {
      seeds.add("gi\u1EDBi thi\u1EC7u k\xEAnh");
    }
    return Array.from(seeds).slice(0, 8);
  }
  /**
   * YouTube Search Suggest API (timeout 8s)
   */
  async fetchYouTubeSuggestions(seeds) {
    const suggestions = /* @__PURE__ */ new Set();
    const promises = seeds.slice(0, 4).map(async (query) => {
      const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=vi&gl=VN&q=${encodeURIComponent(query)}`;
      const json = await fetchWithTimeout(url, 8e3);
      if (Array.isArray(json) && Array.isArray(json[1])) {
        for (const item of json[1]) {
          if (typeof item === "string") suggestions.add(item);
        }
      }
    });
    await Promise.allSettled(promises);
    return Array.from(suggestions);
  }
  /**
   * Google Search Suggest API (timeout 8s)
   */
  async fetchGoogleSuggestions(seeds) {
    const suggestions = /* @__PURE__ */ new Set();
    const promises = seeds.slice(0, 4).map(async (query) => {
      const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=vi&gl=VN&q=${encodeURIComponent(query)}`;
      const json = await fetchWithTimeout(url, 8e3);
      if (Array.isArray(json) && Array.isArray(json[1])) {
        for (const item of json[1]) {
          if (typeof item === "string") suggestions.add(item);
        }
      }
    });
    await Promise.allSettled(promises);
    return Array.from(suggestions);
  }
  /**
   * YouTube Data API v3 (Search top videos within last 30 days)
   * Gracefully skipped if YOUTUBE_API_KEY is omitted or invalid.
   */
  async fetchYouTubeDataApiTags(query) {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return [];
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1e3).toISOString();
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
        query
      )}&type=video&regionCode=VN&relevanceLanguage=vi&order=viewCount&publishedAfter=${thirtyDaysAgo}&maxResults=5&key=${apiKey}`;
      const res = await fetchWithTimeout(url, 8e3);
      if (!res || !Array.isArray(res.items)) return [];
      const tags = /* @__PURE__ */ new Set();
      for (const item of res.items) {
        if (item.snippet?.title) {
          const title = item.snippet.title;
          const matches = title.match(/#[\w\d\p{L}]+/gu) || [];
          matches.forEach((m) => tags.add(m));
          tags.add(title.slice(0, 40));
        }
      }
      return Array.from(tags).slice(0, 10);
    } catch {
      return [];
    }
  }
  /**
   * Social Trending Keywords via Gemini with Google Search Grounding
   */
  async fetchSocialTrendingKeywords(facts) {
    const ai = getGeminiClient2();
    if (!ai) return [];
    try {
      const prompt = `D\u1EF1a v\xE0o ch\u1EE7 \u0111\u1EC1: "${facts.main_topic}", h\xE3y li\u1EC7t k\xEA 5-7 c\u1EE5m t\u1EEB t\xECm ki\u1EBFm ho\u1EB7c hashtag \u0111ang th\u1ECBnh h\xE0nh nh\u1EA5t t\u1EA1i Vi\u1EC7t Nam tr\xEAn TikTok, Facebook, Instagram li\xEAn quan tr\u1EF1c ti\u1EBFp \u0111\u1EBFn ch\u1EE7 \u0111\u1EC1 n\xE0y. Ch\u1EC9 tr\u1EA3 v\u1EC1 danh s\xE1ch c\xE1c t\u1EEB c\xE1ch nhau b\u1EDFi d\u1EA5u ph\u1EA9y, kh\xF4ng gi\u1EA3i th\xEDch.`;
      const response = await ai.models.generateContent({
        model: AI_CONFIG.MODELS.PRIMARY,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });
      const text = response.text || "";
      return text.split(/[,;\n]/).map((s) => s.trim().replace(/^[-*•#\d.]+\s*/, "")).filter((s) => s.length > 2 && s.length < 35);
    } catch {
      return [];
    }
  }
  /**
   * Multi-source Scoring & Strict Relevance Filtering against VideoFacts
   */
  scoreAndFilterKeywords(facts, seeds, ytSuggestions, googleSuggestions, ytApiTags, social) {
    const map = /* @__PURE__ */ new Map();
    const record = (kw, src) => {
      const clean = kw.toLowerCase().trim();
      if (!clean || clean.length < 2 || clean.length > 45) return;
      if (!map.has(clean)) {
        map.set(clean, { count: 0, sources: /* @__PURE__ */ new Set() });
      }
      const entry = map.get(clean);
      entry.count += 1;
      entry.sources.add(src);
    };
    seeds.forEach((k) => record(k, "Seed Fact"));
    ytSuggestions.forEach((k) => record(k, "YouTube Suggest"));
    googleSuggestions.forEach((k) => record(k, "Google Suggest"));
    ytApiTags.forEach((k) => record(k, "YouTube Top"));
    social.forEach((k) => record(k, "Social Trend"));
    const items = [];
    const factTextPool = `${facts.main_topic} ${facts.summary} ${facts.on_screen_text.join(" ")} ${facts.entities.map((e) => e.name).join(" ")}`.toLowerCase();
    for (const [kw, val] of map.entries()) {
      const tokens = kw.split(/\s+/).filter((t) => t.length > 2);
      const isRelevant = facts.video_type === "m\xE0n h\xECnh k\u1EBFt th\xFAc" || facts.video_type === "intro" ? kw.includes("k\xEAnh") || kw.includes("\u0111\u0103ng k\xFD") || kw.includes("c\u1EA3m \u01A1n") || kw.includes("xem") || tokens.some((t) => factTextPool.includes(t)) : tokens.some((t) => factTextPool.includes(t));
      if (!isRelevant) {
        continue;
      }
      const score = Math.min(100, val.sources.size * 25 + val.count * 5);
      items.push({
        keyword: kw,
        score,
        sources: Array.from(val.sources)
      });
    }
    return items.sort((a, b) => b.score - a.score);
  }
};
var keywordResearchService = new KeywordResearchService();

// server/services/ai-content/contentGenerationService.ts
import { GoogleGenAI as GoogleGenAI3, Type as Type2 } from "@google/genai";

// src/lib/ai-content/platform-rules.ts
var PLATFORM_RULES = {
  youtube_long: {
    name: "YouTube Video D\xE0i",
    maxTitleLength: 100,
    bestTitleLengthRange: [50, 70],
    primaryKeywordInTitleChars: 40,
    minHashtags: 3,
    maxHashtags: 5,
    maxTagsCount: 15,
    maxTagsTotalLength: 500,
    descriptionRules: "150 k\xFD t\u1EF1 \u0111\u1EA7u c\u1EE7a m\xF4 t\u1EA3 PH\u1EA2I ch\u1EE9a t\u1EEB kh\xF3a ch\xEDnh v\xE0 n\xEAu b\u1EADt gi\xE1 tr\u1ECB c\u1ED1t l\xF5i c\u1EE7a video. N\u1EBFu video >60 gi\xE2y, b\u1ED5 sung danh s\xE1ch m\u1ED1c th\u1EDDi gian ch\u01B0\u01A1ng (b\u1EAFt \u0111\u1EA7u b\u1EB1ng 00:00). K\xEAu g\u1ECDi ng\u01B0\u1EDDi xem \u0110\u0103ng k\xFD k\xEAnh (Subscribe) v\xE0 b\u1EADt chu\xF4ng.",
    generalRules: "Ti\xEAu \u0111\u1EC1 chu\u1EA9n SEO, gi\u1EADt t\xEDt \u0111\xFAng s\u1EF1 th\u1EADt, t\u1EEB kh\xF3a ch\xEDnh xu\u1EA5t hi\u1EC7n trong 40 k\xFD t\u1EF1 \u0111\u1EA7u. K\xE8m 10-15 th\u1EBB tags c\xF3 li\xEAn quan tr\u1EF1c ti\u1EBFp, t\u1ED5ng \u0111\u1ED9 d\xE0i tags kh\xF4ng v\u01B0\u1EE3t qu\xE1 500 k\xFD t\u1EF1."
  },
  youtube_shorts: {
    name: "YouTube Shorts",
    maxTitleLength: 60,
    bestTitleLengthRange: [30, 50],
    primaryKeywordInTitleChars: 30,
    minHashtags: 3,
    maxHashtags: 5,
    requiredHashtags: ["#shorts"],
    descriptionRules: "M\xF4 t\u1EA3 s\xFAc t\xEDch ch\u1EC9 t\u1EEB 1-2 c\xE2u, n\xEAu r\xF5 \u0111i\u1EC3m th\xFA v\u1ECB nh\u1EA5t c\u1EE7a clip.",
    generalRules: "Ti\xEAu \u0111\u1EC1 ng\u1EAFn g\u1ECDn \u226460 k\xFD t\u1EF1, b\u1EAFt bu\u1ED9c c\xF3 hashtag #shorts trong m\xF4 t\u1EA3 ho\u1EB7c ti\xEAu \u0111\u1EC1."
  },
  tiktok: {
    name: "TikTok",
    maxTitleLength: 70,
    bestTitleLengthRange: [30, 60],
    primaryKeywordInTitleChars: 30,
    minHashtags: 3,
    maxHashtags: 5,
    descriptionRules: "D\xF2ng \u0111\u1EA7u ti\xEAn l\xE0 c\xE2u Hook g\xE2y t\xF2 m\xF2 ch\u1EE9a t\u1EEB kh\xF3a ch\xEDnh. T\u1ED5ng \u0111\u1ED9 d\xE0i m\xF4 t\u1EA3/caption t\u1EEB 100 \u0111\u1EBFn 300 k\xFD t\u1EF1.",
    generalRules: "Hashtag th\u1ECBnh h\xE0nh \u0111\xFAng ng\xE1ch, vi\u1EBFt li\u1EC1n kh\xF4ng d\u1EA5u, t\u1ED1i \u0111a 2 emoji."
  },
  facebook: {
    name: "Facebook Reels / Post",
    maxTitleLength: 80,
    bestTitleLengthRange: [40, 70],
    primaryKeywordInTitleChars: 40,
    minHashtags: 1,
    maxHashtags: 3,
    descriptionRules: 'C\xE2u m\u1EDF \u0111\u1EA7u \u2264125 k\xFD t\u1EF1 \u0111\u1EC3 kh\xF4ng b\u1ECB \u1EA9n sau n\xFAt "Xem th\xEAm". K\u1EBF ti\u1EBFp l\xE0 1-2 c\xE2u t\xF3m t\u1EAFt n\u1ED9i dung v\xE0 1 c\xE2u h\u1ECFi m\u1EDF k\xEDch th\xEDch kh\xE1n gi\u1EA3 \u0111\u1EC3 l\u1EA1i b\xECnh lu\u1EADn.',
    generalRules: "Gi\u1ECDng v\u0103n t\u1EF1 nhi\xEAn, th\xE2n thi\u1EC7n chia s\u1EBB, ch\u1EC9 d\xF9ng 1-3 hashtag tr\u1ECDng t\xE2m."
  },
  instagram: {
    name: "Instagram Reels",
    maxTitleLength: 70,
    bestTitleLengthRange: [35, 60],
    primaryKeywordInTitleChars: 35,
    minHashtags: 3,
    maxHashtags: 5,
    descriptionRules: "D\xF2ng \u0111\u1EA7u ti\xEAn ch\u1EE9a t\u1EEB kh\xF3a ch\xEDnh, c\xE2u v\u0103n tinh t\u1EBF, t\u1ED5ng \u0111\u1ED9 d\xE0i caption t\u1EEB 125 \u0111\u1EBFn 300 k\xFD t\u1EF1, ng\u1EAFt d\xF2ng tho\xE1ng.",
    generalRules: "T\u1ED1i \u0111a 2 emoji, hashtag vi\u1EBFt li\u1EC1n kh\xF4ng d\u1EA5u, c\xE2u t\u1EEB ch\u1EC9n chu th\u1EA9m m\u1EF9."
  }
};
var TITLE_TONE_GUIDELINES = {
  professional: {
    label: "Chuy\xEAn nghi\u1EC7p",
    desc: "Chu\u1EA9n m\u1EF1c, h\u1ECDc thu\u1EADt, \u0111\xE1ng tin c\u1EADy",
    prompt: "Gi\u1ECDng v\u0103n chuy\xEAn nghi\u1EC7p, l\u1EADp lu\u1EADn ch\u1EAFc ch\u1EAFn, ng\u1EEF \u0111i\u1EC7u uy t\xEDn, t\u1EADp trung v\xE0o gi\xE1 tr\u1ECB th\u1EF1c t\u1EBF."
  },
  curiosity: {
    label: "T\xF2 m\xF2 / C\xE2u h\u1ECFi",
    desc: "K\xEDch th\xEDch kh\xE1m ph\xE1, kho\u1EA3ng tr\u1ED1ng th\xF4ng tin",
    prompt: "\u0110\u1EB7t c\xE2u h\u1ECFi ho\u1EB7c n\xEAu nghi v\u1EA5n g\xE2y t\xF2 m\xF2, m\u1EDF ra kho\u1EA3ng tr\u1ED1ng t\xF2 m\xF2 (curiosity gap) khi\u1EBFn ng\u01B0\u1EDDi xem ph\u1EA3i b\u1EA5m v\xE0o."
  },
  numbers: {
    label: "Con s\u1ED1 n\u1ED5i b\u1EADt",
    desc: "S\u1ED1 li\u1EC7u c\u1EE5 th\u1EC3, m\u1ED1c th\u1EDDi gian r\xF5 r\xE0ng",
    prompt: "Nh\u1EA5n m\u1EA1nh v\xE0o c\xE1c con s\u1ED1, th\u1EDDi gian, d\u1EEF li\u1EC7u \u0111\u1ECBnh l\u01B0\u1EE3ng c\u1EE5 th\u1EC3 \u0111\u01B0\u1EE3c tr\xEDch xu\u1EA5t tr\u1EF1c ti\u1EBFp t\u1EEB video."
  },
  natural: {
    label: "T\u1EF1 nhi\xEAn",
    desc: "G\u1EA7n g\u0169i, \u0111\u1EDDi th\u01B0\u1EDDng nh\u01B0 tr\xF2 chuy\u1EC7n",
    prompt: "V\u0103n phong \u0111\u1EDDi th\u01B0\u1EDDng, g\u1EA7n g\u0169i, th\xE2n thi\u1EC7n nh\u01B0 l\u1EDDi chia s\u1EBB th\u1EADt t\xE2m gi\u1EEFa nh\u1EEFng ng\u01B0\u1EDDi b\u1EA1n."
  }
};
function buildPromptForPlatform(platform, facts, primaryKeyword, suggestedKeywords, tone, channelName, userContext) {
  const rule = PLATFORM_RULES[platform];
  const toneGuide = TITLE_TONE_GUIDELINES[tone];
  const isIntroOrOutro = facts.video_type === "intro" || facts.video_type === "m\xE0n h\xECnh k\u1EBFt th\xFAc";
  let specialTypeInstruction = "";
  if (isIntroOrOutro) {
    specialTypeInstruction = `
[L\u01AFU \xDD C\u1EF0C K\u1EF2 QUAN TR\u1ECCNG V\u1EC0 B\u1EA2N CH\u1EA4T VIDEO]:
Video n\xE0y \u0111\u01B0\u1EE3c x\xE1c \u0111\u1ECBnh l\xE0: "${facts.video_type.toUpperCase()}".
${facts.is_low_information ? "Video c\xF3 th\u1EDDi l\u01B0\u1EE3ng ng\u1EAFn ho\u1EB7c \xEDt th\xF4ng tin chi ti\u1EBFt." : ""}
TUY\u1EC6T \u0110\u1ED0I KH\xD4NG B\u1ECAA RA m\u1ED9t ch\u1EE7 \u0111\u1EC1 th\u1EDDi s\u1EF1, s\u1EF1 ki\u1EC7n, tri\u1EC3n l\xE3m hay c\xE2u chuy\u1EC7n kh\xF4ng c\xF3 trong video!
H\xC3Y T\u1EA0O N\u1ED8I DUNG \u0110\xDANG V\u1EDAI B\u1EA2N CH\u1EA4T:
- N\u1EBFu l\xE0 "m\xE0n h\xECnh k\u1EBFt th\xFAc": \u0110\xE2y l\xE0 \u0111o\u1EA1n k\u1EBFt video, l\u1EDDi c\u1EA3m \u01A1n kh\xE1n gi\u1EA3 \u0111\xE3 theo d\xF5i k\xEAnh, k\xEAu g\u1ECDi \u0111\u0103ng k\xFD k\xEAnh (Subscribe), theo d\xF5i c\xE1c b\u1EA3n tin ti\u1EBFp theo c\u1EE7a k\xEAnh ${channelName || facts.on_screen_text[0] || "k\xEAnh"}.
- N\u1EBFu l\xE0 "intro": \u0110o\u1EA1n m\u1EDF \u0111\u1EA7u gi\u1EDBi thi\u1EC7u k\xEAnh v\xE0 ch\xE0o m\u1EEBng kh\xE1n gi\u1EA3.
`;
  }
  return `
B\u1EA0N L\xC0 CHUY\xCAN GIA T\u1ED0I \u01AFU H\xD3A N\u1ED8I DUNG V\xC0 SEO CHO N\u1EC0N T\u1EA2NG: ${rule.name.toUpperCase()}

D\u1EEE LI\u1EC6U S\u1EF0 TH\u1EACT T\u1EEA VIDEO (VIDEO FACTS - 100% GROUND TRUTH):
- Lo\u1EA1i video: ${facts.video_type}
- Ch\u1EE7 \u0111\u1EC1 c\u1ED1t l\xF5i: ${facts.main_topic}
- T\xF3m t\u1EAFt th\u1EF1c t\u1EBF: "${facts.summary}"
- Ch\u1EEF xu\u1EA5t hi\u1EC7n tr\xEAn m\xE0n h\xECnh: ${facts.on_screen_text.length > 0 ? facts.on_screen_text.join(" | ") : "(Kh\xF4ng c\xF3 ch\u1EEF)"}
- Th\u1EF1c th\u1EC3 / T\xEAn ri\xEAng: ${facts.entities.map((e) => `${e.name} (${e.type})`).join(", ") || "(Kh\xF4ng c\xF3)"}
- S\u1ED1 li\u1EC7u & S\u1EF1 ki\u1EC7n: ${facts.numbers_and_facts.map((n) => n.fact).join("; ") || "(Kh\xF4ng c\xF3)"}
- Th\u1EDDi l\u01B0\u1EE3ng: ${facts.duration_sec}s \xB7 Khung h\xECnh: ${facts.orientation}
${channelName ? `- T\xEAn k\xEAnh ph\xE1t h\xE0nh: "${channelName}"` : ""}
${userContext ? `- B\u1ED1i c\u1EA3nh b\u1ED5 sung do ng\u01B0\u1EDDi d\xF9ng cung c\u1EA5p: "${userContext}"` : ""}
${facts.transcript.length > 0 ? `- Tr\xEDch \u0111o\u1EA1n l\u1EDDi tho\u1EA1i: ${facts.transcript.slice(0, 5).map((t) => `"${t.text}"`).join(" ")}` : ""}

${specialTypeInstruction}

T\u1EEA KH\xD3A \u0110\xC3 NGHI\xCAN C\u1EE8U:
- T\u1EEB kh\xF3a ch\xEDnh (Primary Keyword): "${primaryKeyword}"
- C\xE1c t\u1EEB kh\xF3a li\xEAn quan \u0111\u01B0\u1EE3c t\xECm ki\u1EBFm nhi\u1EC1u: ${suggestedKeywords.slice(0, 6).join(", ")}

PHONG C\xC1CH TI\xCAU \u0110\u1EC0: ${toneGuide.label} (${toneGuide.prompt})

Y\xCAU C\u1EA6U QUY T\u1EAEC C\u1EE4 TH\u1EC2 CHO N\u1EC0N T\u1EA2NG ${platform.toUpperCase()}:
1. TI\xCAU \u0110\u1EC0 (TITLES):
   - T\u1EA1o ch\xEDnh x\xE1c 3 PH\u01AF\u01A0NG \xC1N TI\xCAU \u0110\u1EC0 KH\xC1C NHAU.
   - \u0110\u1ED9 d\xE0i t\u1ED1i \u0111a: ${rule.maxTitleLength} k\xFD t\u1EF1 (t\u1ED1t nh\u1EA5t trong kho\u1EA3ng ${rule.bestTitleLengthRange[0]}-${rule.bestTitleLengthRange[1]} k\xFD t\u1EF1).
   - T\u1EEB kh\xF3a ch\xEDnh "${primaryKeyword}" PH\u1EA2I n\u1EB1m trong ${rule.primaryKeywordInTitleChars} k\xFD t\u1EF1 \u0111\u1EA7u ti\xEAn c\u1EE7a ti\xEAu \u0111\u1EC1.
   - Tuy\u1EC7t \u0111\u1ED1i kh\xF4ng b\u1ECBa s\u1ED1 li\u1EC7u hay th\xF4ng tin kh\xF4ng c\xF3 trong Video Facts.
2. M\xD4 T\u1EA2 (DESCRIPTION):
   - ${rule.descriptionRules}
   - Ti\u1EBFng Vi\u1EC7t c\xF3 d\u1EA5u chu\u1EA9n x\xE1c, h\xE0nh v\u0103n t\u1EF1 nhi\xEAn, kh\xF4ng nh\u1ED3i nh\xE9t t\u1EEB kh\xF3a.
3. HASHTAGS:
   - Cung c\u1EA5p t\u1EEB ${rule.minHashtags} \u0111\u1EBFn ${rule.maxHashtags} hashtags li\xEAn quan tr\u1EF1c ti\u1EBFp \u0111\u1EBFn video.
   - B\u1EAET BU\u1ED8C vi\u1EBFt li\u1EC1n kh\xF4ng d\u1EA5u (v\xED d\u1EE5: #kinhte8phut, #bantin, #shorts).
   ${rule.requiredHashtags ? `- B\u1EAFt bu\u1ED9c c\xF3 c\xE1c hashtag sau: ${rule.requiredHashtags.join(", ")}` : ""}
4. TAGS (Ch\u1EC9 d\xE0nh cho YouTube):
   ${platform === "youtube_long" || platform === "youtube_shorts" ? "- 10 \u0111\u1EBFn 15 tags t\u1EEB kh\xF3a d\u1EA1ng chu\u1ED7i ng\u1EAFn g\u1ECDn, t\u1ED5ng \u0111\u1ED9 d\xE0i c\xE1c tags c\u1ED9ng l\u1EA1i \u2264 500 k\xFD t\u1EF1." : "- \u0110\u1EC3 m\u1EA3ng r\u1ED7ng [] cho c\xE1c n\u1EC1n t\u1EA3ng kh\xE1c."}
5. ICON/EMOJI:
   - T\u1ED1i \u0111a 2 emoji trong to\xE0n b\u1ED9 b\xE0i vi\u1EBFt \u0111\u1EC3 gi\u1EEF \u0111\u1ED9 chuy\xEAn nghi\u1EC7p.

TR\u1EA2 V\u1EC0 K\u1EBET QU\u1EA2 \u0110\xDANG SCHEMA JSON.
`;
}

// server/services/ai-content/contentGenerationService.ts
function getGeminiClient3() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI3({ apiKey });
}
async function callGenAIWithRetry(ai, prompt, schema) {
  const models = [AI_CONFIG.MODELS.PRIMARY, AI_CONFIG.MODELS.FALLBACK, "gemini-2.5-flash", "gemini-2.0-flash"];
  let lastErr = null;
  for (const model of models) {
    try {
      return await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema
        }
      });
    } catch (e) {
      lastErr = e;
      console.warn(`[ContentGen] Model ${model} retry error: ${e?.message?.slice(0, 120)}`);
      await new Promise((r) => setTimeout(r, 1e3));
    }
  }
  throw lastErr;
}
var ContentGenerationService = class {
  /**
   * Generates tailored SEO content package for a single platform
   */
  async generateForPlatform(platform, facts, primaryKeyword, suggestedKeywords, keywordSourcesMap, tone, channelName, userContext) {
    const ai = getGeminiClient3();
    if (!ai) {
      throw new Error("GEMINI_API_KEY ch\u01B0a \u0111\u01B0\u1EE3c c\u1EA5u h\xECnh.");
    }
    const prompt = buildPromptForPlatform(
      platform,
      facts,
      primaryKeyword,
      suggestedKeywords,
      tone,
      channelName,
      userContext
    );
    const rule = PLATFORM_RULES[platform];
    const response = await callGenAIWithRetry(ai, prompt, {
      type: Type2.OBJECT,
      properties: {
        titles: {
          type: Type2.ARRAY,
          items: { type: Type2.STRING },
          description: "Ch\xEDnh x\xE1c 3 ph\u01B0\u01A1ng \xE1n ti\xEAu \u0111\u1EC1 kh\xE1c nhau chu\u1EA9n SEO v\xE0 \u0111\xFAng lu\u1EADt k\xFD t\u1EF1."
        },
        description: {
          type: Type2.STRING,
          description: "N\u1ED9i dung m\xF4 t\u1EA3 / caption ho\xE0n ch\u1EC9nh cho n\u1EC1n t\u1EA3ng."
        },
        hashtags: {
          type: Type2.ARRAY,
          items: { type: Type2.STRING },
          description: "Danh s\xE1ch hashtag vi\u1EBFt li\u1EC1n kh\xF4ng d\u1EA5u."
        },
        tags: {
          type: Type2.ARRAY,
          items: { type: Type2.STRING },
          description: "10-15 t\u1EEB kh\xF3a tags cho YouTube (ho\u1EB7c m\u1EA3ng r\u1ED7ng n\u1EBFu l\xE0 TikTok/FB/IG)."
        }
      },
      required: ["titles", "description", "hashtags"]
    });
    const parsed = JSON.parse(response.text || "{}");
    let titles = Array.isArray(parsed.titles) ? parsed.titles : [];
    if (titles.length === 0) {
      titles = [facts.main_topic, `${primaryKeyword} - ${facts.main_topic}`, `Kh\xE1m ph\xE1 ${facts.main_topic}`];
    }
    titles = titles.slice(0, 3).map((t) => t.trim().slice(0, rule.maxTitleLength));
    let description = (parsed.description || "").trim();
    let hashtags = Array.isArray(parsed.hashtags) ? parsed.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`).replace(/\s+/g, "")) : [];
    if (rule.requiredHashtags) {
      for (const req of rule.requiredHashtags) {
        if (!hashtags.includes(req)) {
          hashtags.push(req);
        }
      }
    }
    let tags = Array.isArray(parsed.tags) ? parsed.tags.map((t) => t.trim()) : [];
    if (platform === "youtube_long" || platform === "youtube_shorts") {
      if (tags.length === 0) {
        tags = [primaryKeyword, ...suggestedKeywords.slice(0, 10)];
      }
    } else {
      tags = [];
    }
    return {
      platform,
      titles,
      selectedTitleIndex: 0,
      description,
      hashtags,
      tags,
      primary_keyword: primaryKeyword,
      keyword_sources: keywordSourcesMap,
      match_score: 100,
      // will be verified by FactCheckService in Step 4
      match_details: []
    };
  }
};
var contentGenerationService = new ContentGenerationService();

// server/services/ai-content/factCheckService.ts
import { GoogleGenAI as GoogleGenAI4, Type as Type3 } from "@google/genai";
function getGeminiClient4() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI4({ apiKey });
}
var FactCheckService = class {
  /**
   * Verifies fact alignment between generated content and ground truth VideoFacts.
   * Auto-rewrites claims that fail verification (up to 2 iterations).
   */
  async verifyAndRepair(item, facts, iteration = 1) {
    const ai = getGeminiClient4();
    if (!ai) return item;
    console.log(`[FactCheck] Verifying ${item.platform} content (iteration ${iteration}/2)...`);
    const rule = PLATFORM_RULES[item.platform];
    const title = item.titles[item.selectedTitleIndex] || item.titles[0] || "";
    if (rule.maxTagsTotalLength && item.tags.length > 0) {
      let currentTagsLength = 0;
      const validTags = [];
      for (const t of item.tags) {
        if (currentTagsLength + t.length + 1 <= rule.maxTagsTotalLength) {
          validTags.push(t);
          currentTagsLength += t.length + 1;
        }
      }
      item.tags = validTags;
    }
    const verificationPrompt = `
B\u1EA0N L\xC0 CHUY\xCAN GIA KI\u1EC2M DUY\u1EC6T S\u1EF0 TH\u1EACT N\u1ED8I DUNG (FACT CHECKING & GROUND TRUTH AUDITOR).
Nhi\u1EC7m v\u1EE5: \u0110\u1ED1i chi\u1EBFu t\u1EEBng ph\xE1t bi\u1EC3u / c\xE2u kh\u1EB3ng \u0111\u1ECBnh trong TI\xCAU \u0110\u1EC0 v\xE0 M\xD4 T\u1EA2 v\u1EDBi S\u1EF0 TH\u1EACT VIDEO (VIDEO FACTS).

S\u1EF0 TH\u1EACT VIDEO (100% GROUND TRUTH):
- \u0110\u1ECBnh d\u1EA1ng: ${facts.video_type}
- Ch\u1EE7 \u0111\u1EC1: ${facts.main_topic}
- T\xF3m t\u1EAFt th\u1EF1c t\u1EBF: "${facts.summary}"
- Ch\u1EEF tr\xEAn m\xE0n h\xECnh: ${facts.on_screen_text.join(" | ") || "(Kh\xF4ng c\xF3)"}
- Th\u1EF1c th\u1EC3 / T\xEAn ri\xEAng: ${facts.entities.map((e) => e.name).join(", ") || "(Kh\xF4ng c\xF3)"}
- S\u1ED1 li\u1EC7u & s\u1EF1 ki\u1EC7n: ${facts.numbers_and_facts.map((n) => n.fact).join("; ") || "(Kh\xF4ng c\xF3)"}

N\u1ED8I DUNG C\u1EA6N \u0110\u1ED0I CHI\u1EBEU:
- Ti\xEAu \u0111\u1EC1: "${title}"
- M\xF4 t\u1EA3: "${item.description}"

QUY T\u1EAEC:
- M\u1ECDi c\xE2u kh\u1EB3ng \u0111\u1ECBnh v\u1EC1 s\u1ED1 li\u1EC7u, s\u1EF1 ki\u1EC7n, tri\u1EC3n l\xE3m, nh\xE2n v\u1EADt PH\u1EA2I c\xF3 c\u0103n c\u1EE9 t\u1EEB Video Facts.
- N\u1EBFu video l\xE0 "m\xE0n h\xECnh k\u1EBFt th\xFAc" ho\u1EB7c "intro" m\xE0 n\u1ED9i dung b\u1ECBa ra m\u1ED9t ch\u1EE7 \u0111\u1EC1 tin t\u1EE9c/tri\u1EC3n l\xE3m kh\xE1c -> supported: false.
- Li\u1EC7t k\xEA t\u1EEBng ph\xE1t bi\u1EC3u (claim), \u0111\xE1nh gi\xE1 supported: true/false, m\u1ED1c th\u1EDDi gian (n\u1EBFu c\xF3), v\xE0 l\xFD do.
`;
    try {
      const models = [AI_CONFIG.MODELS.PRIMARY, AI_CONFIG.MODELS.FALLBACK, "gemini-2.5-flash", "gemini-2.0-flash"];
      let response = null;
      for (const m of models) {
        try {
          response = await ai.models.generateContent({
            model: m,
            contents: verificationPrompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type3.OBJECT,
                properties: {
                  claims: {
                    type: Type3.ARRAY,
                    items: {
                      type: Type3.OBJECT,
                      properties: {
                        claim: { type: Type3.STRING },
                        supported: { type: Type3.BOOLEAN },
                        timestamp: { type: Type3.STRING },
                        reason: { type: Type3.STRING }
                      },
                      required: ["claim", "supported"]
                    },
                    description: "Danh s\xE1ch c\xE1c ph\xE1t bi\u1EC3u \u0111\u01B0\u1EE3c ki\u1EC3m tra \u0111\u1ED1i chi\u1EBFu v\u1EDBi video facts."
                  },
                  rewrite_needed: {
                    type: Type3.BOOLEAN,
                    description: "True n\u1EBFu c\xF3 ph\xE1t bi\u1EC3u b\u1ECB b\u1ECBa \u0111\u1EB7t ho\u1EB7c sai l\u1EC7ch c\u1EA7n vi\u1EBFt l\u1EA1i."
                  },
                  corrected_description: {
                    type: Type3.STRING,
                    description: "B\u1EA3n m\xF4 t\u1EA3 \u0111\xE3 \u0111\u01B0\u1EE3c s\u1EEDa s\u1EA1ch m\u1ECDi chi ti\u1EBFt b\u1ECBa \u0111\u1EB7t, b\xE1m 100% s\u1EF1 th\u1EADt video."
                  },
                  corrected_titles: {
                    type: Type3.ARRAY,
                    items: { type: Type3.STRING },
                    description: "3 ti\xEAu \u0111\u1EC1 \u0111\xE3 \u0111\u01B0\u1EE3c s\u1EEDa b\xE1m s\xE1t s\u1EF1 th\u1EADt."
                  }
                },
                required: ["claims", "rewrite_needed"]
              }
            }
          });
          break;
        } catch (e) {
          continue;
        }
      }
      const parsed = JSON.parse(response.text || "{}");
      const claims = Array.isArray(parsed.claims) ? parsed.claims : [];
      const supportedCount = claims.filter((c) => c.supported).length;
      const totalCount = claims.length || 1;
      const score = Math.round(supportedCount / totalCount * 100);
      item.match_details = claims;
      item.match_score = score;
      if ((score < 100 || parsed.rewrite_needed) && iteration < 2) {
        console.warn(`[FactCheck] Score is ${score}%. Auto-repairing with corrected text...`);
        if (parsed.corrected_description) {
          item.description = parsed.corrected_description.trim();
        }
        if (Array.isArray(parsed.corrected_titles) && parsed.corrected_titles.length > 0) {
          item.titles = parsed.corrected_titles.slice(0, 3);
        }
        return await this.verifyAndRepair(item, facts, iteration + 1);
      }
    } catch (err) {
      console.warn(`[FactCheck] Verification error (skipped gracefully):`, err);
    }
    return item;
  }
};
var factCheckService = new FactCheckService();

// api/handler.ts
async function handleRequest(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }
  let pathStr = (req.url || "").split("?")[0];
  if (Array.isArray(req.query?.path)) {
    pathStr = "/" + req.query.path.join("/");
  }
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
    }
  }
  body = body || {};
  try {
    if (pathStr.endsWith("/health") || pathStr === "/health" || pathStr === "/api/health") {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 200;
      res.end(JSON.stringify({ status: "ok", serverless: true, time: (/* @__PURE__ */ new Date()).toISOString() }));
      return;
    }
    if (pathStr.includes("create-upload-session")) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            success: false,
            error: "API_KEY_MISSING",
            message: "GEMINI_API_KEY ch\u01B0a \u0111\u01B0\u1EE3c c\u1EA5u h\xECnh trong Environment Variables c\u1EE7a Vercel."
          })
        );
        return;
      }
      const { fileName, fileSize, mimeType } = body;
      if (!fileSize) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            success: false,
            error: "INVALID_PARAMS",
            message: "Thi\u1EBFu th\xF4ng tin k\xEDch th\u01B0\u1EDBc video."
          })
        );
        return;
      }
      const cleanFileName = fileName || "video.mp4";
      const cleanMimeType = mimeType || "video/mp4";
      console.log(`[Serverless] Creating Gemini Resumable Upload session for ${cleanFileName} (${fileSize} bytes)...`);
      const initRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
        method: "POST",
        headers: {
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(fileSize),
          "X-Goog-Upload-Header-Content-Type": cleanMimeType,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          file: {
            display_name: cleanFileName
          }
        })
      });
      if (!initRes.ok) {
        const errText = await initRes.text();
        res.statusCode = initRes.status;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            success: false,
            error: "GEMINI_SESSION_FAILED",
            message: `Kh\xF4ng th\u1EC3 t\u1EA1o phi\xEAn t\u1EA3i l\xEAn Gemini (${initRes.status}): ${errText.slice(0, 100)}`
          })
        );
        return;
      }
      const uploadUrl = initRes.headers.get("x-goog-upload-url");
      if (!uploadUrl) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            success: false,
            error: "NO_UPLOAD_URL",
            message: "Kh\xF4ng nh\u1EADn \u0111\u01B0\u1EE3c \u0111\u01B0\u1EDDng d\u1EABn t\u1EA3i l\xEAn t\u1EEB Gemini."
          })
        );
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: true, uploadUrl }));
      return;
    }
    if (pathStr.includes("extract-facts")) {
      const { filePath, fileUri, fileName, originalName, mimeType } = body;
      if (!filePath && !fileUri) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            success: false,
            error: "NO_VIDEO_SOURCE",
            message: "Vui l\xF2ng cung c\u1EA5p file video ho\u1EB7c \u0111\u01B0\u1EDDng d\u1EABn t\u1EA3i l\xEAn h\u1EE3p l\u1EC7."
          })
        );
        return;
      }
      const displayName = originalName || fileName || "video.mp4";
      console.log(`[Serverless] Extracting video facts for ${displayName}...`);
      const facts = await geminiVideoFactsService.extractVideoFacts({
        filePath,
        fileUri,
        fileName,
        originalName: displayName,
        mimeType: mimeType || "video/mp4"
      });
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: true, videoFacts: facts }));
      return;
    }
    if (pathStr.includes("research-keywords")) {
      const { videoFacts, channelName, userKeyword } = body;
      if (!videoFacts) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ success: false, error: "NO_FACTS", message: "Thi\u1EBFu d\u1EEF li\u1EC7u Video Facts." }));
        return;
      }
      const keywordResult = await keywordResearchService.researchKeywords(videoFacts, channelName, userKeyword);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: true, keywordResearch: keywordResult }));
      return;
    }
    if (pathStr.includes("generate-seo-package")) {
      const {
        videoFacts,
        selectedPlatforms,
        keywordResearch,
        channelName,
        primaryKeyword,
        userContext,
        titleTone = "professional",
        includeTranscript = true
      } = body;
      if (!videoFacts || !Array.isArray(selectedPlatforms) || selectedPlatforms.length === 0) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            success: false,
            error: "INVALID_PARAMS",
            message: "Vui l\xF2ng cung c\u1EA5p Video Facts v\xE0 \xEDt nh\u1EA5t 1 n\u1EC1n t\u1EA3ng."
          })
        );
        return;
      }
      const effectivePrimaryKeyword = primaryKeyword?.trim() || keywordResearch?.scored_keywords?.[0]?.keyword || videoFacts.entities?.[0]?.name || videoFacts.main_topic || "video";
      const suggestedKeywords = (keywordResearch?.scored_keywords || []).map((k) => k.keyword).slice(0, 10);
      const keywordSourcesMap = {};
      if (keywordResearch?.scored_keywords) {
        for (const item of keywordResearch.scored_keywords) {
          keywordSourcesMap[item.keyword] = (item.sources || []).join(" + ");
        }
      }
      const platformResults = {};
      for (const platform of selectedPlatforms) {
        const generatedItem = await contentGenerationService.generateForPlatform(
          platform,
          videoFacts,
          effectivePrimaryKeyword,
          suggestedKeywords,
          keywordSourcesMap,
          titleTone,
          channelName,
          userContext
        );
        const verifiedItem = await factCheckService.verifyAndRepair(generatedItem, videoFacts);
        platformResults[platform] = verifiedItem;
      }
      const seoPackage = {
        videoFacts,
        platforms: platformResults,
        selectedPlatforms,
        keywordResearch: keywordResearch || {
          seed_keywords: [],
          youtube_suggestions: [],
          google_suggestions: [],
          trending_tags: [],
          scored_keywords: []
        },
        channelName,
        primaryKeyword: effectivePrimaryKeyword,
        userContext,
        titleTone,
        includeTranscript,
        generatedAt: Date.now()
      };
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: true, package: seoPackage }));
      return;
    }
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        success: false,
        error: "NOT_FOUND",
        message: `Endpoint kh\xF4ng t\u1ED3n t\u1EA1i: ${pathStr}`
      })
    );
  } catch (err) {
    console.error("[Serverless Error]:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        success: false,
        error: "SERVERLESS_INTERNAL_ERROR",
        message: err?.message || String(err),
        stack: err?.stack
      })
    );
  }
}

// api/index.ts
async function handler(req, res) {
  return handleRequest(req, res);
}
export {
  handler as default
};
