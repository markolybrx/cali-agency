import React from 'react';
import type { ThemeTokens } from '../../theme/themes';
import type { CoachingSession } from '../../engine/workplaceCulture';

interface CoachingLogsModalProps {
  open: boolean;
  sessions: CoachingSession[];
  onTriggerDemoCoaching: () => void;
  onClose: () => void;
  t: ThemeTokens;
}

export const CoachingLogsModal: React.FC<CoachingLogsModalProps> = ({
  open,
  sessions,
  onTriggerDemoCoaching,
  onClose,
  t
}) => {
  if (!open) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-end sm:items-center justify-center p-3 bg-black/70 backdrop-blur-md">
      <div className={`w-full max-w-md rounded-3xl border border-current/15 p-5 space-y-4 shadow-2xl max-h-[85%] flex flex-col ${t.overlay}`}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-accent font-semibold">
              Coaching Pods &amp; Huddles
            </div>
            <h3 className="text-base font-bold">1-on-1 &amp; Squad Coaching</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onTriggerDemoCoaching}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer ${t.primaryBtn}`}
            >
              + Run Pod
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`px-3 py-1 rounded-full text-xs border cursor-pointer ${t.secondaryBtn}`}
            >
              Done
            </button>
          </div>
        </div>

        <p className="text-xs opacity-70 leading-relaxed">
          Whenever Static Pre-Check or Staff Code Reviewer catches a defect, the specialist's Team Lead runs a quick 1-on-1 coaching session before retry. Complex splits trigger Squad Whiteboard Huddles.
        </p>

        <div className="flex-1 overflow-y-auto space-y-3">
          {sessions.length === 0 ? (
            <div className={`rounded-2xl border p-6 text-center text-xs opacity-65 ${t.surface}`}>
              Zero coaching interventions needed so far. Tap + Run Pod above to test a 1-on-1 coaching log.
            </div>
          ) : (
            sessions.map((c) => (
              <div key={c.id} className={`rounded-2xl border p-3.5 space-y-1.5 ${t.surface}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono uppercase font-semibold text-accent">
                    {c.kind === 'squad_huddle' ? 'SQUAD HUDDLE' : '1-ON-1 COACHING POD'} / {c.taskId}
                  </span>
                  <span className="text-[10px] font-mono opacity-55">
                    {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="text-xs font-semibold">
                  {c.coachLabel} -&gt; {c.coacheeLabel}
                </div>
                <div className="text-[11px] opacity-75">Trigger: {c.triggerReason}</div>
                <div className="text-[11px] opacity-90 pt-1 border-t border-current/10">
                  Takeaway: {c.takeaway}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
