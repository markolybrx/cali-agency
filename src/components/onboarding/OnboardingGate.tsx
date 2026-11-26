import React, { useEffect, useRef, useState } from 'react';
import type { ChatMessage, UserProfile } from '../../types/agency';
import type { ThemeTokens } from '../../theme/themes';
import { countCompletedTopics } from '../../engine/storage';
import { keyPool } from '../../engine/keyPool';

interface OnboardingGateProps {
  profile: UserProfile;
  messages: ChatMessage[];
  busy: boolean;
  onSend: (text: string) => void;
  onToast: (msg: string) => void;
  onOpenSignIn?: () => void;
  onRestoreBackupFile?: (file: File) => void;
  onFinishOnboarding?: () => void;
  t: ThemeTokens;
}

export const OnboardingGate: React.FC<OnboardingGateProps> = ({
  profile,
  messages,
  busy,
  onSend,
  onToast,
  onOpenSignIn,
  onRestoreBackupFile,
  onFinishOnboarding,
  t
}) => {
  const [input, setInput] = useState('');
  const [showKeyBox, setShowKeyBox] = useState(false);
  const [caliKeyDraft, setCaliKeyDraft] = useState(() => keyPool.getSlot('KEY_CALI').apiKey);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const restoreInputRef = useRef<HTMLInputElement | null>(null);

  const completed = countCompletedTopics(profile);
  const userReplies = messages.filter((m) => m.role === 'user').length;
  const readyToUnlock = completed >= 4 || userReplies >= 4;

  const topics = [
    { key: 'name_vibe', label: 'Name & Vibe', done: profile.onboarding_topics.name_vibe },
    { key: 'design_taste', label: 'UI Taste', done: profile.onboarding_topics.design_taste },
    { key: 'tech_stack', label: 'Tech Stack', done: profile.onboarding_topics.tech_stack },
    { key: 'autonomy', label: 'Autonomy', done: profile.onboarding_topics.autonomy }
  ];

  // Auto-scroll to latest message & thinking indicator so Q4 response is never hidden
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, busy, readyToUnlock]);

  const handleSaveCaliKey = () => {
    keyPool.setKeyConfig('KEY_CALI', caliKeyDraft);
    setShowKeyBox(false);
    onToast('KEY_CALI saved — Cali is live!');
  };

  return (
    <div className={`w-full h-full flex flex-col relative overflow-hidden ${t.shell}`}>
      <div className={`pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[360px] h-[220px] rounded-full blur-3xl opacity-25 ${t.glow}`} />

      {/* Top Onboarding Header + Sign-In / Restore Entry + Accurate 0/4 Progress */}
      <div className="relative z-10 px-4 pt-4 pb-3 border-b border-current/10 space-y-2.5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${t.dot}`} />
            <div className="min-w-0">
              <h1 className="text-lg font-semibold leading-none truncate">Meet Cali</h1>
              <p className="text-[11px] opacity-60 mt-1">Onboarding • {Math.min(4, Math.max(completed, Math.min(4, userReplies)))} of 4 covered</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenSignIn && (
              <button
                type="button"
                onClick={onOpenSignIn}
                className={`px-2.5 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer ${t.primaryBtn}`}
              >
                Sign In
              </button>
            )}
            {onRestoreBackupFile && (
              <>
                <button
                  type="button"
                  onClick={() => restoreInputRef.current?.click()}
                  className={`px-2.5 py-1.5 rounded-full text-[11px] font-medium border cursor-pointer ${t.secondaryBtn}`}
                >
                  Restore
                </button>
                <input
                  ref={restoreInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onRestoreBackupFile(f);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
              </>
            )}
            <button
              type="button"
              onClick={() => setShowKeyBox((v) => !v)}
              className={`px-2.5 py-1.5 rounded-full text-[11px] font-medium border cursor-pointer ${t.secondaryBtn}`}
            >
              {keyPool.getSlot('KEY_CALI').apiKey ? 'Key ✓' : 'Key'}
            </button>
          </div>
        </div>

        {/* 4-Topic Progress Strip */}
        <div className="grid grid-cols-4 gap-1.5">
          {topics.map((tp) => (
            <div key={tp.key} className="space-y-1">
              <div className={`h-1.5 rounded-full transition-colors ${tp.done ? t.dot : 'bg-current/15'}`} />
              <div className={`text-[9px] truncate ${tp.done ? 'text-accent font-semibold' : 'opacity-55'}`}>
                {tp.done ? '✓ ' : ''}{tp.label}
              </div>
            </div>
          ))}
        </div>

        {/* Optional Inline KEY_CALI Setup */}
        {showKeyBox && (
          <div className={`rounded-2xl border p-3 space-y-2 ${t.surface}`}>
            <div className="text-[10px] font-semibold uppercase tracking-wider opacity-60">
              Dedicated KEY_CALI (Optional for live AI onboarding)
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={caliKeyDraft}
                onChange={(e) => setCaliKeyDraft(e.target.value)}
                placeholder="Paste AQ.xxxx or AIza... key"
                className={`flex-1 px-3 py-2 rounded-xl text-xs border focus:outline-none ${t.input}`}
              />
              <button
                type="button"
                onClick={handleSaveCaliKey}
                className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer ${t.primaryBtn}`}
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Conversational Thread */}
      <div className="relative z-10 flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[86%] rounded-3xl border px-4 py-3 text-[13px] leading-relaxed ${m.role === 'user' ? t.userBubble : t.caliBubble}`}>
              {m.text}
            </div>
            {m.meta && <span className="text-[10px] opacity-45 mt-1 px-2">{m.meta}</span>}
          </div>
        ))}

        {/* Live Thinking Indicator */}
        {busy && (
          <div className="flex flex-col items-start">
            <div className={`rounded-3xl border px-4 py-3 text-xs opacity-80 flex items-center gap-2 ${t.caliBubble}`}>
              <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
              <span>Cali is thinking…</span>
            </div>
          </div>
        )}

        {/* Guaranteed Unlock Banner once 4 turns are answered */}
        {readyToUnlock && !busy && onFinishOnboarding && (
          <div className={`rounded-2xl border p-4 space-y-2.5 ${t.accentCard}`}>
            <div className="text-xs font-semibold">All set — your Cali profile is ready!</div>
            <button
              type="button"
              onClick={onFinishOnboarding}
              className={`w-full py-2.5 rounded-full text-xs font-semibold cursor-pointer ${t.primaryBtn}`}
            >
              Enter Monolith HQ Dashboard →
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim() || busy) return;
          const txt = input;
          setInput('');
          onSend(txt);
        }}
        className="relative z-10 px-4 py-4 border-t border-current/10 flex items-center gap-2 shrink-0"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Reply naturally to Cali..."
          className={`flex-1 px-4 py-3 rounded-full text-xs sm:text-sm border focus:outline-none ${t.input}`}
        />
        <button
          type="submit"
          disabled={busy}
          className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50 ${t.primaryBtn}`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        </button>
      </form>
    </div>
  );
};
