import React, { useState } from 'react';
import type { PromptEntry, ThinkingLevel } from '../../types/agency';
import type { ThemeTokens } from '../../theme/themes';
import { resetAllPrompts, savePromptOverride } from '../../prompts/agencyPrompts';
import type { ConfirmState } from '../common/ConfirmModal';

interface PromptStudioProps {
  open: boolean;
  onClose: () => void;
  t: ThemeTokens;
  prompts: PromptEntry[];
  onPromptsChange: (next: PromptEntry[]) => void;
  onRequestConfirm: (state: ConfirmState) => void;
  onToast: (msg: string) => void;
}

export const PromptStudioDrawer: React.FC<PromptStudioProps> = ({
  open,
  onClose,
  t,
  prompts,
  onPromptsChange,
  onRequestConfirm,
  onToast
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [level, setLevel] = useState<ThinkingLevel>('medium');

  if (!open) return null;

  const active = selectedId ? prompts.find((p) => p.id === selectedId) || null : null;

  const openPromptCard = (p: PromptEntry) => {
    setSelectedId(p.id);
    setDraft(p.content);
    setLevel(p.thinkingLevel);
    setIsEditing(false);
  };

  return (
    <div className={`absolute inset-0 z-30 flex flex-col backdrop-blur-2xl p-4 ${t.overlay}`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-current/10 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {active && (
            <button
              type="button"
              onClick={() => {
                setSelectedId(null);
                setIsEditing(false);
              }}
              className={`p-1.5 rounded-full border cursor-pointer ${t.secondaryBtn}`}
              title="Back to list"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
          <div className="min-w-0">
            <h3 className="text-base font-semibold leading-none truncate">
              {active ? active.title : 'Prompt Studio'}
            </h3>
            <p className="text-[11px] opacity-60 mt-1 truncate">
              {active ? `${active.folder}/${active.filename} • ${isEditing ? 'Editing' : 'Read-Only'}` : `${prompts.length} Verbatim Agent & Cali Prompts`}
            </p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="p-2 rounded-full border border-current/15 cursor-pointer shrink-0">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* LIST VIEW (Only shows prompt content after clicking a card!) */}
      {!active ? (
        <div className="flex-1 overflow-y-auto py-3 pb-24 space-y-2.5">
          {prompts.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => openPromptCard(p)}
              className={`w-full rounded-2xl border p-3.5 text-left flex items-center justify-between gap-3 transition cursor-pointer ${t.surface}`}
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">{p.title}</div>
                <div className="text-[10px] font-mono opacity-55 truncate mt-0.5">
                  {p.folder}/{p.filename}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono uppercase border ${t.subtleBadge}`}>
                  {p.thinkingLevel}
                </span>
                <svg className="w-4 h-4 opacity-45" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </button>
          ))}

          {/* Danger Zone: Reset All Prompts */}
          <div className="rounded-2xl border border-rose-500/35 bg-rose-950/20 p-3.5 flex items-center justify-between gap-3 mt-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-400">Danger Zone</div>
              <div className="text-xs opacity-80">Reset all prompts to factory defaults</div>
            </div>
            <button
              type="button"
              onClick={() =>
                onRequestConfirm({
                  title: 'Reset All Prompts?',
                  message: 'This will erase any custom prompt edits and restore all 15 verbatim default prompts.',
                  confirmLabel: 'Reset Prompts',
                  onConfirm: () => {
                    const reset = resetAllPrompts();
                    onPromptsChange(reset);
                    onToast('All prompts restored to defaults');
                  }
                })
              }
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer shrink-0"
            >
              Reset All
            </button>
          </div>
        </div>
      ) : (
        /* DETAIL VIEW: Read-Only by default with explicit Edit button */
        <div className="flex-1 flex flex-col min-h-0 py-3 pb-20 space-y-3">
          <div className="flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase opacity-55 font-semibold">Thinking:</span>
              {(['low', 'medium', 'high'] as ThinkingLevel[]).map((lv) => (
                <button
                  key={lv}
                  type="button"
                  disabled={!isEditing}
                  onClick={() => setLevel(lv)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase border ${
                    level === lv ? t.primaryBtn : t.secondaryBtn
                  } ${isEditing ? 'cursor-pointer' : 'opacity-65 cursor-default'}`}
                >
                  {lv}
                </button>
              ))}
            </div>

            {!isEditing ? (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer ${t.primaryBtn}`}
              >
                Edit Prompt
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(active.content);
                    setLevel(active.thinkingLevel);
                    setIsEditing(false);
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs border cursor-pointer ${t.secondaryBtn}`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = savePromptOverride(active.id, draft, level);
                    onPromptsChange(next);
                    setIsEditing(false);
                    onToast(`Saved ${active.filename}`);
                  }}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer ${t.primaryBtn}`}
                >
                  Save
                </button>
              </div>
            )}
          </div>

          {!isEditing ? (
            <div className={`flex-1 overflow-y-auto rounded-2xl border p-4 ${t.surface}`}>
              <pre className="text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-words opacity-90">
                {active.content}
              </pre>
            </div>
          ) : (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className={`flex-1 w-full rounded-2xl border p-3.5 text-[11px] font-mono leading-relaxed focus:outline-none resize-none ${t.input}`}
            />
          )}
        </div>
      )}
    </div>
  );
};
