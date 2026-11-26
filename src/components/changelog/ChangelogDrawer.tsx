import React from 'react';
import { APP_VERSION_CODE, APP_VERSION_TAG, CHANGELOG } from '../../version';
import type { ThemeTokens } from '../../theme/themes';

interface ChangelogDrawerProps {
  open: boolean;
  onClose: () => void;
  t: ThemeTokens;
}

export const ChangelogDrawer: React.FC<ChangelogDrawerProps> = ({ open, onClose, t }) => {
  if (!open) return null;

  return (
    <div className={`absolute inset-0 z-40 flex flex-col backdrop-blur-2xl p-4 ${t.overlay}`}>
      <div className="flex items-center justify-between pb-3 border-b border-current/10 shrink-0">
        <div>
          <h3 className="text-base font-semibold leading-none">Changelog &amp; Versioning</h3>
          <p className="text-[11px] opacity-60 mt-1">
            Current Build: <span className="font-mono text-accent">{APP_VERSION_TAG}</span> (versionCode {APP_VERSION_CODE})
          </p>
        </div>
        <button type="button" onClick={onClose} className="p-2 rounded-full border border-current/15 cursor-pointer">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {/* Versioning Policy Card */}
        <div className={`rounded-2xl border p-3.5 space-y-1.5 ${t.accentCard}`}>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-accent">Semantic Versioning (vx.y.z)</div>
          <div className="text-[11px] opacity-85 space-y-0.5">
            <div><span className="font-mono font-semibold">x</span> — Major updates (bumped only upon explicit confirmation)</div>
            <div><span className="font-mono font-semibold">y</span> — Minor updates (roadmap phases; next: v0.4.0 → v0.5.0)</div>
            <div><span className="font-mono font-semibold">z</span> — Bug fixes &amp; micro-patches</div>
          </div>
        </div>

        {/* Releases */}
        {CHANGELOG.map((rel) => (
          <div key={rel.version} className={`rounded-2xl border p-4 space-y-2.5 ${t.surface}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-mono font-semibold text-accent">{rel.version}</span>
              <span className="text-[10px] font-mono opacity-55">{rel.date}</span>
            </div>
            <div className="text-xs font-semibold">{rel.title}</div>
            <ul className="space-y-1.5 text-[11px] opacity-80 list-disc pl-4">
              {rel.highlights.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};
