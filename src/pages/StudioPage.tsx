import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  Crosshair,
  FileText,
  ListChecks,
  Loader2,
  Megaphone,
  Newspaper,
  Orbit,
  Play,
  RotateCcw,
  ScrollText,
  Sparkles,
  XCircle,
} from 'lucide-react';
import type { PipelineId, PipelineInfo, StudioCatalog, StudioRun, StudioStep } from '../types/studio';
import { fetchCatalog, startRun, subscribeRun } from '../services/studioClient';
import { SolarSystemScene, SolarSystemHandle } from '../components/studio/SolarSystemScene';
import { StepTimeline } from '../components/studio/StepTimeline';
import { ResultPanel } from '../components/studio/ResultPanel';
import { Popup } from '../components/studio/Popup';

interface StudioPageProps {
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info', description?: string) => void;
  onJumpToVideo: () => void;
}

const PIPELINE_ICON: Record<PipelineId, React.ReactNode> = {
  topic: <ScrollText className="w-4 h-4" />,
  news: <Newspaper className="w-4 h-4" />,
  marketing: <Megaphone className="w-4 h-4" />,
};

const SERVICE_LABEL: Record<string, string> = {
  gemini: 'Gemini',
  tavily: 'Tavily',
  youtube: 'YouTube',
  sheets: 'Sheet',
};

const STATUS_TEXT: Record<StudioStep['status'], string> = {
  pending: 'Đang chờ',
  running: 'Đang xử lý',
  done: 'Hoàn thành',
  skipped: 'Bỏ qua',
  error: 'Lỗi',
};

const STATUS_PILL: Record<StudioStep['status'], string> = {
  pending: 'bg-slate-800 text-slate-300',
  running: 'bg-sky-500/20 text-sky-300 border border-sky-400/40',
  done: 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/30',
  skipped: 'bg-slate-800 text-slate-400',
  error: 'bg-rose-500/15 text-rose-300 border border-rose-400/40',
};

const STORAGE_KEY = 'studio.lastRun';
const DEMO_ID = 'demo';

type PopupState = { type: 'result' } | { type: 'error' } | { type: 'step'; id: string } | null;

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Bộ nhớ trình duyệt bị chặn: chỉ mất khả năng mở lại lượt chạy sau khi tải lại trang.
  }
}

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const glass = 'bg-slate-950/55 backdrop-blur-xl border border-white/10 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]';

