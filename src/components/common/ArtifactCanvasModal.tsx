import React from 'react';
import type { ThemeTokens } from '../../theme/themes';
import { saveTextLocally } from '../../engine/localSave';

export interface CanvasDocument {
  category: string;
  title: string;
  subtitle?: string;
  content: string;
  mode: 'editorial' | 'code';
  filename?: string;
  metrics?: Array<{ label: string; value: string }>;
}

interface ArtifactCanvasModalProps {
  doc: CanvasDocument | null;
  onClose: () => void;
  onToast: (msg: string) => void;
  t: ThemeTokens;
}

function renderEditorialBlocks(markdown: string): React.ReactNode[] {
  const lines = markdown.split('\n');
  const nodes: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  const flushList = (keyPrefix: string) => {
    if (listBuffer.length === 0) return;
    nodes.push(
      <ul key={`${keyPrefix}-ul`} className="list-disc pl-5 space-y-2 mb-4 text-[14px] leading-relaxed opacity-85">
        {listBuffer.map((item, idx) => (
          <li key={idx} dangerouslySetInnerHTML={{ __html: formatInline(item) }} />
        ))}
      </ul>
    );
    listBuffer = [];
  };

  const formatInline = (text: string) =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold opacity-100">$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-current/10 font-mono text-[12px]">$1</code>');

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) {
      flushList(`l-${idx}`);
      return;
    }
    if (line.startsWith('## ')) {
      flushList(`h2-${idx}`);
      nodes.push(
        <h4 key={`h2-${idx}`} className="text-[15px] font-semibold tracking-tight mt-5 mb-2">
          {line.slice(3)}
        </h4>
      );
      return;
    }
    if (line.startsWith('# ')) {
      flushList(`h1-${idx}`);
      nodes.push(
        <h3 key={`h1-${idx}`} className="text-lg font-bold tracking-tight mt-4 mb-2">
          {line.slice(2)}
        </h3>
      );
      return;
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      listBuffer.push(line.slice(2));
      return;
    }
    flushList(`p-${idx}`);
    nodes.push(
      <p
        key={`p-${idx}`}
        className="text-[14px] leading-[1.7] opacity-80 mb-3"
        dangerouslySetInnerHTML={{ __html: formatInline(line) }}
      />
    );
  });

  flushList('end');
  return nodes;
}

export const ArtifactCanvasModal: React.FC<ArtifactCanvasModalProps> = ({ doc, onClose, onToast, t }) => {
  if (!doc) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(doc.content);
      onToast('Copied to clipboard');
    } catch {
      onToast('Copy unavailable on this browser');
    }
  };

  const handleSave = async () => {
    const fname = doc.filename || `${doc.title.toLowerCase().replace(/[^a-z0-9-]+/g, '-')}.md`;
    const msg = await saveTextLocally(fname, doc.content, 'text/markdown');
    onToast(msg);
  };

  return (
    <div className={`absolute inset-0 z-50 flex flex-col ${t.shell}`}>
      {/* Top Canvas Header */}
      <div className="px-4 py-3.5 border-b border-current/10 flex items-center justify-between gap-2 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 text-xs font-semibold opacity-75 hover:opacity-100 cursor-pointer"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Back</span>
        </button>

        <span className="text-[10px] font-mono uppercase tracking-wider text-accent font-semibold truncate">
          {doc.category}
        </span>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border cursor-pointer ${t.secondaryBtn}`}
          >
            Copy
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            className={`px-2.5 py-1 rounded-full text-[10px] font-semibold cursor-pointer ${t.primaryBtn}`}
          >
            Save
          </button>
        </div>
      </div>

      {/* Scrollable Editorial / Code Body */}
      <article className="flex-1 overflow-y-auto px-5 py-5 pb-12">
        <div className="space-y-1.5 mb-5">
          <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold border ${t.subtleBadge}`}>
            {doc.category}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-snug pt-1">
            {doc.title}
          </h1>
          {doc.subtitle && <p className="text-xs opacity-60">{doc.subtitle}</p>}
        </div>

        {doc.metrics && doc.metrics.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-5">
            {doc.metrics.map((m, i) => (
              <div key={i} className={`rounded-2xl border p-3 text-center ${t.surface}`}>
                <div className="text-sm font-bold text-accent">{m.value}</div>
                <div className="text-[10px] opacity-60 mt-0.5">{m.label}</div>
              </div>
            ))}
          </div>
        )}

        {doc.mode === 'code' ? (
          <pre className={`rounded-2xl border p-4 text-[11px] font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-words ${t.surface}`}>
            {doc.content}
          </pre>
        ) : (
          <div>{renderEditorialBlocks(doc.content)}</div>
        )}
      </article>
    </div>
  );
};
