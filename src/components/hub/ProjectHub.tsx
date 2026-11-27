import React from 'react';
import type { AgencyReport, ProjectState } from '../../types/agency';
import type { ThemeTokens } from '../../theme/themes';
import { getLocalSaveFolder, slugifyProjectName } from '../../engine/localSave';

interface ProjectHubProps {
  userName: string | null;
  authBadge: string;
  projects: ProjectState[];
  reports: AgencyReport[];
  onSelectProject: (projectId: string) => void;
  onNewProject: () => void;
  onOpenReports: () => void;
  onGeneralChat: () => void;
  onOpenSettings: () => void;
  t: ThemeTokens;
}

export const ProjectHub: React.FC<ProjectHubProps> = ({
  userName,
  authBadge,
  projects,
  reports,
  onSelectProject,
  onNewProject,
  onOpenReports,
  onGeneralChat,
  onOpenSettings,
  t
}) => {
  const folder = getLocalSaveFolder();

  return (
    <div className={`w-full h-full flex flex-col overflow-hidden relative ${t.shell}`}>
      <div className={`pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[340px] h-[200px] rounded-full blur-3xl opacity-20 ${t.glow}`} />

      <header className="relative z-10 px-5 pt-5 pb-3.5 border-b border-current/10 flex items-center justify-between gap-2 shrink-0">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-accent font-semibold">
            Project Selection Hub
          </div>
          <h1 className="text-xl font-bold leading-tight mt-0.5">
            Welcome back{userName ? `, ${userName}` : ''}
          </h1>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold border cursor-pointer ${t.subtleBadge}`}
        >
          {authBadge}
        </button>
      </header>

      <div className="relative z-10 flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Primary Hub Actions */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onNewProject}
            className={`rounded-2xl p-4 text-left space-y-2 shadow-lg cursor-pointer ${t.primaryBtn}`}
          >
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <div>
              <div className="font-semibold text-sm leading-snug">New Project</div>
              <div className="text-[11px] opacity-80 mt-0.5">Plan with Cali (Text / Voice)</div>
            </div>
          </button>

          <button
            type="button"
            onClick={onOpenReports}
            className={`rounded-2xl border p-4 text-left space-y-2 cursor-pointer ${t.surface}`}
          >
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${t.accentCard}`}>
              <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <div>
              <div className="font-semibold text-sm leading-snug">Reports Hub</div>
              <div className="text-[11px] opacity-65 mt-0.5">{reports.length} Saved Briefings</div>
            </div>
          </button>
        </div>

        {/* Active Projects List */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider opacity-60">
              Active Projects (Offline-Ready)
            </span>
            <span className="text-[10px] font-mono opacity-55">{projects.length} Saved</span>
          </div>

          {projects.length === 0 ? (
            <div className={`rounded-3xl border border-dashed p-6 text-center space-y-2 ${t.surface}`}>
              <div className="text-sm font-semibold">No projects yet</div>
              <p className="text-xs opacity-65 leading-relaxed">
                Tap New Project above to start a detailed planning session with Cali, or import an existing Markdown blueprint.
              </p>
            </div>
          ) : (
            projects.map((p) => {
              const totalTasks = p.phases.reduce((sum, ph) => sum + ph.tasks.length, 0);
              const doneTasks = p.phases.reduce((sum, ph) => sum + ph.tasks.filter((tk) => tk.status === 'DONE').length, 0);
              const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
              const fileCount = Object.keys(p.files || {}).length;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelectProject(p.id)}
                  className={`w-full rounded-3xl border p-4 text-left space-y-3 cursor-pointer transition ${t.surface}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-base truncate">{p.project_name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${t.subtleBadge}`}>
                          PHASE {p.current_phase_id}
                        </span>
                      </div>
                      <p className="text-[11px] opacity-65 mt-1 truncate">
                        {fileCount} files / Documents/{folder}/{slugifyProjectName(p.project_name)}/
                      </p>
                    </div>
                    <svg className="w-4 h-4 opacity-50 shrink-0 mt-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-current/10 overflow-hidden">
                    <div className={`h-full rounded-full ${t.dot}`} style={{ width: `${Math.max(4, pct)}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[11px] opacity-70">
                    <span>{doneTasks}/{totalTasks} tasks verified</span>
                    <span className="font-mono text-accent font-medium">Open Dashboard</span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <button
          type="button"
          onClick={onGeneralChat}
          className={`w-full rounded-2xl border p-3.5 flex items-center justify-between text-left cursor-pointer ${t.surface}`}
        >
          <div>
            <div className="text-xs font-semibold">General Chat with Cali</div>
            <div className="text-[11px] opacity-65">Brainstorm or ask questions without altering any project</div>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${t.secondaryBtn}`}>Chat</span>
        </button>
      </div>
    </div>
  );
};