export const StudioPage: React.FC<StudioPageProps> = ({ onShowToast, onJumpToVideo }) => {
  const [catalog, setCatalog] = useState<StudioCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PipelineId>(() => (storageGet('studio.pipeline') as PipelineId) || 'topic');
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [run, setRun] = useState<StudioRun | null>(null);
  const [starting, setStarting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [popup, setPopup] = useState<PopupState>(null);
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth >= 1024);
  const sceneRef = useRef<SolarSystemHandle>(null);
  const demoTimers = useRef<number[]>([]);

  const isRunning = run?.status === 'running';
  const isDemo = run?.id === DEMO_ID;

  const clearDemo = () => {
    demoTimers.current.forEach((t) => clearTimeout(t));
    demoTimers.current = [];
  };
  useEffect(() => clearDemo, []);

  useEffect(() => {
    fetchCatalog()
      .then(setCatalog)
      .catch((err) => setCatalogError(err.message));
  }, []);

  // Mở lại lượt chạy gần nhất sau khi tải lại trang.
  useEffect(() => {
    const lastId = storageGet(STORAGE_KEY);
    if (!lastId) return;
    return subscribeRun(
      lastId,
      (r) => {
        setRun(r);
        setSelected(r.pipeline);
      },
      () => storageSet(STORAGE_KEY, null)
    );
  }, []);

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [isRunning]);

  useEffect(() => storageSet('studio.pipeline', selected), [selected]);

  const pipeline: PipelineInfo | undefined = catalog?.pipelines.find((p) => p.id === selected);
  const input = inputs[selected] ?? '';
  const shownRun = run && run.pipeline === selected ? run : null;

  const sceneSteps: StudioStep[] = useMemo(() => {
    if (shownRun) return shownRun.steps;
    return (pipeline?.steps || []).map((s) => ({ ...s, status: 'pending' as const }));
  }, [shownRun, pipeline]);

  const doneCount = sceneSteps.filter((s) => s.status === 'done' || s.status === 'skipped').length;
  const progress = sceneSteps.length ? doneCount / sceneSteps.length : 0;
  const selectedStep = popup?.type === 'step' ? sceneSteps.find((s) => s.id === popup.id) : undefined;

  const closePopup = useCallback(() => setPopup(null), []);
  const selectStep = useCallback((id: string) => setPopup({ type: 'step', id }), []);

  const handleStart = async () => {
    if (!pipeline || isRunning) return;
    if (pipeline.inputRequired && !input.trim()) {
      onShowToast(`Vui lòng nhập ${pipeline.inputLabel.toLowerCase()}`, 'error');
      return;
    }
    clearDemo();
    setStarting(true);
    setPopup(null);
    try {
      const runId = await startRun(pipeline.id, input.trim());
      storageSet(STORAGE_KEY, runId);
      setNow(Date.now());
      subscribeRun(
        runId,
        (r) => {
          setRun(r);
          if (r.status === 'success') {
            onShowToast('Quy trình hoàn tất', 'success', r.result?.title);
            setPopup({ type: 'result' });
          }
          if (r.status === 'error') onShowToast('Quy trình dừng vì lỗi', 'error', r.error);
        },
        (message) => onShowToast(message, 'error')
      );
    } catch (err: any) {
      onShowToast(err.message || 'Không khởi chạy được quy trình', 'error');
    } finally {
      setStarting(false);
    }
  };

  /** Mô phỏng tiến trình ngay trên trình duyệt (không gọi AI, không tốn credit) để xem hiệu ứng. */
  const startDemo = () => {
    if (!pipeline || isRunning) return;
    clearDemo();
    setPopup(null);
    const levels: number[][] = [];
    pipeline.steps.forEach((s, i) => {
      if (s.group && pipeline.steps[i - 1]?.group === s.group) levels[levels.length - 1].push(i);
      else levels.push([i]);
    });
    const startedAt = Date.now();
    setNow(startedAt);
    setRun({
      id: DEMO_ID,
      pipeline: pipeline.id,
      input: '',
      status: 'running',
      steps: pipeline.steps.map((s) => ({ ...s, status: 'pending' })),
      logs: [{ ts: startedAt, level: 'info', message: 'Bắt đầu mô phỏng — không gọi AI, không tốn credit' }],
      startedAt,
    });
    const patch = (idx: number, change: Partial<StudioStep>, message: string) =>
      setRun((prev) =>
        prev && prev.id === DEMO_ID
          ? {
              ...prev,
              steps: prev.steps.map((s, i) => (i === idx ? { ...s, ...change } : s)),
              logs: [...prev.logs, { ts: Date.now(), level: 'info', message }],
            }
          : prev
      );
    let at = 600;
    levels.forEach((members) => {
      const durations = members.map(() => 1800 + Math.random() * 2600);
      const levelStart = at;
      members.forEach((idx, j) => {
        const label = pipeline.steps[idx].label;
        demoTimers.current.push(
          window.setTimeout(() => patch(idx, { status: 'running', startedAt: Date.now(), detail: 'Đang mô phỏng…' }, `▶ ${label}`), levelStart),
          window.setTimeout(
            () => patch(idx, { status: 'done', endedAt: Date.now(), detail: 'Xong (mô phỏng)' }, `✓ ${label}`),
            levelStart + durations[j]
          )
        );
      });
      at = levelStart + Math.max(...durations) + 500;
    });
    demoTimers.current.push(
      window.setTimeout(() => {
        setRun((prev) => (prev && prev.id === DEMO_ID ? { ...prev, status: 'success', endedAt: Date.now() } : prev));
        onShowToast('Mô phỏng hoàn tất', 'info', 'Bấm Khởi chạy để chạy quy trình thật');
      }, at)
    );
  };

  const handleReset = () => {
    clearDemo();
    setRun(null);
    setPopup(null);
    storageSet(STORAGE_KEY, null);
  };

  const stepLogs = selectedStep
    ? (shownRun?.logs || []).filter((l) => l.message.includes(selectedStep.label))
    : [];

  return (
    <>
      {/* Hệ mặt trời phủ toàn trang */}
      <div className="fixed inset-0 z-[5] bg-[radial-gradient(ellipse_at_50%_40%,#0b1640_0%,#050a1f_45%,#01030c_100%)]">
        <SolarSystemScene ref={sceneRef} steps={sceneSteps} onSelectStep={selectStep} className="w-full h-full" />
      </div>

      {/* HUD */}
      <div className="pointer-events-none fixed inset-x-0 top-12 sm:top-14 bottom-[60px] md:bottom-0 z-30 p-3 sm:p-5">
        {/* Góc trái: tên + tiến độ + dịch vụ */}
        <div className={`pointer-events-auto absolute left-3 sm:left-5 top-3 sm:top-5 w-[calc(100%-1.5rem)] md:w-[300px] rounded-2xl p-3.5 ${glass}`}>
          <div className="flex items-center gap-2">
            <Orbit className="w-4 h-4 text-sky-300" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white">Xưởng Nội Dung</span>
            <button
              type="button"
              onClick={() => sceneRef.current?.resetView()}
              title="Căn giữa hệ mặt trời"
              className="ml-auto w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10"
            >
              <Crosshair className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-slate-100 truncate">
              {pipeline?.name ?? 'Đang tải…'}
              {isDemo && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">mô phỏng</span>}
            </span>
            <span className="text-[11px] tabular-nums text-slate-400 shrink-0">
              {doneCount}/{sceneSteps.length}
              {shownRun && ` · ${formatElapsed((shownRun.endedAt ?? now) - shownRun.startedAt)}`}
            </span>
          </div>
          <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                shownRun?.status === 'error' ? 'bg-rose-500' : 'bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-400'
              }`}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          {catalog && (
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
              {Object.entries(catalog.services).map(([key, s]) => (
                <span key={key} title={s.note} className="inline-flex items-center gap-1.5 text-[10px] text-slate-400">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      s.configured ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]' : 'bg-slate-600'
                    }`}
                  />
                  {SERVICE_LABEL[key] ?? key}
                </span>
              ))}
            </div>
          )}
          {catalogError && <p className="mt-2 text-[11px] text-rose-300">{catalogError}</p>}
          {pipeline && !isRunning && (
            <button
              type="button"
              onClick={startDemo}
              title="Xem hiệu ứng quy trình mà không gọi AI, không tốn credit"
              className="mt-3 w-full inline-flex items-center justify-center gap-1.5 py-1.5 rounded-xl border border-white/10 text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-white/5"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" /> Xem mô phỏng hiệu ứng
            </button>
          )}
        </div>

        {/* Bên phải: tiến trình (thu gọn được) */}
        <div className="pointer-events-auto absolute right-3 sm:right-5 top-[150px] md:top-5 w-[calc(100%-1.5rem)] md:w-[340px]">
          <div className={`rounded-2xl overflow-hidden ${glass}`}>
            <button
              type="button"
              onClick={() => setPanelOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left hover:bg-white/5"
            >
              <ListChecks className="w-4 h-4 text-sky-300" />
              <span className="text-xs font-bold text-white">Tiến trình</span>
              <span className="text-[11px] tabular-nums text-slate-400">
                {doneCount}/{sceneSteps.length}
              </span>
              {isRunning && <Loader2 className="w-3.5 h-3.5 text-sky-300 animate-spin" />}
              <ChevronDown className={`ml-auto w-4 h-4 text-slate-400 transition-transform ${panelOpen ? 'rotate-180' : ''}`} />
            </button>
            {panelOpen && (
              <div className="px-2.5 pb-3 max-h-[calc(100vh-15rem)] overflow-y-auto border-t border-white/5 pt-2">
                <StepTimeline steps={sceneSteps} logs={shownRun?.logs || []} now={now} onSelect={selectStep} />
              </div>
            )}
          </div>
        </div>

        {/* Dưới cùng: chọn quy trình + nhập + chạy */}
        {catalog && pipeline && (
          <div className="pointer-events-auto absolute left-1/2 -translate-x-1/2 bottom-3 sm:bottom-6 w-[min(760px,calc(100%-1.5rem))]">
            {shownRun?.status === 'error' && (
              <button
                type="button"
                onClick={() => setPopup({ type: 'error' })}
                className="mb-2 w-full flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-950/70 border border-rose-500/40 backdrop-blur-xl text-left text-xs text-rose-200 hover:bg-rose-900/60"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="truncate">Quy trình dừng: {shownRun.error}</span>
                <span className="ml-auto shrink-0 font-semibold underline underline-offset-2">Chi tiết</span>
              </button>
            )}
            <div className={`rounded-3xl p-2 ${glass}`}>
              <div className="flex gap-1 p-1 rounded-2xl bg-black/30">
                {catalog.pipelines.map((p) => {
                  const active = p.id === selected;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      title={p.description}
                      disabled={isRunning && !active}
                      onClick={() => setSelected(p.id)}
                      className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-[11px] sm:text-xs font-semibold transition-all disabled:opacity-35 disabled:cursor-not-allowed ${
                        active
                          ? 'bg-gradient-to-r from-sky-500/90 to-indigo-500/90 text-white shadow-[0_0_20px_rgba(56,189,248,0.35)]'
                          : 'text-slate-300 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {PIPELINE_ICON[p.id]}
                      <span className="truncate">{p.name}</span>
                    </button>
                  );
                })}
              </div>
              <form
                className="mt-2 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleStart();
                }}
              >
                <label className="sr-only" htmlFor="studio-input">
                  {pipeline.inputLabel}
                </label>
                <input
                  id="studio-input"
                  value={input}
                  disabled={isRunning}
                  maxLength={300}
                  onChange={(e) => setInputs((prev) => ({ ...prev, [selected]: e.target.value }))}
                  placeholder={`${pipeline.inputLabel} — ${pipeline.inputPlaceholder}`}
                  className="flex-1 min-w-0 rounded-2xl bg-white/5 border border-white/10 focus:border-sky-400/70 focus:ring-2 focus:ring-sky-400/20 outline-none px-4 py-2.5 text-sm text-white placeholder:text-slate-500 disabled:opacity-60"
                />
                {shownRun?.result && (
                  <button
                    type="button"
                    onClick={() => setPopup({ type: 'result' })}
                    title="Xem kết quả"
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 text-emerald-200 text-xs font-semibold hover:bg-emerald-500/20"
                  >
                    <FileText className="w-4 h-4" />
                    <span className="hidden sm:inline">Kết quả</span>
                  </button>
                )}
                {shownRun && !isRunning && (
                  <button
                    type="button"
                    onClick={handleReset}
                    title="Xóa lượt chạy"
                    className="shrink-0 w-10 inline-flex items-center justify-center rounded-2xl border border-white/10 text-slate-300 hover:text-white hover:bg-white/5"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isRunning || starting}
                  className="shrink-0 inline-flex items-center justify-center gap-2 px-4 sm:px-6 rounded-2xl text-sm font-bold text-white bg-gradient-to-r from-sky-500 via-indigo-500 to-fuchsia-500 hover:brightness-110 shadow-[0_0_24px_rgba(99,102,241,0.55)] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                >
                  {isRunning || starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  <span className="hidden sm:inline">{isRunning ? 'Đang chạy…' : 'Khởi chạy'}</span>
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Popup: kết quả */}
      <Popup
        open={popup?.type === 'result' && Boolean(shownRun?.result)}
        onClose={closePopup}
        size="xl"
        icon={<FileText className="w-4.5 h-4.5" />}
        title={shownRun?.result?.title}
        subtitle={shownRun?.result ? `${shownRun.result.wordCount.toLocaleString('vi-VN')} từ · ${pipeline?.name}` : undefined}
      >
        {shownRun?.result && <ResultPanel result={shownRun.result} onJumpToVideo={onJumpToVideo} />}
      </Popup>

      {/* Popup: lỗi */}
      <Popup
        open={popup?.type === 'error' && shownRun?.status === 'error'}
        onClose={closePopup}
        icon={<XCircle className="w-4.5 h-4.5" />}
        title="Quy trình dừng vì lỗi"
        subtitle="Bấm vào hành tinh màu đỏ để xem bước bị lỗi"
      >
        <p className="text-sm text-rose-200 leading-relaxed break-words">{shownRun?.error}</p>
        <div className="mt-4 rounded-xl border border-white/5 bg-black/30 p-3 max-h-64 overflow-y-auto font-mono text-[11px] space-y-0.5">
          {(shownRun?.logs || []).slice(-30).map((l, i) => (
            <p
              key={i}
              className={l.level === 'error' ? 'text-rose-300' : l.level === 'warn' ? 'text-amber-300' : 'text-slate-400'}
            >
              {l.message}
            </p>
          ))}
        </div>
      </Popup>

      {/* Popup: chi tiết một bước (bấm vào hành tinh) */}
      <Popup
        open={Boolean(selectedStep)}
        onClose={closePopup}
        icon={<Orbit className="w-4.5 h-4.5" />}
        title={selectedStep ? `Bước ${sceneSteps.indexOf(selectedStep) + 1} · ${selectedStep.label}` : ''}
        subtitle={selectedStep?.group ? 'Chạy song song cùng các agent khác trên cùng quỹ đạo' : pipeline?.name}
      >
        {selectedStep && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${STATUS_PILL[selectedStep.status]}`}>
                {STATUS_TEXT[selectedStep.status]}
              </span>
              {selectedStep.startedAt && (
                <span className="text-[11px] text-slate-400 tabular-nums">
                  Bắt đầu {new Date(selectedStep.startedAt).toLocaleTimeString('vi-VN', { hour12: false })}
                  {' · '}
                  {formatElapsed((selectedStep.endedAt ?? now) - selectedStep.startedAt)}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-200 leading-relaxed break-words">
              {selectedStep.detail ||
                (selectedStep.status === 'pending' ? 'Bước này chưa chạy. Bấm Khởi chạy để bắt đầu quy trình.' : 'Không có mô tả thêm.')}
            </p>
            {stepLogs.length > 0 && (
              <div className="rounded-xl border border-white/5 bg-black/30 p-3 max-h-56 overflow-y-auto font-mono text-[11px] space-y-0.5">
                {stepLogs.map((l, i) => (
                  <p
                    key={i}
                    className={l.level === 'error' ? 'text-rose-300' : l.level === 'warn' ? 'text-amber-300' : 'text-slate-400'}
                  >
                    {new Date(l.ts).toLocaleTimeString('vi-VN', { hour12: false })} {l.message}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </Popup>
    </>
  );
};

export default StudioPage;
