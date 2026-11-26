import React, { useMemo, useState } from 'react';
import type { PhaseSnapshot } from '../../types/agency';
import type { ThemeTokens } from '../../theme/themes';

interface SnapshotDiffModalProps {
  snapshot: PhaseSnapshot | null;
  currentFiles: Record<string, string>;
  onClose: () => void;
  t: ThemeTokens;
}

type FileStatus = 'ADDED' | 'REMOVED' | 'MODIFIED' | 'UNCHANGED';

interface DiffLine {
  type: 'same' | 'add' | 'del';
  oldNum: number | null;
  newNum: number | null;
  text: string;
}

function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const a = oldText ? oldText.split('\n') : [];
  const b = newText ? newText.split('\n') : [];
  const maxLen = Math.max(a.length, b.length);
  const lines: DiffLine[] = [];

  // Fast bounded LCS for clean diffs up to 400 lines; fallback to line alignment above
  if (a.length <= 350 && b.length <= 350) {
    const m = a.length;
    const n = b.length;
    const dp: Uint16Array[] = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (a[i] === b[j]) {
        lines.push({ type: 'same', oldNum: i + 1, newNum: j + 1, text: a[i] });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        lines.push({ type: 'del', oldNum: i + 1, newNum: null, text: a[i] });
        i++;
      } else {
        lines.push({ type: 'add', oldNum: null, newNum: j + 1, text: b[j] });
        j++;
      }
    }
    while (i < m) {
      lines.push({ type: 'del', oldNum: i + 1, newNum: null, text: a[i] });
      i++;
    }
    while (j < n) {
      lines.push({ type: 'add', oldNum: null, newNum: j + 1, text: b[j] });
      j++;
    }
    return lines;
  }

  for (let k = 0; k < maxLen; k++) {
    const oa = a[k];
    const nb = b[k];
    if (oa === nb) {
      lines.push({ type: 'same', oldNum: k + 1, newNum: k + 1, text: oa ?? '' });
    } else {
      if (oa !== undefined) lines.push({ type: 'del', oldNum: k + 1, newNum: null, text: oa });
      if (nb !== undefined) lines.push({ type: 'add', oldNum: null, newNum: k + 1, text: nb });
    }
  }
  return lines;
}

