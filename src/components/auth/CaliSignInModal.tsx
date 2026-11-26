import React, { useState } from 'react';
import type { ThemeTokens } from '../../theme/themes';
import {
  type CaliBrainCache,
  loadSupabaseConfig,
  saveSupabaseConfig,
  signInWithEmail,
  signInWithGoogle,
  signOutCaliBrain,
  signUpWithEmail
} from '../../engine/caliBrain';

interface CaliSignInModalProps {
  open: boolean;
  onClose: () => void;
  brain: CaliBrainCache;
  onSyncNow: () => Promise<void>;
  onToast: (msg: string) => void;
  t: ThemeTokens;
}

export const CaliSignInModal: React.FC<CaliSignInModalProps> = ({
  open,
  onClose,
  brain,
  onSyncNow,
  onToast,
  t
}) => {
  const initialCfg = loadSupabaseConfig();
  const [tab, setTab] = useState<'auth' | 'config'>(initialCfg.url && initialCfg.anonKey ? 'auth' : 'config');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [supaUrl, setSupaUrl] = useState(initialCfg.url);
  const [supaKey, setSupaKey] = useState(initialCfg.anonKey);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const isConfigured = Boolean(supaUrl.trim() && supaKey.trim());

  const handleSaveConfig = () => {
    saveSupabaseConfig({ url: supaUrl, anonKey: supaKey });
    onToast('Supabase Brain config saved');
    if (supaUrl.trim() && supaKey.trim()) setTab('auth');
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    const res = mode === 'signin' ? await signInWithEmail(email, password) : await signUpWithEmail(email, password);
    onToast(res.detail);
    if (res.ok && mode === 'signin') {
      await onSyncNow();
      onClose();
    }
    setBusy(false);
  };

  const handleGoogleAuth = async () => {
    setBusy(true);
    const res = await signInWithGoogle();
    onToast(res.detail);
    setBusy(false);
  };

  const handleSignOut = async () => {
    setBusy(true);
    await signOutCaliBrain();
    await onSyncNow();
    onToast('Signed out (local projects remain safe on-device)');
    setBusy(false);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-end sm:items-center justify-center p-3 bg-black/75 backdrop-blur-md">
      <div className={`w-full max-w-md rounded-3xl border border-current/15 p-5 space-y-4 shadow-2xl max-h-[88%] flex flex-col ${t.overlay}`}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-accent">3-Layer JARVIS Brain</div>
            <h3 className="text-base font-semibold">Cali Cloud Sign-In</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`px-3 py-1.5 rounded-full text-xs border cursor-pointer ${t.secondaryBtn}`}
          >
            Done
          </button>
        </div>

        {/* Mode Tabs */}
        <div className={`grid grid-cols-2 gap-1 p-1 rounded-full ${t.tabWrap}`}>
          <button
            type="button"
            onClick={() => setTab('auth')}
            className={`py-1.5 rounded-full text-xs font-medium cursor-pointer ${tab === 'auth' ? t.tabActive : t.tabIdle}`}
          >
            Account
          </button>
          <button
            type="button"
            onClick={() => setTab('config')}
            className={`py-1.5 rounded-full text-xs font-medium cursor-pointer ${tab === 'config' ? t.tabActive : t.tabIdle}`}
          >
            Supabase Setup
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3.5">
          {tab === 'config' ? (
            <div className="space-y-3">
              <p className="text-xs opacity-75 leading-relaxed">
                Connect your free Supabase project so Cali syncs your Private Vault &amp; Shared Brain across all your devices and future apps. Works 100% offline when disconnected.
              </p>
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase opacity-60">Supabase Project URL</label>
                <input
                  value={supaUrl}
                  onChange={(e) => setSupaUrl(e.target.value)}
                  placeholder="https://xxxxx.supabase.co"
                  className={`w-full px-3.5 py-2.5 rounded-2xl text-xs border focus:outline-none ${t.input}`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase opacity-60">Publishable Anon Key</label>
                <input
                  type="password"
                  value={supaKey}
                  onChange={(e) => setSupaKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIs..."
                  className={`w-full px-3.5 py-2.5 rounded-2xl text-xs border focus:outline-none ${t.input}`}
                />
              </div>
              <button
                type="button"
                onClick={handleSaveConfig}
                className={`w-full py-2.5 rounded-full text-xs font-semibold cursor-pointer ${t.primaryBtn}`}
              >
                Save Supabase Config
              </button>
            </div>
          ) : brain.signedIn ? (
            <div className="space-y-3">
              <div className={`rounded-2xl border p-4 space-y-2 ${t.accentCard}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold truncate">{brain.email || 'Signed-In User'}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${t.primaryBtn}`}>
                    {brain.clearance}
                  </span>
                </div>
                <div className="text-[11px] opacity-75">
                  Shared Brain: {brain.sharedMemories.length} approved
                  {brain.clearance === 'BOSS' ? ` • ${brain.pendingShared.length} pending review` : ''}
                </div>
                <div className="text-[10px] font-mono opacity-60">
                  {navigator.onLine ? 'Online' : 'Offline (Cached)'} • Last sync:{' '}
                  {brain.lastSyncedAt ? new Date(brain.lastSyncedAt).toLocaleTimeString() : 'Never'}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await onSyncNow();
                    onToast('Cali Brain synced');
                    setBusy(false);
                  }}
                  className={`py-2.5 rounded-full text-xs font-semibold cursor-pointer ${t.primaryBtn}`}
                >
                  {busy ? 'Syncing…' : 'Sync Now'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleSignOut}
                  className={`py-2.5 rounded-full text-xs font-medium border cursor-pointer ${t.secondaryBtn}`}
                >
                  Sign Out
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {!isConfigured && (
                <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-3 text-[11px] text-amber-200">
                  Add your Supabase URL &amp; Anon Key in the <strong>Supabase Setup</strong> tab first to enable cloud sign-in.
                </div>
              )}

              <button
                type="button"
                disabled={busy || !isConfigured}
                onClick={handleGoogleAuth}
                className={`w-full py-2.5 rounded-full text-xs font-semibold border flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 ${t.secondaryBtn}`}
              >
                <span>Continue with Google</span>
              </button>

              <div className="flex items-center gap-2 text-[10px] opacity-50">
                <div className="flex-1 h-px bg-current/20" />
                <span>OR EMAIL</span>
                <div className="flex-1 h-px bg-current/20" />
              </div>

              <form onSubmit={handleEmailAuth} className="space-y-2.5">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={`w-full px-3.5 py-2.5 rounded-2xl text-xs border focus:outline-none ${t.input}`}
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password (min 6 chars)"
                  className={`w-full px-3.5 py-2.5 rounded-2xl text-xs border focus:outline-none ${t.input}`}
                />
                <button
                  type="submit"
                  disabled={busy || !isConfigured}
                  className={`w-full py-2.5 rounded-full text-xs font-semibold cursor-pointer disabled:opacity-40 ${t.primaryBtn}`}
                >
                  {busy ? 'Please wait…' : mode === 'signin' ? 'Sign In & Sync Brain' : 'Create Cali Account'}
                </button>
              </form>

              <button
                type="button"
                onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
                className="w-full text-center text-[11px] text-accent hover:underline cursor-pointer"
              >
                {mode === 'signin' ? 'Need an account? Sign Up' : 'Already have an account? Sign In'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
