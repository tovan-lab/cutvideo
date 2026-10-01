import type { Response } from 'express';
import { randomUUID } from 'crypto';
import type { PipelineDefinition, StepHandle, StudioLog, StudioRun } from './types';

const MAX_RUNS_KEPT = 20;
const MAX_LOGS = 200;

type Listener = (run: StudioRun) => void;

/**
 * Giữ trạng thái các lượt chạy trong RAM và phát trạng thái mới cho trình duyệt qua SSE
 * mỗi khi một bước đổi trạng thái. Mất khi server khởi động lại.
 */
class StudioRunManager {
  private runs = new Map<string, StudioRun>();
  private listeners = new Map<string, Set<Listener>>();

  get(id: string): StudioRun | undefined {
    return this.runs.get(id);
  }

  start(def: PipelineDefinition, input: string): StudioRun {
    const run: StudioRun = {
      id: randomUUID(),
      pipeline: def.id,
      input,
      status: 'running',
      steps: def.steps.map((s) => ({ ...s, status: 'pending' })),
      logs: [],
      startedAt: Date.now(),
    };
    this.runs.set(run.id, run);
    this.prune();

    const log = (message: string, level: StudioLog['level'] = 'info') => {
      run.logs.push({ ts: Date.now(), level, message });
      if (run.logs.length > MAX_LOGS) run.logs.splice(0, run.logs.length - MAX_LOGS);
      this.emit(run);
    };

    const step = async <T>(id: string, fn: (h: StepHandle) => Promise<T>): Promise<T> => {
      const s = run.steps.find((x) => x.id === id);
      if (!s) throw new Error(`Bước không tồn tại: ${id}`);
      let skipReason: string | null = null;
      s.status = 'running';
      s.startedAt = Date.now();
      log(`▶ ${s.label}`);
      const handle: StepHandle = {
        detail: (text) => {
          s.detail = text;
          this.emit(run);
        },
        skip: (reason) => {
          skipReason = reason;
        },
      };
      try {
        const value = await fn(handle);
        s.status = skipReason ? 'skipped' : 'done';
        if (skipReason) s.detail = skipReason;
        s.endedAt = Date.now();
        const secs = ((s.endedAt - s.startedAt!) / 1000).toFixed(1);
        log(skipReason ? `⤼ ${s.label}: ${skipReason}` : `✓ ${s.label} (${secs}s)`, skipReason ? 'warn' : 'info');
        return value;
      } catch (err: any) {
        s.status = 'error';
        s.detail = err?.message || String(err);
        s.endedAt = Date.now();
        log(`✗ ${s.label}: ${s.detail}`, 'error');
        throw err;
      }
    };

    def
      .run(input, { step, log })
      .then((result) => {
        run.result = result;
        run.status = 'success';
      })
      .catch((err: any) => {
        run.status = 'error';
        run.error = err?.message || String(err);
      })
      .finally(() => {
        // Bước chưa chạy tới khi quy trình dừng giữa chừng thì coi như bỏ qua.
        for (const s of run.steps) if (s.status === 'pending' || s.status === 'running') s.status = 'skipped';
        run.endedAt = Date.now();
        this.emit(run);
      });

    return run;
  }

  /** Gắn một kết nối SSE; gửi ngay trạng thái hiện tại rồi các cập nhật sau đó. */
  stream(id: string, res: Response): boolean {
    const run = this.runs.get(id);
    if (!run) return false;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send: Listener = (r) => res.write(`data: ${JSON.stringify(r)}\n\n`);
    send(run);
    if (run.status !== 'running') {
      res.end();
      return true;
    }

    const set = this.listeners.get(id) ?? new Set<Listener>();
    set.add(send);
    this.listeners.set(id, set);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
    res.on('close', () => {
      clearInterval(heartbeat);
      set.delete(send);
    });
    return true;
  }

  private emit(run: StudioRun) {
    const set = this.listeners.get(run.id);
    if (!set) return;
    for (const listener of set) listener(run);
    if (run.status !== 'running' && run.endedAt) {
      this.listeners.delete(run.id);
    }
  }

  private prune() {
    if (this.runs.size <= MAX_RUNS_KEPT) return;
    const finished = [...this.runs.values()]
      .filter((r) => r.status !== 'running')
      .sort((a, b) => a.startedAt - b.startedAt);
    for (const r of finished.slice(0, this.runs.size - MAX_RUNS_KEPT)) this.runs.delete(r.id);
  }
}

export const studioRunManager = new StudioRunManager();
