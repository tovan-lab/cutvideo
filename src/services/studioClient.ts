import type { PipelineId, StudioCatalog, StudioRun } from '../types/studio';

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Lỗi máy chủ (${res.status})`);
  return data;
}

export async function fetchCatalog(): Promise<StudioCatalog> {
  const res = await fetch('/api/studio/pipelines');
  if (res.status === 404) throw new Error('Máy chủ này chưa có Xưởng Nội Dung (cần chạy server.ts, không hỗ trợ bản Vercel).');
  return readJson(res);
}

export async function startRun(pipeline: PipelineId, input: string): Promise<string> {
  const res = await fetch('/api/studio/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pipeline, input }),
  });
  const data = await readJson(res);
  return data.runId;
}

/**
 * Theo dõi lượt chạy qua SSE. EventSource tự kết nối lại khi rớt mạng;
 * server gửi lại toàn bộ trạng thái nên không mất bước nào.
 */
export function subscribeRun(
  runId: string,
  onUpdate: (run: StudioRun) => void,
  onError: (message: string) => void
): () => void {
  const source = new EventSource(`/api/studio/runs/${runId}/events`);
  let finished = false;

  source.onmessage = (event) => {
    const run: StudioRun = JSON.parse(event.data);
    onUpdate(run);
    if (run.status !== 'running') {
      finished = true;
      source.close();
    }
  };
  source.onerror = () => {
    if (finished) return;
    // Server trả 404 (lượt chạy không còn) thì EventSource đóng hẳn.
    if (source.readyState === EventSource.CLOSED) {
      onError('Mất kết nối với lượt chạy (server có thể đã khởi động lại).');
    }
  };
  return () => source.close();
}
