import React, { useState } from 'react';
import type { StorageDirectoryConfig, StorageRootId } from '../../types/agency';
import type { ThemeTokens } from '../../theme/themes';
import { getDirectoryTreeSummary, initializeDirectoryTree, saveStorageConfig } from '../../engine/localSave';

interface DirectoryPickerModalProps {
  open: boolean;
  initialConfig: StorageDirectoryConfig;
  canDismiss: boolean;
  onSaved: (cfg: StorageDirectoryConfig, statusMsg: string) => void;
  onClose: () => void;
  t: ThemeTokens;
}

export const DirectoryPickerModal: React.FC<DirectoryPickerModalProps> = ({
  open,
  initialConfig,
  canDismiss,
  onSaved,
  onClose,
  t
}) => {
  const [root, setRoot] = useState<StorageRootId>(initialConfig.root);
  const [baseFolder, setBaseFolder] = useState(initialConfig.baseFolder);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const previewCfg: StorageDirectoryConfig = { root, baseFolder: baseFolder.trim() || 'CaliAgency', configured: true };
  const paths = getDirectoryTreeSummary(previewCfg);

  const handleConfirm = async () => {
    setSaving(true);
    const saved = saveStorageConfig(previewCfg);
    const msg = await initializeDirectoryTree(saved);
    setSaving(false);
    onSaved(saved, msg);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className={`w-full max-w-md rounded-3xl border border-current/15 p-5 space-y-4 shadow-2xl ${t.overlay}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-accent">Cali Storage Setup</div>
            <h3 className="text-base font-semibold mt-0.5">Choose Projects &amp; Backup Directory</h3>
            <p className="text-[11px] opacity-65 mt-1">
              Where should Cali save all generated project folders, cached states, and memory backups?
            </p>
          </div>
          {canDismiss && (
            <button
              type="button"
              onClick={onClose}
              className={`px-2.5 py-1 rounded-full text-xs border cursor-pointer ${t.secondaryBtn}`}
            >
              Cancel
            </button>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider opacity-60">1. Storage Root</div>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                ['DOCUMENTS', 'Documents'],
                ['EXTERNAL', 'Shared /0'],
                ['DATA', 'App Private']
              ] as Array<[StorageRootId, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setRoot(id)}
                className={`py-2 rounded-2xl text-xs font-medium border cursor-pointer ${
                  root === id ? t.primaryBtn : t.secondaryBtn
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider opacity-60">2. Root Folder Name</div>
          <input
            value={baseFolder}
            onChange={(e) => setBaseFolder(e.target.value)}
            placeholder="CaliAgency"
            className={`w-full px-3.5 py-2.5 rounded-2xl text-xs font-mono border focus:outline-none ${t.input}`}
          />
        </div>

        <div className={`rounded-2xl border p-3 space-y-1 text-[10px] font-mono ${t.surface}`}>
          <div className="opacity-55 uppercase text-[9px] font-sans font-semibold">Auto-Created Local Structure</div>
          <div className="truncate"><span className="text-accent">Projects:</span> {paths.projects}/&lt;slug&gt;</div>
          <div className="truncate"><span className="text-accent">Cache:</span> {paths.cache}/</div>
          <div className="truncate"><span className="text-accent">Backups:</span> {paths.backups}/</div>
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={handleConfirm}
          className={`w-full py-3 rounded-full text-xs font-semibold cursor-pointer disabled:opacity-50 ${t.primaryBtn}`}
        >
          {saving ? 'Initializing Folders…' : 'Confirm Local Directory'}
        </button>
      </div>
    </div>
  );
};
