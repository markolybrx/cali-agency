import React, { useState } from 'react';
import type { PromptEntry, ThinkingLevel } from '../../types/agency';
import type { ThemeTokens } from '../../theme/themes';
import { resetAllPrompts, savePromptOverride } from '../../prompts/agencyPrompts';

interface PromptStudioProps {
  open: boolean;
  onClose: () => void;
  t: ThemeTokens;
  prompts: PromptEntry[];
  onPromptsChange: (next: PromptEntry[]) => void;
  onToast: (msg: string) => void;
}

export const PromptStudioDrawer: React.FC<PromptStudioProps> = ({
  open,
  onClose,
  t,
  prompts,
  onPromptsChange,
  onToast
}) => {
  const [selectedId, setSelectedId] = useState<string>(prompts[0]?.id || 'cali-director');
  const active = prompts.find((p) => p.id === selectedId) || prompts[0];
  const [draft, setDraft] = useState(active?.content || '');
  const [level, setLevel] = useState<ThinkingLevel>(active?.thinkingLevel || 'medium');

  const selectPrompt = (p: PromptEntry) => {
    setSelectedId(p.id);
    setDraft(p.content);
    setLevel(p.thinkingLevel);
  };

  if (!open || !active) return null;

  return (
    <div className={`absolute inset-0 z-30 flex flex-col backdrop-blur-2xl p-4 ${t.overlay}`}>
      <div className="flex items-center justify-between pb-3 border-b border-current/10 shrink-0">
        <div>
          <h3 className="text-base font-semibold leading-none">Prompt Studio</h3>
          <p className="text-[11px] opacity-60 mt-1">{prompts.length} Verbatim Agent &amp; Cali Prompts</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const reset = resetAllPrompts();
              onPromptsChange(reset);
              const found = reset.find((p) => p.id === selectedId) || reset[0];
              setDraft(found.content);
              setLevel(found.thinkingLevel);
              onToast('All prompts reset to v1.4.1 defaults');
            }}
            className={`px-2.5 py-1.5 rounded-full text-[11px] border cursor-pointer ${t.secondaryBtn}`}
          >
            Reset All
          </button>
          <button type="button" onClick={onClose} className="p-2 rounded-full border border-current/15 cursor-pointer">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Horizontal Agent Selector */}
      <div className="py-3 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
        {prompts.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => selectPrompt(p)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium border shrink-0 cursor-pointer ${
              p.id === active.id ? t.primaryBtn : t.secondaryBtn
            }`}
          >
            {p.title}
          </button>
        ))}
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col min-h-0 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-mono opacity-65 truncate">
            {active.folder}/{active.filename}
          </span>
          <div className="flex items-center gap-1">
            {(['low', 'medium', 'high'] as ThinkingLevel[]).map((lv) => (
              <button
                key={lv}
                type="button"
                onClick={() => setLevel(lv)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase border cursor-pointer ${
                  level === lv ? t.primaryBtn : t.secondaryBtn
                }`}
              >
                {lv}
              </button>
            ))}
          </div>
        </div>

        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className={`flex-1 w-full rounded-2xl border p-3.5 text-[11px] font-mono leading-relaxed focus:outline-none resize-none ${t.input}`}
        />

        <button
          type="button"
          onClick={() => {
            const next = savePromptOverride(active.id, draft, level);
            onPromptsChange(next);
            onToast(`Saved ${active.filename}`);
          }}
          className={`w-full py-2.5 rounded-full text-xs font-semibold cursor-pointer ${t.primaryBtn}`}
        >
          Save Prompt Override
        </button>
      </div>
    </div>
  );
};