export const SnapshotDiffModal: React.FC<SnapshotDiffModalProps> = ({
  snapshot,
  currentFiles,
  onClose,
  t
}) => {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [layout, setLayout] = useState<'unified' | 'split'>('unified');

  const fileEntries = useMemo(() => {
    if (!snapshot) return [];
    const allPaths = Array.from(new Set([...Object.keys(snapshot.files), ...Object.keys(currentFiles)])).sort();
    return allPaths.map((p) => {
      const inSnap = p in snapshot.files;
      const inCur = p in currentFiles;
      let status: FileStatus = 'UNCHANGED';
      if (!inSnap && inCur) status = 'ADDED';
      else if (inSnap && !inCur) status = 'REMOVED';
      else if (snapshot.files[p] !== currentFiles[p]) status = 'MODIFIED';
      return { path: p, status };
    });
  }, [snapshot, currentFiles]);

  const activeFile = useMemo(() => {
    if (selectedFile && fileEntries.some((f) => f.path === selectedFile)) return selectedFile;
    const firstChanged = fileEntries.find((f) => f.status !== 'UNCHANGED');
    return firstChanged?.path || fileEntries[0]?.path || null;
  }, [selectedFile, fileEntries]);

  const diffLines = useMemo(() => {
    if (!snapshot || !activeFile) return [];
    return computeLineDiff(snapshot.files[activeFile] || '', currentFiles[activeFile] || '');
  }, [snapshot, activeFile, currentFiles]);

  if (!snapshot) return null;

  const badgeFor = (st: FileStatus) => {
    if (st === 'ADDED') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/35';
    if (st === 'REMOVED') return 'bg-rose-500/20 text-rose-400 border-rose-500/35';
    if (st === 'MODIFIED') return 'bg-amber-500/20 text-amber-300 border-amber-500/35';
    return 'bg-current/5 opacity-55 border-current/15';
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col p-3 bg-black/75 backdrop-blur-md">
      <div className={`flex-1 rounded-3xl border border-current/15 flex flex-col overflow-hidden shadow-2xl ${t.overlay}`}>
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-current/10 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <div className="text-[10px] font-mono uppercase tracking-widest text-accent">
              Snapshot Diff • Phase {snapshot.phase_id} vs Current
            </div>
            <h3 className="text-sm font-semibold truncate">{snapshot.phase_name}</h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className={`inline-flex p-0.5 rounded-full ${t.tabWrap}`}>
              <button
                type="button"
                onClick={() => setLayout('unified')}
                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold cursor-pointer ${layout === 'unified' ? t.tabActive : t.tabIdle}`}
              >
                Unified
              </button>
              <button
                type="button"
                onClick={() => setLayout('split')}
                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold cursor-pointer ${layout === 'split' ? t.tabActive : t.tabIdle}`}
              >
                Split
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={`px-3 py-1.5 rounded-full text-xs border cursor-pointer ${t.secondaryBtn}`}
            >
              Close
            </button>
          </div>
        </div>

        {/* File Tabs */}
        <div className="px-4 py-2.5 border-b border-current/10 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          {fileEntries.map((f) => (
            <button
              key={f.path}
              type="button"
              onClick={() => setSelectedFile(f.path)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-mono border shrink-0 flex items-center gap-1.5 cursor-pointer ${
                activeFile === f.path ? t.primaryBtn : t.secondaryBtn
              }`}
            >
              <span>{f.path}</span>
              <span className={`px-1.5 py-0.2 rounded text-[8px] border ${badgeFor(f.status)}`}>{f.status[0]}</span>
            </button>
          ))}
        </div>

        {/* Diff Body */}
        <div className="flex-1 overflow-auto p-3 font-mono text-[10px] leading-relaxed">
          {!activeFile ? (
            <p className="text-xs opacity-60 text-center py-8">No files to compare.</p>
          ) : layout === 'unified' ? (
            <div className={`rounded-2xl border overflow-hidden ${t.surface}`}>
              {diffLines.map((ln, idx) => (
                <div
                  key={idx}
                  className={`px-2.5 py-0.5 flex gap-2 whitespace-pre-wrap break-all ${
                    ln.type === 'add'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : ln.type === 'del'
                      ? 'bg-rose-500/15 text-rose-300'
                      : 'opacity-75'
                  }`}
                >
                  <span className="w-6 text-right opacity-45 shrink-0 select-none">{ln.oldNum ?? ''}</span>
                  <span className="w-6 text-right opacity-45 shrink-0 select-none">{ln.newNum ?? ''}</span>
                  <span className="w-3 shrink-0 select-none">{ln.type === 'add' ? '+' : ln.type === 'del' ? '-' : ' '}</span>
                  <span className="flex-1">{ln.text}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className={`rounded-2xl border overflow-hidden ${t.surface}`}>
                <div className="px-2.5 py-1.5 border-b border-current/10 text-[9px] uppercase opacity-60">
                  Phase {snapshot.phase_id} Snapshot
                </div>
                {diffLines
                  .filter((l) => l.type !== 'add')
                  .map((ln, idx) => (
                    <div
                      key={idx}
                      className={`px-2 py-0.5 flex gap-1.5 whitespace-pre-wrap break-all ${
                        ln.type === 'del' ? 'bg-rose-500/15 text-rose-300' : 'opacity-75'
                      }`}
                    >
                      <span className="w-5 text-right opacity-45 shrink-0">{ln.oldNum}</span>
                      <span className="flex-1">{ln.text}</span>
                    </div>
                  ))}
              </div>
              <div className={`rounded-2xl border overflow-hidden ${t.surface}`}>
                <div className="px-2.5 py-1.5 border-b border-current/10 text-[9px] uppercase opacity-60">
                  Current Workspace
                </div>
                {diffLines
                  .filter((l) => l.type !== 'del')
                  .map((ln, idx) => (
                    <div
                      key={idx}
                      className={`px-2 py-0.5 flex gap-1.5 whitespace-pre-wrap break-all ${
                        ln.type === 'add' ? 'bg-emerald-500/15 text-emerald-300' : 'opacity-75'
                      }`}
                    >
                      <span className="w-5 text-right opacity-45 shrink-0">{ln.newNum}</span>
                      <span className="flex-1">{ln.text}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
