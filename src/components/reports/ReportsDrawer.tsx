import React, { useMemo, useState } from 'react';
import type { AgencyReport, ProjectState } from '../../types/agency';
import type { ThemeTokens } from '../../theme/themes';
import { writeReportToLocalFolder } from '../../engine/localSave';

interface ReportsDrawerProps {
  open: boolean;
  reports: AgencyReport[];
  activeProject: ProjectState | null;
  onOpenReport: (report: AgencyReport) => void;
  onGenerateSitrep: () => void;
  onToast: (msg: string) => void;
  t: ThemeTokens;
}

export const ReportsDrawer: React.FC<ReportsDrawerProps> = ({
  open,
  reports,
  activeProject,
  onOpenReport,
  onGenerateSitrep,
  onToast,
  t
}) => {
  const [filter, setFilter] = useState<'all' | 'phase' | 'cali' | 'board'>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return reports;
    if (filter === 'phase') return reports.filter((r) => r.category === 'phase' || r.category === 'final');
    if (filter === 'cali') return reports.filter((r) => r.category === 'cali');
    return reports.filter((r) => r.category === 'board' || r.category === 'coaching');
  }, [reports, filter]);

  if (!open) return null;

  const handleSyncAllReports = async () => {
    const targetName = activeProject?.project_name || 'CaliGeneral';
    let count = 0;
    for (const r of reports) {
      const res = await writeReportToLocalFolder(r.projectName || targetName, r);
      if (res.ok) count += 1;
    }
    onToast(count > 0 ? `Synced ${count} report(s) to local folder` : 'Reports saved in IndexedDB');
  };

  return (
    <div className={`absolute inset-0 z-20 flex flex-col backdrop-blur-2xl p-4 ${t.overlay}`}>
      <div className="flex items-center justify-between pb-3 border-b border-current/10 shrink-0 gap-2">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-accent font-semibold">
            Executive Archive
          </div>
          <h3 className="text-base font-semibold leading-none mt-0.5">Reports &amp; Briefings</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onGenerateSitrep}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer ${t.primaryBtn}`}
          >
            + Sitrep Now
          </button>
          <button
            type="button"
            onClick={() => void handleSyncAllReports()}
            className={`px-2.5 py-1.5 rounded-full text-[11px] font-medium border cursor-pointer ${t.secondaryBtn}`}
          >
            Sync .md
          </button>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="py-3 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
        {(
          [
            ['all', `All (${reports.length})`],
            ['phase', 'Phase Reports'],
            ['cali', 'Cali Sitreps'],
            ['board', 'Board & Coaching']
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium border shrink-0 cursor-pointer ${
              filter === id ? t.primaryBtn : t.secondaryBtn
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Editorial Report Cards */}
      <div className="flex-1 overflow-y-auto pb-28 space-y-3">
        {filtered.length === 0 ? (
          <div className={`rounded-3xl border p-6 text-center space-y-2 ${t.surface}`}>
            <div className="text-xs font-semibold">No reports in this category yet</div>
            <p className="text-[11px] opacity-65">
              Phase Accomplishment Reports are generated automatically after every Phase Gate, or tap + Sitrep Now for an instant Cali briefing.
            </p>
          </div>
        ) : (
          filtered.map((rep) => (
            <button
              key={rep.id}
              type="button"
              onClick={() => onOpenReport(rep)}
              className={`w-full rounded-3xl border p-4 text-left space-y-2 cursor-pointer transition ${t.surface}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-semibold border ${t.subtleBadge}`}>
                  {rep.badge}
                </span>
                <span className="text-[10px] font-mono opacity-55">
                  {new Date(rep.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="text-sm font-bold leading-snug">{rep.title}</div>
              <p className="text-xs opacity-70 leading-relaxed">{rep.summary}</p>
              <div className="flex items-center justify-between pt-1 text-[11px]">
                <span className="opacity-55">{rep.author}</span>
                <span className="font-semibold text-accent">Read Full Report</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
