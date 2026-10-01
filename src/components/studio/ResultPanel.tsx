import React, { useState } from 'react';
import { AlertTriangle, Check, Copy, Download, FileText, Film } from 'lucide-react';
import type { StudioResult } from '../../types/studio';
import { Markdown } from './Markdown';

interface ResultPanelProps {
  result: StudioResult;
  onJumpToVideo: () => void;
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/đ/g, 'd')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'bao-cao'
  );
}

const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard có thể bị chặn (http không bảo mật); bỏ qua.
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-700 bg-slate-900/80 text-slate-200 hover:border-indigo-500 hover:text-white transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      {label ?? (copied ? 'Đã chép' : 'Sao chép')}
    </button>
  );
};

export const ResultPanel: React.FC<ResultPanelProps> = ({ result, onJumpToVideo }) => {
  const download = () => {
    const blob = new Blob([result.markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slugify(result.title)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const quickBlocks = result.copyBlocks.filter((b) => !b.label.startsWith('Toàn bộ'));

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <article className="glass-panel rounded-3xl border border-slate-800 p-5 sm:p-8 shadow-xl shadow-black/40 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-2 border-b border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <FileText className="w-4 h-4 text-indigo-400" />
            <span>{result.wordCount.toLocaleString('vi-VN')} từ</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={result.markdown} label="Chép toàn bộ" />
            <button
              type="button"
              onClick={download}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-700 bg-slate-900/80 text-slate-200 hover:border-indigo-500 hover:text-white transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Tải .md
            </button>
          </div>
        </div>
        <Markdown source={result.markdown} />
      </article>

      <aside className="space-y-4 lg:sticky lg:top-24 self-start">
        {result.warnings.length > 0 && (
          <div className="rounded-2xl border border-amber-700/50 bg-amber-950/30 p-4">
            <p className="flex items-center gap-2 text-xs font-bold text-amber-300 mb-2">
              <AlertTriangle className="w-4 h-4" /> Kiểm tra tự động
            </p>
            <ul className="space-y-1 text-[11px] text-amber-100/90 list-disc pl-4">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="glass-panel rounded-2xl border border-slate-800 p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-300">Sao chép nhanh</p>
          {quickBlocks.map((b, i) => (
            <div key={i} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">{b.label}</span>
                <CopyButton text={b.text} />
              </div>
              <p className="text-xs text-slate-300 leading-relaxed line-clamp-4 whitespace-pre-line">{b.text}</p>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onJumpToVideo}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-900/40 transition-all"
        >
          <Film className="w-4 h-4" /> Có video NotebookLM rồi? Sang tab Xử Lý Video
        </button>
      </aside>
    </section>
  );
};
