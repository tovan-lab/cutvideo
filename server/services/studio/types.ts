// Kiểu dữ liệu dùng chung cho "Xưởng Nội Dung". Bản sao phía client: src/types/studio.ts

export type PipelineId = 'topic' | 'news' | 'marketing';

export type StepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';

export interface StepDefinition {
  id: string;
  label: string;
  /** Các bước cùng group chạy song song và được vẽ thành một cụm trong cảnh 3D. */
  group?: string;
}

export interface StudioStep extends StepDefinition {
  status: StepStatus;
  detail?: string;
  startedAt?: number;
  endedAt?: number;
}

export interface StudioLog {
  ts: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface CopyBlock {
  label: string;
  text: string;
}

export interface StudioResult {
  title: string;
  markdown: string;
  copyBlocks: CopyBlock[];
  warnings: string[];
  wordCount: number;
}

export interface StudioRun {
  id: string;
  pipeline: PipelineId;
  input: string;
  status: 'running' | 'success' | 'error';
  steps: StudioStep[];
  logs: StudioLog[];
  result?: StudioResult;
  error?: string;
  startedAt: number;
  endedAt?: number;
}

export interface StepHandle {
  /** Ghi mô tả ngắn hiển thị dưới tên bước. */
  detail(text: string): void;
  /** Đánh dấu bước là "bỏ qua" (không phải lỗi) khi hàm kết thúc. */
  skip(reason: string): void;
}

export interface PipelineContext {
  step<T>(id: string, fn: (h: StepHandle) => Promise<T>): Promise<T>;
  log(message: string, level?: StudioLog['level']): void;
}

export interface PipelineDefinition {
  id: PipelineId;
  name: string;
  description: string;
  inputLabel: string;
  inputPlaceholder: string;
  inputRequired: boolean;
  steps: StepDefinition[];
  run(input: string, ctx: PipelineContext): Promise<StudioResult>;
}
