import { GoogleGenAI } from '@google/genai';
import { AI_CONFIG } from '../../config/aiConfig';

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Thiếu GEMINI_API_KEY trong .env');
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
}

// Thứ tự thử model. Khi Google quá tải, các model khác nhau thường có tải khác nhau.
const MODEL_CHAIN = [AI_CONFIG.MODELS.PRIMARY, 'gemini-3.7-flash', 'gemini-3.6-flash', AI_CONFIG.MODELS.FALLBACK].filter(
  (m, i, all) => all.indexOf(m) === i
);
const RETRY_DELAYS_MS = [2000, 5000];
const OVERLOAD_COOLDOWN_MS = 60000;
const DAILY_QUOTA_COOLDOWN_MS = 60 * 60000;
const MAX_CONCURRENT = 2;

/** Model vừa báo quá tải → tạm đẩy xuống cuối danh sách tới thời điểm này. */
const cooldownUntil = new Map<string, number>();

// Giới hạn số lời gọi đồng thời để 4 agent chạy song song không dồn Gemini cùng lúc.
let active = 0;
const waiting: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

interface GenerateOptions {
  temperature?: number;
  maxOutputTokens?: number;
  json?: boolean;
}

function errorCode(err: any): number | undefined {
  const status = Number(err?.status || err?.code);
  if (status) return status;
  const match = String(err?.message || '').match(/"code"\s*:\s*(\d{3})/);
  return match ? Number(match[1]) : undefined;
}

function isOverload(err: any): boolean {
  const code = errorCode(err);
  return code === 429 || code === 503 || /RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|high demand/i.test(String(err?.message));
}

/** Hết hạn mức theo ngày (gói miễn phí: ~20 lượt/ngày/model) — thử lại trong ngày là vô ích. */
function isDailyQuota(err: any): boolean {
  return errorCode(err) === 429 && /PerDay/i.test(String(err?.message));
}

function friendly(err: any): string {
  const code = errorCode(err);
  if (isDailyQuota(err)) return 'hết lượt miễn phí trong ngày (429)';
  if (code === 503) return 'quá tải (503)';
  if (code === 429) return 'vượt hạn mức (429)';
  if (code === 404) return 'model không còn tồn tại (404)';
  if (code === 400) return 'yêu cầu không hợp lệ (400)';
  return String(err?.message || err).slice(0, 120);
}

function orderedModels(): string[] {
  const now = Date.now();
  const ready = MODEL_CHAIN.filter((m) => (cooldownUntil.get(m) ?? 0) <= now);
  const cooling = MODEL_CHAIN.filter((m) => (cooldownUntil.get(m) ?? 0) > now);
  return [...ready, ...cooling];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms + Math.random() * 500));

/** Gọi Gemini: thử lại có giãn cách, đổi model khi quá tải, báo lỗi dễ hiểu. */
export async function generateText(prompt: string, opts: GenerateOptions = {}): Promise<string> {
  const ai = getClient();
  const failures: string[] = [];

  return withSlot(async () => {
    for (const model of orderedModels()) {
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              temperature: opts.temperature ?? 0.4,
              maxOutputTokens: opts.maxOutputTokens ?? 8192,
              ...(opts.json ? { responseMimeType: 'application/json' } : {}),
            },
          });
          const text = response.text?.trim();
          if (!text) throw new Error('trả về nội dung rỗng');
          cooldownUntil.delete(model);
          return text;
        } catch (err) {
          if (isDailyQuota(err)) {
            cooldownUntil.set(model, Date.now() + DAILY_QUOTA_COOLDOWN_MS);
            failures.push(`${model}: ${friendly(err)}`);
            break;
          }
          if (!isOverload(err)) {
            failures.push(`${model}: ${friendly(err)}`);
            break;
          }
          if (attempt < RETRY_DELAYS_MS.length) {
            await sleep(RETRY_DELAYS_MS[attempt]);
            continue;
          }
          cooldownUntil.set(model, Date.now() + OVERLOAD_COOLDOWN_MS);
          failures.push(`${model}: ${friendly(err)}`);
        }
      }
    }
    throw new Error(`Gemini không phản hồi sau khi thử ${failures.length} model — ${failures.join('; ')}. Thử lại sau ít phút.`);
  });
}

export async function generateJson<T>(prompt: string, opts: Omit<GenerateOptions, 'json'> = {}): Promise<T> {
  const text = await generateText(prompt, { ...opts, json: true });
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch (err: any) {
    throw new Error(`Gemini trả JSON không hợp lệ: ${err.message}`);
  }
}
