import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface ContentSectionProps {
  label: string;
  sublabel?: string;
  content: string | string[];
  isHashtags?: boolean;
  onCopyNotice: (title: string) => void;
}

export const ContentSection: React.FC<ContentSectionProps> = ({
  label,
  sublabel,
  content,
  isHashtags = false,
  onCopyNotice,
}) => {
  const [copied, setCopied] = useState(false);

  const textToCopy = Array.isArray(content) ? content.join(' ') : content;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      onCopyNotice(`Đã sao chép ${label}!`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      onCopyNotice('Không thể truy cập clipboard.');
    }
  };

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 space-y-2 transition-all hover:border-slate-700/80">
      {/* Section Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            {label}
          </span>
          {sublabel && <span className="text-[11px] text-slate-500">{sublabel}</span>}
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
            copied
              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/40'
              : 'bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700'
          }`}
          title={`Sao chép ${label}`}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Đã chép</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Sao chép</span>
            </>
          )}
        </button>
      </div>

      {/* Content Render */}
      {isHashtags && Array.isArray(content) ? (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {content.map((tag, idx) => (
            <span
              key={idx}
              className="text-xs font-mono text-indigo-300 bg-indigo-950/40 border border-indigo-900/40 rounded px-2 py-0.5"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-line font-normal selection:bg-indigo-600/30">
          {textToCopy}
        </p>
      )}
    </div>
  );
};
