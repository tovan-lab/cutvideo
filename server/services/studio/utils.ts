export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`Hết thời gian chờ (${Math.round(timeoutMs / 1000)}s): ${new URL(url).host}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const VN_TZ = 'Asia/Ho_Chi_Minh';

/** "Thứ Năm, 01/10/2026" theo giờ Việt Nam. */
export function vnDateLabel(date = new Date()): string {
  const text = new Intl.DateTimeFormat('vi-VN', {
    timeZone: VN_TZ,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "2026-10-01" theo giờ Việt Nam. */
export function vnIsoDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: VN_TZ }).format(date);
}

export function normalizeVi(str: string): string {
  return (str || '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tỷ lệ từ chung (Jaccard) giữa hai chủ đề, bỏ dấu tiếng Việt. */
export function topicSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeVi(a).split(' ').filter(Boolean));
  const tb = new Set(normalizeVi(b).split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  const shared = [...ta].filter((w) => tb.has(w)).length;
  return shared / new Set([...ta, ...tb]).size;
}

export function countWords(text: string): number {
  return (text.match(/[\p{L}\p{N}]+/gu) || []).length;
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}
