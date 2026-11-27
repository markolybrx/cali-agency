import React, { useRef, useState } from 'react';
import type { ThemeTokens } from '../../theme/themes';
import {
  decryptVaultEnvelope,
  downloadEncryptedVaultFile,
  type EncryptedVaultEnvelope,
  getRuntimeVaultPassphrase,
  hasLocalEncryptedVault,
  isDevicePassphraseRemembered,
  loadLocalEncryptedEnvelope,
  pullEncryptedVaultFromCloudIfConnected,
  readEncryptedVaultFromAndroidFolder,
  setRuntimeVaultPassphrase,
  type VaultPayload
} from '../../engine/cryptoVault';
import { getLocalSaveFolder } from '../../engine/localSave';

interface VaultModalProps {
  open: boolean;
  onClose: () => void;
  onBuildCurrentPayload: () => VaultPayload;
  onSealWithPassphrase: (passphrase: string, remember: boolean) => Promise<void>;
  onRestoreDecryptedPayload: (payload: VaultPayload, passphrase: string, remember: boolean) => void;
  onToast: (msg: string) => void;
  t: ThemeTokens;
}

export const VaultModal: React.FC<VaultModalProps> = ({
  open,
  onClose,
  onSealWithPassphrase,
  onRestoreDecryptedPayload,
  onToast,
  t
}) => {
  const unlockedPass = getRuntimeVaultPassphrase();
  const [tab, setTab] = useState<'setup' | 'unlock'>(hasLocalEncryptedVault() && !unlockedPass ? 'unlock' : 'setup');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [remember, setRemember] = useState<boolean>(() => isDevicePassphraseRemembered() || true);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  const folderPath = `Documents/${getLocalSaveFolder()}/cali-vault.enc.json`;

  const handleSeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passphrase.length < 4) {
      onToast('Use at least 4 characters for your Vault Passphrase');
      return;
    }
    if (passphrase !== confirmPass) {
      onToast('Passphrases do not match');
      return;
    }
    setBusy(true);
    try {
      await onSealWithPassphrase(passphrase, remember);
      setPassphrase('');
      setConfirmPass('');
      onClose();
    } catch (err) {
      onToast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleUnlockExisting = async (sourceEnvelope?: EncryptedVaultEnvelope) => {
    if (!passphrase.trim()) {
      onToast('Enter your Vault Passphrase first');
      return;
    }
    setBusy(true);
    try {
      let env = sourceEnvelope || (await readEncryptedVaultFromAndroidFolder()) || loadLocalEncryptedEnvelope();
      if (!env) {
        env = await pullEncryptedVaultFromCloudIfConnected();
      }
      if (!env) {
        onToast('No encrypted vault found yet. Pick a .enc.json file or create one first.');
        setBusy(false);
        return;
      }
      const payload = await decryptVaultEnvelope(env, passphrase);
      onRestoreDecryptedPayload(payload, passphrase, remember);
      setPassphrase('');
      onClose();
    } catch (err) {
      onToast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleFilePicked = async (file: File) => {
    if (!passphrase.trim()) {
      onToast('Type your Vault Passphrase above before choosing the .enc.json file');
      return;
    }
    try {
      const text = await file.text();
      const env = JSON.parse(text) as EncryptedVaultEnvelope;
      await handleUnlockExisting(env);
    } catch {
      onToast('Could not read encrypted vault JSON file');
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-end sm:items-center justify-center p-3 bg-black/75 backdrop-blur-md">
      <div className={`w-full max-w-md rounded-3xl border border-current/15 p-5 space-y-4 shadow-2xl max-h-[88%] flex flex-col ${t.overlay}`}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-accent font-semibold">
              AES-256-GCM Zero-Knowledge
            </div>
            <h3 className="text-base font-bold">Encrypted Keys &amp; Brain Vault</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`px-3 py-1 rounded-full text-xs border cursor-pointer ${t.secondaryBtn}`}
          >
            Done
          </button>
        </div>

        <div className={`grid grid-cols-2 gap-1 p-1 rounded-full ${t.tabWrap}`}>
          <button
            type="button"
            onClick={() => setTab('setup')}
            className={`py-1.5 rounded-full text-xs font-semibold cursor-pointer ${tab === 'setup' ? t.tabActive : t.tabIdle}`}
          >
            Encrypt &amp; Save
          </button>
          <button
            type="button"
            onClick={() => setTab('unlock')}
            className={`py-1.5 rounded-full text-xs font-semibold cursor-pointer ${tab === 'unlock' ? t.tabActive : t.tabIdle}`}
          >
            Unlock / Restore
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3">
          <div className={`rounded-2xl border p-3 text-[11px] space-y-1 ${t.surface}`}>
            <div className="font-semibold">Status: {unlockedPass ? 'Unlocked in RAM (Auto-Encrypting)' : 'Locked / Not Configured'}</div>
            <div className="opacity-65 font-mono text-[10px] truncate">Mirror: {folderPath}</div>
            <p className="opacity-70 leading-relaxed pt-0.5">
              Encrypts your 5 API keys, detected models, GitHub PAT, and Cali Brain locally. Cali reads them in RAM while unlocked; disk &amp; cloud store ciphertext only.
            </p>
          </div>

          {tab === 'setup' ? (
            <form onSubmit={handleSeal} className="space-y-2.5">
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="New Vault Passphrase (min 4 chars)"
                className={`w-full px-3.5 py-2.5 rounded-2xl text-xs border focus:outline-none ${t.input}`}
              />
              <input
                type="password"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                placeholder="Confirm Vault Passphrase"
                className={`w-full px-3.5 py-2.5 rounded-2xl text-xs border focus:outline-none ${t.input}`}
              />
              <label className="flex items-center gap-2 text-xs opacity-80 px-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="rounded"
                />
                <span>Remember unlock key on this trusted device</span>
              </label>
              <button
                type="submit"
                disabled={busy}
                className={`w-full py-2.5 rounded-full text-xs font-semibold cursor-pointer disabled:opacity-50 ${t.primaryBtn}`}
              >
                {busy ? 'Encrypting...' : 'Encrypt & Auto-Save Vault Locally'}
              </button>
              {loadLocalEncryptedEnvelope() && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const env = loadLocalEncryptedEnvelope();
                      if (env) void downloadEncryptedVaultFile(env);
                      onToast('Downloaded cali-vault.enc.json');
                    }}
                    className={`py-2 rounded-full text-[11px] font-medium border cursor-pointer ${t.secondaryBtn}`}
                  >
                    Export .enc.json
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRuntimeVaultPassphrase(null, false);
                      onToast('Vault locked in RAM');
                      onClose();
                    }}
                    className={`py-2 rounded-full text-[11px] font-medium border cursor-pointer ${t.secondaryBtn}`}
                  >
                    Lock Vault Now
                  </button>
                </div>
              )}
            </form>
          ) : (
            <div className="space-y-2.5">
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Enter your Vault Passphrase"
                className={`w-full px-3.5 py-2.5 rounded-2xl text-xs border focus:outline-none ${t.input}`}
              />
              <label className="flex items-center gap-2 text-xs opacity-80 px-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="rounded"
                />
                <span>Remember unlock key on this trusted device</span>
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleUnlockExisting()}
                className={`w-full py-2.5 rounded-full text-xs font-semibold cursor-pointer disabled:opacity-50 ${t.primaryBtn}`}
              >
                {busy ? 'Decrypting...' : 'Unlock Local / Folder Vault'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className={`w-full py-2.5 rounded-full text-xs font-medium border cursor-pointer ${t.secondaryBtn}`}
              >
                Pick cali-vault.enc.json File
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFilePicked(f);
                  e.target.value = '';
                }}
                className="hidden"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
