import React, { useState } from 'react';
import type { ThemeTokens } from '../../theme/themes';
import type { TeamSuggestion } from '../../engine/workplaceCulture';

interface SuggestionBoardModalProps {
  open: boolean;
  suggestions: TeamSuggestion[];
  onResolve: (id: string, decision: 'approved' | 'deferred') => void;
  onSimulateNew: (title: string, rationale: string, impact: TeamSuggestion['impact']) => void;
  onClose: () => void;
  t: ThemeTokens;
}

export const SuggestionBoardModal: React.FC<SuggestionBoardModalProps> = ({
  open,
  suggestions,
  onResolve,
  onSimulateNew,
  onClose,
  t
}) => {
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [rationale, setRationale] = useState('');
  const [impact, setImpact] = useState<TeamSuggestion['impact']>('UX');

  if (!open) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSimulateNew(title, rationale || 'Proposed by specialist to elevate product quality.', impact);
    setTitle('');
    setRationale('');
    setShowAdd(false);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-end sm:items-center justify-center p-3 bg-black/70 backdrop-blur-md">
      <div className={`w-full max-w-md rounded-3xl border border-current/15 p-5 space-y-4 shadow-2xl max-h-[85%] flex flex-col ${t.overlay}`}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-accent font-semibold">
              Employee Suggestion Board
            </div>
            <h3 className="text-base font-bold">Escalated Team Ideas</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowAdd((v) => !v)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer ${t.primaryBtn}`}
            >
              {showAdd ? 'Cancel' : '+ Pin Idea'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`px-3 py-1 rounded-full text-xs border cursor-pointer ${t.secondaryBtn}`}
            >
              Done
            </button>
          </div>
        </div>

        {showAdd && (
          <form onSubmit={handleCreate} className={`rounded-2xl border p-3.5 space-y-2.5 ${t.surface}`}>
            <div className="text-[10px] font-mono uppercase opacity-60">Pin &amp; Escalate via Team Lead -&gt; Director -&gt; Cali</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Suggestion title..."
              className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${t.input}`}
            />
            <textarea
              rows={2}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Why this helps the project..."
              className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${t.input}`}
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-1">
                {(['UX', 'Performance', 'Reliability', 'Security'] as const).map((imp) => (
                  <button
                    key={imp}
                    type="button"
                    onClick={() => setImpact(imp)}
                    className={`px-2 py-1 rounded-full text-[10px] border cursor-pointer ${impact === imp ? t.primaryBtn : t.secondaryBtn}`}
                  >
                    {imp}
                  </button>
                ))}
              </div>
              <button type="submit" className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer ${t.primaryBtn}`}>
                Escalate
              </button>
            </div>
          </form>
        )}

        <div className="flex-1 overflow-y-auto space-y-3">
          {suggestions.length === 0 ? (
            <p className="text-xs opacity-60 text-center py-8">No team suggestions yet.</p>
          ) : (
            suggestions.map((s) => {
              const resolved = s.status !== 'escalated';
              return (
                <div
                  key={s.id}
                  className={`rounded-2xl border p-3.5 space-y-2 transition-all ${t.surface} ${resolved ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-accent font-semibold truncate">{s.escalationPath}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono border shrink-0 ${t.subtleBadge}`}>
                      {s.impact}
                    </span>
                  </div>
                  <div className="text-xs font-bold leading-snug">{s.title}</div>
                  <p className="text-[11px] opacity-75 leading-relaxed">{s.rationale}</p>

                  {!resolved ? (
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => onResolve(s.id, 'approved')}
                        className={`flex-1 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer ${t.primaryBtn}`}
                      >
                        Approve &amp; Queue
                      </button>
                      <button
                        type="button"
                        onClick={() => onResolve(s.id, 'deferred')}
                        className={`px-3.5 py-1.5 rounded-full text-[11px] border cursor-pointer ${t.secondaryBtn}`}
                      >
                        Defer
                      </button>
                    </div>
                  ) : (
                    <div className="w-full py-1.5 rounded-full bg-current/10 text-center text-[10px] font-mono uppercase">
                      {s.status === 'approved' ? 'Approved & Queued by CEO' : 'Deferred to Backlog'}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
