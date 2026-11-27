import React, { useRef } from 'react';
import type { ThemeTokens } from '../../theme/themes';
import { APP_VERSION_TAG } from '../../version';

interface LoginGateProps {
  onContinueGoogle: () => void;
  onContinueLocal: () => void;
  onRestoreBackupFile: (file: File) => void;
  onOpenVaultUnlock?: () => void;
  t: ThemeTokens;
}

export const LoginGate: React.FC<LoginGateProps> = ({
  onContinueGoogle,
  onContinueLocal,
  onRestoreBackupFile,
  onOpenVaultUnlock,
  t
}) => {
  const restoreRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className={`w-full h-full flex flex-col justify-between p-6 relative overflow-y-auto ${t.shell}`}>
      <div className={`pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[340px] h-[200px] rounded-full blur-3xl opacity-25 ${t.glow}`} />

      <div className="relative z-10 pt-8 space-y-3">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${t.primaryBtn}`}>
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3l2.15 6.85L21 12l-6.85 2.15L12 21l-2.15-6.85L3 12l6.85-2.15L12 3z" />
          </svg>
        </div>
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold border ${t.subtleBadge}`}>
          <span>CALI AGENCY HQ</span>
          <span>/</span>
          <span>{APP_VERSION_TAG}</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight leading-tight">
          Your Autonomous<br />AI Software House.
        </h1>
        <p className="text-sm opacity-70 leading-relaxed">
          Sign in to sync your 3-Layer JARVIS Cali Brain across devices, or continue offline-first with durable local storage on your phone.
        </p>
      </div>

      <div className="relative z-10 space-y-3 py-6">
        <button
          type="button"
          onClick={onContinueGoogle}
          className={`w-full py-3.5 px-4 rounded-2xl font-semibold text-sm shadow-lg flex items-center justify-center gap-2.5 cursor-pointer ${t.primaryBtn}`}
        >
          <span>Continue with Google Sign-In</span>
        </button>

        <button
          type="button"
          onClick={onContinueLocal}
          className={`w-full py-3.5 px-4 rounded-2xl border font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer ${t.surface}`}
        >
          <span>Continue with Local Save (Offline)</span>
        </button>

        <div className="pt-2 flex items-center justify-between text-xs opacity-70 px-1">
          <div className="flex items-center gap-3">
            {onOpenVaultUnlock && (
              <button
                type="button"
                onClick={onOpenVaultUnlock}
                className="text-accent font-semibold hover:underline cursor-pointer"
              >
                Unlock Vault (.enc)
              </button>
            )}
            <button
              type="button"
              onClick={() => restoreRef.current?.click()}
              className="hover:underline cursor-pointer"
            >
              Restore Backup
            </button>
          </div>
          <span className="font-mono text-[10px]">IndexedDB + Local Folder</span>
          <input
            ref={restoreRef}
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onRestoreBackupFile(f);
              e.target.value = '';
            }}
            className="hidden"
          />
        </div>
      </div>

      <div className={`relative z-10 rounded-2xl border p-3.5 flex items-center justify-between text-xs ${t.surface}`}>
        <div>
          <div className="font-semibold">Offline-First Architecture</div>
          <div className="text-[11px] opacity-65">Projects, code, and reports stay accessible even without internet.</div>
        </div>
      </div>
    </div>
  );
};
