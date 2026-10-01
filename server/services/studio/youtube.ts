import { fetchWithTimeout } from './utils';

export interface YouTubeVideo {
  id: string;
  title: string;
  channel: string;
  publishedAt: string;
  description: string;
  views: number;
  likes: number;
  comments: number;
  url: string;
}

export function hasYouTube(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY);
}

async function ytGet(path: string, params: Record<string, string>): Promise<any> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('Thiếu YOUTUBE_API_KEY trong .env');
  const qs = new URLSearchParams({ ...params, key });
  const res = await fetchWithTimeout(`https://www.googleapis.com/youtube/v3/${path}?${qs}`, {}, 20000);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`YouTube API lỗi ${res.status}: ${data?.error?.message || ''}`.trim());
  return data;
}

/** Video đăng trong `hours` giờ gần nhất, sắp theo lượt xem, kèm thống kê. */
export async function searchRecentVideos(query: string, hours: number, maxResults = 15): Promise<YouTubeVideo[]> {
  const search = await ytGet('search', {
    part: 'snippet',
    q: query,
    type: 'video',
    order: 'viewCount',
    regionCode: 'VN',
    relevanceLanguage: 'vi',
    publishedAfter: new Date(Date.now() - hours * 3600 * 1000).toISOString(),
    maxResults: String(maxResults),
  });
  const ids: string[] = (search.items || []).map((i: any) => i.id?.videoId).filter(Boolean);
  if (!ids.length) return [];

  const details = await ytGet('videos', { part: 'snippet,statistics', id: ids.join(',') });
  return (details.items || [])
    .map((v: any) => ({
      id: v.id,
      title: v.snippet?.title || '',
      channel: v.snippet?.channelTitle || '',
      publishedAt: v.snippet?.publishedAt || '',
      description: (v.snippet?.description || '').slice(0, 400),
      views: Number(v.statistics?.viewCount || 0),
      likes: Number(v.statistics?.likeCount || 0),
      comments: Number(v.statistics?.commentCount || 0),
      url: `https://www.youtube.com/watch?v=${v.id}`,
    }))
    .sort((a: YouTubeVideo, b: YouTubeVideo) => b.views - a.views);
}
