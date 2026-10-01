import React, { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Circle, CircleSlash, Loader2, XCircle } from 'lucide-react';
import type { StepStatus, StudioLog, StudioStep } from '../../types/studio';

const ICON: Record<StepStatus, React.ReactNode> = {
  pending: <Circle className="w-4 h-4 text-slate-600" />,
  running: <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />,
  done: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
  skipped: <CircleSlash className="w-4 h-4 text-slate-500" />,
  error: <XCircle className="w-4 h-4 text-rose-400" />,
};

function duration(step: StudioStep, now: number): string {
  if (!step.startedAt) return '';
  const secs = ((step.endedAt ?? now) - step.startedAt) / 1000;
  return `${secs.toFixed(secs < 10 ? 1 : 0)}s`;
}

interface StepTimelineProps {
  steps: StudioStep[];
  logs: StudioLog[];
  now: number;
  onSelect?: (id: string) => void;
}

export const StepTimeline: React.FC<StepTimelineProps> = ({ steps, logs, now, onSelect }) => {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  let lastGroup: string | undefined;

  return (
    <div className="flex flex-col h-full min-h-0 gap-3">
      <ol className="space-y-1">
        {steps.map((step, index) => {
          const showGroup = step.group && step.group !== lastGroup;
          lastGroup = step.group;
          return (
            <React.Fragment key={step.id}>
              {showGroup && (
                <li className="pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Chạy song song
                </li>
              )}
              <li
                onClick={onSelect ? () => onSelect(step.id) : undefined}
                className={`flex items-start gap-2.5 rounded-xl px-2.5 py-2 transition-colors ${
                  step.status === 'running' ? 'bg-sky-950/50 border border-sky-500/40' : 'border border-transparent'
                } ${step.group ? 'ml-3' : ''} ${onSelect ? 'cursor-pointer hover:bg-white/5' : ''}`}
              >
                <span className="mt-0.5 shrink-0">{ICON[step.status]}</span>
                <span className="mt-0.5 w-4 shrink-0 text-[10px] font-bold tabular-nums text-slate-500">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-xs font-semibold ${
                        step.status === 'pending' || step.status === 'skipped' ? 'text-slate-400' : 'text-slate-100'
                      }`}
                    >
                      {step.label}
                    </span>
                    <span className="text-[10px] tabular-nums text-slate-500">{duration(step, now)}</span>
                  </div>
                  {step.detail && step.status !== 'pending' && (
                    <p
                      className={`text-[11px] leading-snug mt-0.5 break-words ${
                        step.status === 'error' ? 'text-rose-300' : 'text-slate-400'
                      }`}
                    >
                      {step.detail}
                    </p>
                  )}
                </div>
              </li>
            </React.Fragment>
          );
        })}
      </ol>

      <div className="flex-1 min-h-[120px] flex flex-col rounded-xl border border-white/5 bg-black/30 overflow-hidden">
        <div className="px-3 py-1.5 border-b border-white/5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Nhật ký trực tiếp
        </div>
        <div ref={logRef} className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[10.5px] leading-relaxed space-y-0.5 max-h-44">
          {logs.length === 0 && <p className="text-slate-600">Chưa có hoạt động.</p>}
          {logs.map((log, i) => (
            <p
              key={i}
              className={
                log.level === 'error' ? 'text-rose-300' : log.level === 'warn' ? 'text-amber-300' : 'text-slate-400'
              }
            >
              <span className="text-slate-600">
                {new Date(log.ts).toLocaleTimeString('vi-VN', { hour12: false })}{' '}
              </span>
              {log.level === 'warn' && <AlertTriangle className="inline w-3 h-3 mr-1 -mt-0.5" />}
              {log.message}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
};
