// Bản sao phía client của server/services/studio/types.ts

export type AppTab = 'video' | 'ai' | 'studio';

export type PipelineId = 'topic' | 'news' | 'marketing';

export type StepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';

export interface StepDefinition {
  id: string;
  label: string;
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

export interface PipelineInfo {
  id: PipelineId;
  name: string;
  description: string;
  inputLabel: string;
  inputPlaceholder: string;
  inputRequired: boolean;
  steps: StepDefinition[];
}

export interface ServiceStatus {
  configured: boolean;
  note: string;
}

export interface StudioCatalog {
  pipelines: PipelineInfo[];
  services: Record<'gemini' | 'tavily' | 'youtube' | 'sheets', ServiceStatus>;
}
