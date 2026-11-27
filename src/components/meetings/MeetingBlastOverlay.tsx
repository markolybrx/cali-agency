import React, { useEffect } from 'react';

export interface MeetingState {
  active: boolean;
  kind: 'emergency' | 'boardroom';
  caller: 'ceo' | 'cali';
  reason: string;
  showBlast: boolean;
  showBoardroom: boolean;
  wasRunningBefore: boolean;
}

interface MeetingBlastOverlayProps {
  meeting: MeetingState;
  onEnterBoardroom: () => void;
}

function playSynthAlert(isEmergency: boolean): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = isEmergency ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(isEmergency ? 520 : 440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(isEmergency ? 210 : 660, ctx.currentTime + 0.36);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.42);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.44);
  } catch {
    // ignore audio autoplay blocks
  }
}

export const MeetingBlastOverlay: React.FC<MeetingBlastOverlayProps> = ({ meeting, onEnterBoardroom }) => {
  useEffect(() => {
    if (meeting.active && meeting.showBlast) {
      playSynthAlert(meeting.kind === 'emergency');
    }
  }, [meeting.active, meeting.showBlast, meeting.kind]);

  if (!meeting.active || !meeting.showBlast) return null;

  const isEmergency = meeting.kind === 'emergency';
  const stripeClass = isEmergency ? 'hazard-stripes-emergency' : 'hazard-stripes-boardroom';
  const callerTag =
    isEmergency && meeting.caller === 'cali'
      ? 'CALLED BY CALI (COO) / CRITICAL BUG'
      : isEmergency
      ? 'CALLED BY MARK (FOUNDER & CEO)'
      : 'BOARDROOM CALLED / PRODUCTION PAUSED';

  return (
    <div className="absolute inset-0 z-50 bg-black/92 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
      <div className={`w-full h-7 rounded-md mb-6 ${stripeClass}`} />

      <div className="blast-pop space-y-4 max-w-xs">
        <div
          className={`w-20 h-20 mx-auto rounded-full text-white flex items-center justify-center ${
            isEmergency
              ? 'bg-rose-600 shadow-[0_0_50px_rgba(225,29,72,0.75)]'
              : 'bg-[#6D28D9] shadow-[0_0_50px_rgba(139,92,246,0.75)]'
          }`}
        >
          <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            {isEmergency ? (
              <>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </>
            ) : (
              <>
                <rect x="3" y="4" width="18" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="18" x2="12" y2="21" />
              </>
            )}
          </svg>
        </div>

        <div
          className={`inline-block px-3 py-1 rounded-full border text-[10px] font-mono font-bold tracking-widest uppercase ${
            isEmergency
              ? 'bg-rose-600/25 border-rose-500 text-rose-200'
              : 'bg-violet-600/25 border-violet-400 text-violet-200'
          }`}
        >
          {callerTag}
        </div>

        <h2 className="text-3xl font-extrabold text-white tracking-tight uppercase">
          {isEmergency ? 'EMERGENCY MEETING' : 'BOARDROOM CALLED'}
        </h2>

        <p className="text-xs text-zinc-300 leading-relaxed">{meeting.reason}</p>

        <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
          All 24 Staff Halted — Resumes After Adjournment
        </div>

        <button
          type="button"
          onClick={onEnterBoardroom}
          className="w-full py-3 rounded-full bg-white text-zinc-950 font-bold text-xs shadow-xl cursor-pointer active:scale-95 transition"
        >
          Enter Glass Boardroom
        </button>
      </div>

      <div className={`w-full h-7 rounded-md mt-6 ${stripeClass}`} />
    </div>
  );
};
