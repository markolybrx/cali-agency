import React, { useMemo, useState } from 'react';
import type { AgencyReport, PhaseSnapshot, ProjectState } from '../../types/agency';
import type { ThemeTokens } from '../../theme/themes';
import { type GitHubConfig, shipProjectToGitHub } from '../../engine/storage';
import {
  generatePwaIconsAndManifest,
  getLocalSaveFolder,
  saveZipLocally,
  slugifyProjectName,
  syncAllProjectFilesToLocalFolder
} from '../../engine/localSave';
import type { ConfirmState } from '../common/ConfirmModal';
import type { CanvasDocument } from '../common/ArtifactCanvasModal';
import { SnapshotDiffModal } from './SnapshotDiffModal';

interface WorkspaceDrawerProps {
  open: boolean;
  t: ThemeTokens;
  project: ProjectState | null;
  reports?: AgencyReport[];
  githubConfig: GitHubConfig;
  onSendErrorToDebugger: (errorLog: string) => void;
  onRollbackSnapshot: (snapshot: PhaseSnapshot) => void;
  onAddGeneratedAssets: (files: Record<string, string>) => void;
  onDeleteProject: (projectId: string) => void;
  onOpenCanvas?: (doc: CanvasDocument) => void;
  onOpenFolderPicker?: () => void;
  onRequestConfirm: (state: ConfirmState) => void;
  onToast: (msg: string) => void;
}

/**
 * Resolves local relative <link rel="stylesheet"> and <script src="..."> tags
 * against project.files so multi-file PWAs run cleanly inside srcDoc preview.
 */
