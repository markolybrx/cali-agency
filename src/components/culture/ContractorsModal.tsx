import React, { useMemo, useState } from 'react';
import type { ThemeTokens } from '../../theme/themes';
import type { SpecialistDivision, VisitingContractor } from '../../data/specialistsCatalog';
import type { CanvasDocument } from '../common/ArtifactCanvasModal';

interface ContractorsModalProps {
  open: boolean;
  contractors: VisitingContractor[];
  summonedIds: string[];
  recommendedIds?: string[];
  activeProjectName: string | null;
  onToggleSummon: (contractorId: string) => void;
  onInspectPrompt: (doc: CanvasDocument) => void;
  onClose: () => void;
  t: ThemeTokens;
}

const DIVISIONS: Array<'All' | SpecialistDivision> = [
  'All',
  'Specialized Engineering',
  'Game & Spatial Studio',
  'Security & Red Team',
  'Growth, Marketing & Media',
  'Sales & Revenue',
  'Data, GIS & Research',
  'Business, Finance & Ops',
  'Vertical Specialists'
];

export const ContractorsModal: React.FC<ContractorsModalProps> = ({
  open,
  contractors,
  summonedIds,
  recommendedIds = [],
  activeProjectName,
  onToggleSummon,
  onInspectPrompt,
  onClose,
  t
}) => {
  const [division, setDivision] = useState<'All' | SpecialistDivision>('All');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contractors.filter((c) => {
      if (division !== 'All' && c.division !== division) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.summary.toLowerCase().includes(q) ||
        c.keywords.some((k) => k.includes(q)) ||
        c.mergedFrom.some((m) => m.includes(q))
      );
    });
  }, [contractors, division, query]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-end sm:items-center justify-center p-3 bg-black/75 backdrop-blur-md">
      <div className={`w-full max-w-md rounded-3xl border border-current/15 p-5 space-y-3.5 shadow-2xl max-h-[88%] flex flex-col ${t.overlay}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-mono uppercase tracking-widest text-accent font-semibold">
              28 Consolidated Specialists (From 282-Agent Repo)
            </div>
            <h3 className="text-base font-bold truncate">Visiting Contractors</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`px-3 py-1 rounded-full text-xs border cursor-pointer shrink-0 ${t.secondaryBtn}`}
          >
            Done
          </button>
        </div>

        <div className={`rounded-2xl border px-3 py-2 text-[11px] flex items-center justify-between ${t.surface}`}>
          <span className="truncate opacity-75">
            {activeProjectName ? `Project: ${activeProjectName}` : 'Select a project to summon contractors'}
          </span>
          <span className="font-mono text-accent font-semibold shrink-0">{summonedIds.length} Summoned</span>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search skills (3D, pentest, SEO, finance, GIS, Rust...)"
          className={`w-full px-3.5 py-2 rounded-2xl text-xs border focus:outline-none ${t.input}`}
        />

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          {DIVISIONS.map((div) => (
            <button
              key={div}
              type="button"
              onClick={() => setDivision(div)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-medium border shrink-0 cursor-pointer ${
                division === div ? t.primaryBtn : t.secondaryBtn
              }`}
            >
              {div}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto space-y-2.5">
          {filtered.length === 0 ? (
            <p className="text-xs opacity-60 text-center py-8">No matching specialists found.</p>
          ) : (
            filtered.map((c) => {
              const isSummoned = summonedIds.includes(c.id);
              const isRec = recommendedIds.includes(c.id);
              return (
                <div
                  key={c.id}
                  className={`rounded-2xl border p-3.5 space-y-2 transition ${isSummoned ? t.accentCard : t.surface}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold">{c.name} — {c.title}</span>
                        {isRec && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[9px] font-mono font-bold">
                            CALI PICK
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono opacity-60 mt-0.5">{c.division}</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono uppercase border shrink-0 ${t.subtleBadge}`}>
                      {c.thinkingLevel}
                    </span>
                  </div>

                  <p className="text-[11px] opacity-80 leading-relaxed">{c.summary}</p>

                  {c.mergedFrom.length > 0 && (
                    <div className="text-[9px] font-mono opacity-55 truncate">
                      Consolidates: {c.mergedFrom.join(', ')}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={!activeProjectName}
                      onClick={() => onToggleSummon(c.id)}
                      className={`flex-1 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer disabled:opacity-40 ${
                        isSummoned ? t.secondaryBtn : t.primaryBtn
                      }`}
                    >
                      {isSummoned ? 'Dismiss from Project' : 'Summon to Project'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onInspectPrompt({
                          category: 'VISITING CONTRACTOR PROMPT',
                          title: `${c.name} — ${c.title}`,
                          subtitle: `${c.division} • Thinking: ${c.thinkingLevel.toUpperCase()}`,
                          content: c.systemPrompt,
                          mode: 'editorial',
                          filename: `${c.id}.md`
                        })
                      }
                      className={`px-3 py-1.5 rounded-full text-[11px] font-medium border cursor-pointer ${t.secondaryBtn}`}
                    >
                      Inspect
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
