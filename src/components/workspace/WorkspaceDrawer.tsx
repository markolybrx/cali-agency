import React, { useMemo, useState } from 'react';
import type { ProjectState } from '../../types/agency';
import type { ThemeTokens } from '../../theme/themes';
import { exportProjectZip, type GitHubConfig, shipProjectToGitHub } from '../../engine/storage';

interface WorkspaceDrawerProps {
  open: boolean;
  onClose: () => void;
  t: ThemeTokens;
  project: ProjectState | null;
  githubConfig: GitHubConfig;
  onSendErrorToDebugger: (errorLog: string) => void;
  onToast: (msg: string) => void;
}

export const WorkspaceDrawer: React.FC<WorkspaceDrawerProps> = ({
  open,
  onClose,
  t,
  project,
  githubConfig,
  onSendErrorToDebugger,
  onToast
}) => {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [tab, setTab] = useState<'files' | 'preview'>('files');
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [shipping, setShipping] = useState(false);

  const fileList = useMemo(() => (project ? Object.keys(project.files) : []), [project]);
  const activePath = selectedFile && project?.files[selectedFile] ? selectedFile : fileList[0] || null;

  const previewHtml = useMemo(() => {
    if (!project) return '';
    const html = project.files['index.html'] || project.files['public/index.html'] || '';
    if (!html) return '';
    const errorHook = `<script>
      window.onerror = function(msg, src, line) {
        parent.postMessage({ type: 'PWA_PREVIEW_ERR', msg: msg + ' (line ' + line + ')' }, '*');
      };
      const origErr = console.error;
      console.error = function(...args) {
        parent.postMessage({ type: 'PWA_PREVIEW_ERR', msg: args.join(' ') }, '*');
        origErr.apply(console, args);
      };
    </script>`;
    return html.includes('<head>') ? html.replace('<head>', `<head>${errorHook}`) : `${errorHook}${html}`;
  }, [project]);

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

  const handleShipGitHub = async () => {
    if (!project) return;
    setShipping(true);
    try {
      const res = await shipProjectToGitHub(project, githubConfig, (msg) => onToast(msg));
      onToast(`Shipped ${res.pushedCount} files to GitHub!`);
    } catch (err) {
      onToast((err as Error).message);
    } finally {
      setShipping(false);
    }
  };

  return (
    <div className={`absolute inset-0 z-30 flex flex-col backdrop-blur-2xl p-4 ${t.overlay}`}>
      <div className="flex items-center justify-between pb-3 border-b border-current/10 shrink-0">
        <div>
          <h3 className="text-base font-semibold leading-none">Workspace &amp; Ship</h3>
          <p className="text-[11px] opacity-60 mt-1">
            {project ? `${project.project_name} • ${fileList.length} files` : 'No active project'}
          </p>
        </div>
        <button type="button" onClick={onClose} className="p-2 rounded-full border border-current/15 cursor-pointer">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Mode Switcher + Actions */}
      <div className="py-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className={`inline-flex p-1 rounded-full ${t.tabWrap}`}>
          <button
            type="button"
            onClick={() => setTab('files')}
            className={`px-3 py-1 rounded-full text-[11px] font-medium cursor-pointer ${
              tab === 'files' ? t.tabActive : t.tabIdle
            }`}
          >
            Code ({fileList.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('preview')}
            className={`px-3 py-1 rounded-full text-[11px] font-medium cursor-pointer ${
              tab === 'preview' ? t.tabActive : t.tabIdle
            }`}
          >
            Live Preview
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!project}
            onClick={() => project && exportProjectZip(project)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium border cursor-pointer disabled:opacity-40 ${t.secondaryBtn}`}
          >
            Export .zip
          </button>
          <button
            type="button"
            disabled={!project || shipping}
            onClick={handleShipGitHub}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer disabled:opacity-40 ${t.primaryBtn}`}
          >
            {shipping ? 'Shipping…' : 'Ship to GitHub'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
        {!project || fileList.length === 0 ? (
          <div className={`rounded-2xl border p-6 text-center text-xs opacity-65 ${t.surface}`}>
            No files generated yet. Launch a Blueprint or run Demo Sprint to populate the workspace.
          </div>
        ) : tab === 'files' ? (
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
                <div className="px-3.5 py-2 border-b border-current/10 text-[11px] font-mono opacity-65 flex justify-between">
                  <span>{activePath}</span>
                  <span>{project.files[activePath].split('\n').length} lines</span>
                </div>
                <pre className="p-3.5 text-[11px] font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-words max-h-[55vh]">
                  {project.files[activePath]}
                </pre>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            {previewHtml ? (
              <iframe
                title="Live PWA Sandbox"
                sandbox="allow-scripts"
                srcDoc={previewHtml}
                className="w-full h-[46vh] rounded-2xl border border-current/15 bg-white"
              />
            ) : (
              <div className={`rounded-2xl border p-5 text-xs opacity-65 text-center ${t.surface}`}>
                No <code>index.html</code> found in workspace yet.
              </div>
            )}

            {/* Live Console + Send to Debugger */}
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
                    Send Error to 09. Debugger
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
        )}
      </div>
    </div>
  );
};
