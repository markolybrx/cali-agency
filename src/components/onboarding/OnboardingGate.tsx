import React, { useState } from 'react';
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
  t: ThemeTokens;
}

export const OnboardingGate: React.FC<OnboardingGateProps> = ({
  profile,
  messages,
  busy,
  onSend,
  onToast,
  t
}) => {
  const [input, setInput] = useState('');
  const [showKeyBox, setShowKeyBox] = useState(false);
  const [caliKeyDraft, setCaliKeyDraft] = useState(() => keyPool.getSlot('KEY_CALI').apiKey);

  const completed = countCompletedTopics(profile);
  const topics = [
    { key: 'name_vibe', label: 'Name & Vibe', done: profile.onboarding_topics.name_vibe },
    { key: 'design_taste', label: 'UI Taste', done: profile.onboarding_topics.design_taste },
    { key: 'tech_stack', label: 'Tech Stack', done: profile.onboarding_topics.tech_stack },
    { key: 'autonomy', label: 'Autonomy', done: profile.onboarding_topics.autonomy }
  ];

  const handleSaveCaliKey = () => {
    keyPool.setKeyConfig('KEY_CALI', caliKeyDraft);
    setShowKeyBox(false);
    onToast('KEY_CALI saved — Cali is live!');
  };

  return (
    <div className={`w-full h-full flex flex-col relative overflow-hidden ${t.shell}`}>
      <div className={`pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[360px] h-[220px] rounded-full blur-3xl opacity-25 ${t.glow}`} />

      {/* Top Onboarding Header + Accurate 0/4 Progress */}
      <div className="relative z-10 px-5 pt-5 pb-3.5 border-b border-current/10 space-y-3 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className={`w-2.5 h-2.5 rounded-full ${t.dot}`} />
            <div>
              <h1 className="text-lg font-semibold leading-none">Meet Cali</h1>
              <p className="text-[11px] opacity-60 mt-1">Executive Onboarding • {completed} of 4 covered</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowKeyBox((v) => !v)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium border cursor-pointer ${t.secondaryBtn}`}
          >
            {keyPool.getSlot('KEY_CALI').apiKey ? 'KEY_CALI ✓' : 'Set KEY_CALI'}
          </button>
        </div>

        {/* 4-Topic Progress Strip (Starts at 0/4 — ONLY lights up when actually answered!) */}
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
