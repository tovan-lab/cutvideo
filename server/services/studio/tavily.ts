import { fetchWithTimeout } from './utils';

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  published_date?: string;
  score?: number;
}

export interface TavilyResponse {
  answer?: string;
  results: TavilyResult[];
}

export interface TavilySearchParams {
  query: string;
  topic?: 'general' | 'news' | 'finance';
  time_range?: 'day' | 'week' | 'month' | 'year';
  max_results?: number;
  include_domains?: string[];
  search_depth?: 'basic' | 'advanced';
  include_answer?: boolean | 'basic' | 'advanced';
}

export function hasTavily(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

export async function tavilySearch(params: TavilySearchParams): Promise<TavilyResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error('Thiếu TAVILY_API_KEY trong .env');

  const res = await fetchWithTimeout('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ search_depth: 'advanced', max_results: 8, ...params }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Tavily lỗi ${res.status}: ${body.slice(0, 160)}`);
  }
  const data = await res.json();
  return { answer: data.answer, results: Array.isArray(data.results) ? data.results : [] };
}

/** Định dạng kết quả để đưa vào prompt, cắt bớt nội dung dài. */
export function formatResults(results: TavilyResult[], maxContent = 700): string {
  if (!results.length) return '(không có kết quả)';
  return results
    .map(
      (r, i) =>
        `[${i + 1}] ${r.title}\nURL: ${r.url}\nNgày: ${r.published_date || 'không rõ'}\nNội dung: ${(r.content || '').slice(0, maxContent)}`
    )
    .join('\n---\n');
}
