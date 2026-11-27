import React, { useState } from 'react';
import type { ThemeTokens } from '../../theme/themes';
import { ORG_ROSTER, type OrgTier } from '../../data/orgHierarchy';

interface OrgChartModalProps {
  open: boolean;
  onClose: () => void;
  t: ThemeTokens;
}

const TIER_TITLES: Record<OrgTier, string> = {
  1: 'Tier 1 — Executive Office (COO)',
  2: 'Tier 2 — 4 Department Directors (Boardroom)',
  3: 'Tier 3 — 4 Team Leads (Dispatch & Coaching)',
  4: 'Tier 4 — 15 Specialists'
};

export const OrgChartModal: React.FC<OrgChartModalProps> = ({ open, onClose, t }) => {
  const [tierFilter, setTierFilter] = useState<'all' | OrgTier>('all');

  if (!open) return null;

  const tiers: OrgTier[] = tierFilter === 'all' ? [1, 2, 3, 4] : [tierFilter];

  return (
    <div className="absolute inset-0 z-50 flex items-end sm:items-center justify-center p-3 bg-black/70 backdrop-blur-md">
      <div className={`w-full max-w-md rounded-3xl border border-current/15 p-5 space-y-3.5 shadow-2xl max-h-[86%] flex flex-col ${t.overlay}`}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-accent font-semibold">
              Realistic 4-Tier Software Company
            </div>
            <h3 className="text-base font-bold">24-Person Org Hierarchy</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`px-3 py-1 rounded-full text-xs border cursor-pointer ${t.secondaryBtn}`}
          >
            Done
          </button>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          {(['all', 1, 2, 3, 4] as const).map((tf) => (
            <button
              key={String(tf)}
              type="button"
              onClick={() => setTierFilter(tf)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-mono border shrink-0 cursor-pointer ${
                tierFilter === tf ? t.primaryBtn : t.secondaryBtn
              }`}
            >
              {tf === 'all' ? 'All (24)' : `Tier ${tf}`}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto space-y-4">
          <div className={`rounded-2xl border p-3 text-xs ${t.accentCard}`}>
            <div className="text-[10px] font-mono uppercase font-bold text-accent">Founder &amp; CEO</div>
            <div className="font-semibold mt-0.5">Mark — Final Authority on Blueprints, Phase Gates &amp; Escalations</div>
          </div>

          {tiers.map((tier) => {
            const members = ORG_ROSTER.filter((m) => m.tier === tier);
            return (
              <div key={tier} className="space-y-2">
                <div className="text-[10px] font-mono uppercase tracking-wider opacity-60 font-semibold">
                  {TIER_TITLES[tier]}
                </div>
                {members.map((m) => (
                  <div key={m.id} className={`rounded-2xl border p-3 space-y-1 ${t.surface}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold truncate">
                        {m.name} — {m.title}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono border shrink-0 ${t.subtleBadge}`}>
                        {m.department}
                      </span>
                    </div>
                    <p className="text-[11px] opacity-75 leading-relaxed">{m.keyRole}</p>
                    <div className="text-[10px] font-mono opacity-55">Reports to: {m.reportsTo}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
