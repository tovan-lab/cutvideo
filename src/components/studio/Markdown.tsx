import React, { useMemo } from 'react';

/**
 * Bộ hiển thị markdown tối giản cho báo cáo AI: tiêu đề, đoạn, danh sách, bảng, trích dẫn,
 * đậm/nghiêng, link. Mọi HTML trong nội dung đều bị escape; link chỉ nhận http/https.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-slate-800 text-indigo-200 text-[0.85em]">$1</code>');
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label, url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-indigo-300 underline decoration-indigo-500/40 underline-offset-2 hover:text-indigo-200">${label}</a>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/(^|\s)_([^_\n]+)_(?=\s|$|[.,;:!?)])/g, '$1<em class="text-slate-400">$2</em>');
  return out;
}

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

function render(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const cls = [
        '',
        'text-xl sm:text-2xl font-extrabold text-white mt-2 mb-4 tracking-tight',
        'text-base sm:text-lg font-bold text-indigo-200 mt-8 mb-3 pb-2 border-b border-slate-800',
        'text-sm sm:text-base font-semibold text-white mt-5 mb-2',
        'text-sm font-semibold text-slate-200 mt-4 mb-1',
      ][level];
      html.push(`<h${level} class="${cls}">${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(splitRow(lines[i++]));
      html.push(
        `<div class="overflow-x-auto my-4 rounded-xl border border-slate-800"><table class="w-full text-xs sm:text-sm"><thead class="bg-slate-900/80"><tr>${head
          .map((h) => `<th class="px-3 py-2 text-left font-semibold text-slate-200 whitespace-nowrap">${inline(h)}</th>`)
          .join('')}</tr></thead><tbody>${rows
          .map(
            (r) =>
              `<tr class="border-t border-slate-800/80">${r.map((c) => `<td class="px-3 py-2 text-slate-300 align-top">${inline(c)}</td>`).join('')}</tr>`
          )
          .join('')}</tbody></table></div>`
      );
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
      html.push(
        `<blockquote class="my-4 pl-4 border-l-2 border-amber-400/70 text-amber-100/90 text-sm">${inline(quote.join(' '))}</blockquote>`
      );
      continue;
    }

    const listMatch = line.match(/^\s*([-*]|\d+\.)\s+/);
    if (listMatch) {
      const ordered = /\d/.test(listMatch[1]);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''));
      }
      const tag = ordered ? 'ol' : 'ul';
      html.push(
        `<${tag} class="my-3 space-y-1.5 pl-5 ${ordered ? 'list-decimal' : 'list-disc'} marker:text-indigo-400 text-sm text-slate-300 leading-relaxed">${items
          .map((it) => `<li>${inline(it)}</li>`)
          .join('')}</${tag}>`
      );
      continue;
    }

    if (/^-{3,}$/.test(line.trim())) {
      html.push('<hr class="my-6 border-slate-800" />');
      i++;
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4})\s|^\s*\||^\s*>|^\s*([-*]|\d+\.)\s+/.test(lines[i])
    ) {
      para.push(lines[i++]);
    }
    html.push(`<p class="my-3 text-sm text-slate-300 leading-relaxed">${para.map(inline).join('<br/>')}</p>`);
  }
  return html.join('\n');
}

export const Markdown: React.FC<{ source: string; className?: string }> = ({ source, className = '' }) => {
  const html = useMemo(() => render(source), [source]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
};
