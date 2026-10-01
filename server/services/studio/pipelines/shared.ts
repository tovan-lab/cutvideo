import { hostOf } from '../utils';

export interface SourceRef {
  title: string;
  url: string;
}

/** Gộp nguồn trùng URL, giữ thứ tự xuất hiện. */
export function dedupeSources(sources: SourceRef[]): SourceRef[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    if (!s?.url || !/^https?:\/\//.test(s.url) || seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

export function sourcesMarkdown(sources: SourceRef[]): string {
  const list = dedupeSources(sources);
  if (!list.length) return '_Không có nguồn._';
  return list.map((s, i) => `${i + 1}. [${s.title || hostOf(s.url)}](${s.url}) — ${hostOf(s.url)}`).join('\n');
}

export function asArray<T = string>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