function buildBundledPreviewHtml(project: ProjectState): string {
  let html = project.files['index.html'] || project.files['public/index.html'] || '';
  if (!html) return '';

  const lookupFile = (href: string): string | null => {
    const clean = href.replace(/^\.\//, '').replace(/^\//, '');
    return project.files[clean] ?? project.files[`src/${clean}`] ?? project.files[`public/${clean}`] ?? null;
  };

  // Inline local stylesheets
  html = html.replace(/<link[^>]+href=["']([^"']+\.css)["'][^>]*>/gi, (match, href) => {
    if (/^https?:\/\//i.test(href)) return match;
    const css = lookupFile(href);
    return css !== null ? `<style>/* ${href} */\n${css}\n</style>` : match;
  });

  // Inline local scripts
  html = html.replace(/<script[^>]+src=["']([^"']+\.js)["'][^>]*>\s*<\/script>/gi, (match, src) => {
    if (/^https?:\/\//i.test(src)) return match;
    const js = lookupFile(src);
    return js !== null ? `<script>/* ${src} */\n${js}\n<\/script>` : match;
  });

  const errorHook = `<script>
    (function() {
      try {
        var mockReg = { scope: "./", active: null, installing: null, waiting: null, update: function() { return Promise.resolve(); }, unregister: function() { return Promise.resolve(true); } };
        var mockSw = { register: function() { return Promise.resolve(mockReg); }, getRegistration: function() { return Promise.resolve(mockReg); }, getRegistrations: function() { return Promise.resolve([mockReg]); }, ready: Promise.resolve(mockReg), controller: null, addEventListener: function() {}, removeEventListener: function() {} };
        Object.defineProperty(navigator, "serviceWorker", { configurable: true, get: function() { return mockSw; } });
      } catch (e) {}
      window.onerror = function(msg, src, line) {
        parent.postMessage({ type: "PWA_PREVIEW_ERR", msg: msg + " (line " + line + ")" }, "*");
      };
      var origErr = console.error;
      console.error = function() {
        var args = Array.prototype.slice.call(arguments);
        parent.postMessage({ type: "PWA_PREVIEW_ERR", msg: args.join(" ") }, "*");
        origErr.apply(console, args);
      };
    })();
  <\/script>`;

  return html.includes('<head>') ? html.replace('<head>', `<head>${errorHook}`) : `${errorHook}${html}`;
}

export const WorkspaceDrawer: React.FC<WorkspaceDrawerProps> = ({
  open,
  t,
  project,
  reports = [],
  githubConfig,
  onSendErrorToDebugger,
  onRollbackSnapshot,
  onAddGeneratedAssets,
  onDeleteProject,
  onOpenCanvas,
  onOpenFolderPicker,
  onRequestConfirm,
  onToast
}) => {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [tab, setTab] = useState<'files' | 'preview' | 'snapshots'>('files');
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [shipping, setShipping] = useState(false);
  const [syncingFolder, setSyncingFolder] = useState(false);
  const [diffSnapshot, setDiffSnapshot] = useState<PhaseSnapshot | null>(null);

  const fileList = useMemo(() => (project ? Object.keys(project.files) : []), [project]);
  const activePath = selectedFile && project?.files[selectedFile] ? selectedFile : fileList[0] || null;
  const previewHtml = useMemo(() => (project ? buildBundledPreviewHtml(project) : ''), [project]);

  React.useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.data?.type === 'PWA_PREVIEW_ERR') {
        setConsoleLogs((prev) => [`[Runtime Error] ${String(ev.data.msg)}`, ...prev.slice(0, 14)]);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  if (!open) return null;

  const folderLabel = project
    ? `Documents/${getLocalSaveFolder()}/${slugifyProjectName(project.project_name)}/`
    : `Documents/${getLocalSaveFolder()}/`;

  const handleSyncFolderNow = async () => {
    if (!project) return;
    setSyncingFolder(true);
    const projectReports = reports.filter((r) => r.projectId === project.id);
    const res = await syncAllProjectFilesToLocalFolder(project, projectReports);
    setSyncingFolder(false);
    if (res.nativeOk) {
      onToast(`Synced ${res.syncedFiles} files & ${res.syncedReports} reports to ${res.folderPath}`);
    } else {
      onToast('Web preview mode: use Save .zip to download files locally');
    }
  };

  const handleSaveLocally = async () => {
    if (!project) return;
    const msg = await saveZipLocally(project);
    onToast(msg);
  };

  const handleGenerateIcons = () => {
    if (!project) return;
    const assets = generatePwaIconsAndManifest(project.project_name);
    onAddGeneratedAssets(assets);
    onToast('Generated SVG PWA icons & manifest.webmanifest');
  };

  const handleShipGitHub = async () => {
    if (!project) return;
    setShipping(true);
    try {
      const res = await shipProjectToGitHub(project, githubConfig, (msg) => onToast(msg));
      onToast(`Shipped ${res.pushedCount} files to GitHub`);
    } catch (err) {
      onToast((err as Error).message);
    } finally {
      setShipping(false);
    }
  };

  return (
    <div className={`absolute inset-0 z-20 flex flex-col backdrop-blur-2xl p-4 ${t.overlay}`}>
      <div className="flex items-center justify-between pb-3 border-b border-current/10 shrink-0 gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-none truncate">Workspace &amp; Local Sync</h3>
          <p className="text-[11px] opacity-60 mt-1 truncate">
            {project ? `${project.project_name} / ${fileList.length} files` : 'No active project'}
          </p>
        </div>
        {project && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={syncingFolder}
              onClick={() => void handleSyncFolderNow()}
              className={`px-2.5 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer ${t.primaryBtn}`}
            >
              {syncingFolder ? 'Syncing...' : 'Sync Folder'}
            </button>
            <button
              type="button"
              onClick={handleGenerateIcons}
              className={`px-2.5 py-1.5 rounded-full text-[11px] font-medium border cursor-pointer ${t.secondaryBtn}`}
            >
              + Icons
            </button>
          </div>
        )}
      </div>

      {/* Active Local Folder Path Bar */}
      <div className={`mt-2.5 rounded-2xl border px-3 py-2 flex items-center justify-between gap-2 text-[10px] font-mono ${t.surface}`}>
        <span className="truncate opacity-75">{folderLabel}</span>
        {onOpenFolderPicker && (
          <button
            type="button"
            onClick={onOpenFolderPicker}
            className="text-accent font-semibold shrink-0 cursor-pointer hover:underline"
          >
            Change
          </button>
        )}
      </div>

      <div className="py-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className={`inline-flex p-1 rounded-full ${t.tabWrap}`}>
          <button
            type="button"
            onClick={() => setTab('files')}
            className={`px-3 py-1 rounded-full text-[11px] font-medium cursor-pointer ${tab === 'files' ? t.tabActive : t.tabIdle}`}
          >
            Code ({fileList.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('preview')}
            className={`px-3 py-1 rounded-full text-[11px] font-medium cursor-pointer ${tab === 'preview' ? t.tabActive : t.tabIdle}`}
          >
            Preview
          </button>
          <button
            type="button"
            onClick={() => setTab('snapshots')}
            className={`px-3 py-1 rounded-full text-[11px] font-medium cursor-pointer ${tab === 'snapshots' ? t.tabActive : t.tabIdle}`}
          >
            Snapshots ({project?.snapshots?.length || 0})
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!project}
            onClick={() => void handleSaveLocally()}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium border cursor-pointer disabled:opacity-40 ${t.secondaryBtn}`}
          >
            Save .zip
          </button>
          <button
            type="button"
            disabled={!project || shipping}
            onClick={() => void handleShipGitHub()}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer disabled:opacity-40 ${t.primaryBtn}`}
          >
            {shipping ? 'Shipping...' : 'Ship GitHub'}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-28 space-y-3">
        {!project ? (
          <div className={`rounded-2xl border p-6 text-center text-xs opacity-65 ${t.surface}`}>
            No active project selected. Open one from the Project Hub or start a New Project with Cali.
          </div>
        ) : tab === 'files' ? (
          fileList.length === 0 ? (
            <div className={`rounded-2xl border p-6 text-center text-xs opacity-65 ${t.surface}`}>
              Project initialized. Start production to generate files into IndexedDB and your local folder.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                {fileList.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setSelectedFile(f)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-mono border shrink-0 cursor-pointer ${
                      activePath === f ? t.primaryBtn : t.secondaryBtn
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              {activePath && (
                <div className={`rounded-2xl border overflow-hidden ${t.surface}`}>
                  <div className="px-3.5 py-2 border-b border-current/10 text-[11px] font-mono flex items-center justify-between gap-2">
                    <span className="truncate opacity-75">{activePath}</span>
                    {onOpenCanvas && (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenCanvas({
                            category: 'CODE CANVAS',
                            title: activePath,
                            subtitle: `${project.project_name} / ${project.files[activePath].split('\n').length} lines`,
                            content: project.files[activePath],
                            mode: 'code',
                            filename: activePath
                          })
                        }
                        className="text-accent font-semibold shrink-0 cursor-pointer hover:underline"
                      >
                        Full Canvas
                      </button>
                    )}
                  </div>
                  <pre className="p-3.5 text-[11px] font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-words max-h-[48vh]">
                    {project.files[activePath]}
                  </pre>
                </div>
              )}
            </>
          )
        ) : tab === 'preview' ? (
          <div className="space-y-3">
            {previewHtml ? (
              <iframe
                title="Multi-File Live Preview"
                sandbox="allow-scripts allow-same-origin allow-forms"
                srcDoc={previewHtml}
                className="w-full h-[46vh] rounded-2xl border border-current/15 bg-white"
              />
            ) : (
              <div className={`rounded-2xl border p-5 text-xs opacity-65 text-center ${t.surface}`}>
                No <code>index.html</code> found in workspace yet.
              </div>
            )}

            <div className={`rounded-2xl border p-3 space-y-2 ${t.surface}`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider opacity-60">
                  Preview Console ({consoleLogs.length})
                </span>
                {consoleLogs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onSendErrorToDebugger(consoleLogs.join('\n'))}
                    className={`px-3 py-1 rounded-full text-[11px] font-semibold cursor-pointer ${t.primaryBtn}`}
                  >
                    Send Error to Debugger
                  </button>
                )}
              </div>
              {consoleLogs.length === 0 ? (
                <p className="text-[11px] opacity-55 font-mono">Zero runtime errors detected.</p>
              ) : (
                <div className="space-y-1 max-h-28 overflow-y-auto font-mono text-[10px] text-rose-400">
                  {consoleLogs.map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {project.snapshots.length === 0 ? (
              <div className={`rounded-2xl border p-5 text-xs opacity-65 text-center ${t.surface}`}>
                Snapshots are saved automatically after every passing Phase Gate.
              </div>
            ) : (
              project.snapshots.map((snap) => (
                <div key={snap.id} className={`rounded-2xl border p-3.5 flex items-center justify-between gap-2 ${t.surface}`}>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{snap.phase_name}</div>
                    <div className="text-[10px] font-mono opacity-60">
                      {snap.file_count} files / {new Date(snap.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setDiffSnapshot(snap)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-medium border cursor-pointer ${t.secondaryBtn}`}
                    >
                      Diff
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onRequestConfirm({
                          title: `Roll back to Phase ${snap.phase_id}?`,
                          message: `Replace current workspace files with the ${snap.file_count} files from "${snap.phase_name}"?`,
                          confirmLabel: 'Roll Back Files',
                          onConfirm: () => onRollbackSnapshot(snap)
                        })
                      }
                      className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-rose-600/20 text-rose-400 border border-rose-500/40 hover:bg-rose-600 hover:text-white cursor-pointer"
                    >
                      Rollback
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {project && (
          <div className="rounded-2xl border border-rose-500/35 bg-rose-950/20 p-3.5 flex items-center justify-between gap-3 mt-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-400">Danger Zone</div>
              <div className="text-xs opacity-80">Delete "{project.project_name}" permanently</div>
            </div>
            <button
              type="button"
              onClick={() =>
                onRequestConfirm({
                  title: `Delete "${project.project_name}"?`,
                  message: 'This permanently deletes all generated files, phases, and snapshots for this project.',
                  confirmLabel: 'Delete Project',
                  onConfirm: () => onDeleteProject(project.id)
                })
              }
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer shrink-0"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      <SnapshotDiffModal
        snapshot={diffSnapshot}
        currentFiles={project?.files || {}}
        onClose={() => setDiffSnapshot(null)}
        t={t}
      />
    </div>
  );
};
