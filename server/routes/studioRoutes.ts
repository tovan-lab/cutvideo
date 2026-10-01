import { Router, Request, Response } from 'express';
import { PIPELINES } from '../services/studio/pipelines';
import { studioRunManager } from '../services/studio/runManager';
import { hasTavily } from '../services/studio/tavily';
import { hasYouTube } from '../services/studio/youtube';
import { sheetsStatus } from '../services/studio/googleSheets';
import type { PipelineId } from '../services/studio/types';

export const studioRouter = Router();

const MAX_INPUT_LENGTH = 300;

/** Danh sách quy trình và tình trạng cấu hình các dịch vụ. */
studioRouter.get('/pipelines', (_req: Request, res: Response) => {
  const sheets = sheetsStatus();
  res.json({
    pipelines: Object.values(PIPELINES).map(({ run: _run, ...def }) => def),
    services: {
      gemini: { configured: Boolean(process.env.GEMINI_API_KEY), note: 'GEMINI_API_KEY' },
      tavily: { configured: hasTavily(), note: 'TAVILY_API_KEY' },
      youtube: { configured: hasYouTube(), note: 'YOUTUBE_API_KEY (thiếu thì dùng Tavily)' },
      sheets: { configured: sheets.configured, note: sheets.reason || 'Google Sheet' },
    },
  });
});

studioRouter.post('/runs', (req: Request, res: Response) => {
  const pipelineId = req.body?.pipeline as PipelineId;
  const def = PIPELINES[pipelineId];
  if (!def) return res.status(400).json({ error: 'Quy trình không hợp lệ' });

  const input = String(req.body?.input ?? '').trim().slice(0, MAX_INPUT_LENGTH);
  if (def.inputRequired && !input) return res.status(400).json({ error: `Vui lòng nhập ${def.inputLabel.toLowerCase()}` });
  if (!process.env.GEMINI_API_KEY) return res.status(400).json({ error: 'Thiếu GEMINI_API_KEY trong .env' });
  if (!hasTavily()) return res.status(400).json({ error: 'Thiếu TAVILY_API_KEY trong .env' });

  const run = studioRunManager.start(def, input);
  res.status(201).json({ runId: run.id });
});

/** Server-Sent Events: gửi toàn bộ trạng thái lượt chạy mỗi khi có thay đổi. */
studioRouter.get('/runs/:id/events', (req: Request, res: Response) => {
  if (!studioRunManager.stream(req.params.id, res)) {
    res.status(404).json({ error: 'Không tìm thấy lượt chạy (server có thể đã khởi động lại)' });
  }
});

studioRouter.get('/runs/:id', (req: Request, res: Response) => {
  const run = studioRunManager.get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Không tìm thấy lượt chạy' });
  res.json(run);
});
