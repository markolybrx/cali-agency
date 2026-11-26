import React, { useState } from 'react';
import type { KeySlotState, TelemetrySummary } from '../../types/agency';
import type { ThemeTokens } from '../../theme/themes';
import { keyPool } from '../../engine/keyPool';

interface TelemetryDrawerProps {
  open: boolean;
  onClose: () => void;
  t: ThemeTokens;
  keys: KeySlotState[];
  telemetry: TelemetrySummary;
  onToast: (msg: string) => void;
}

export const TelemetryDrawer: React.FC<TelemetryDrawerProps> = ({
  open,
  onClose,
  t,
  keys,
  telemetry,
  onToast
}) => {
  const [testing, setTesting] = useState(false);

  if (!open) return null;

  const handleTestAll = async () => {
    setTesting(true);
    let okCount = 0;
    for (const k of keys) {
      if (!k.apiKey) continue;
      const res = await keyPool.testKeyHealth(k.id);
      if (res.ok) okCount += 1;
    }
    setTesting(false);
    onToast(`Health check done: ${okCount} healthy keys`);
  };

  return (
    <div className={`absolute inset-0 z-30 flex flex-col backdrop-blur-2xl p-4 ${t.overlay}`}>
      <div className="flex items-center justify-between pb-3 border-b border-current/10 shrink-0">
        <div>
          <h3 className="text-base font-semibold leading-none">Telemetry &amp; 5-Key Health</h3>
          <p className="text-[11px] opacity-60 mt-1">Rolling 60s RPM • Daily RPD • Context Window</p>
        </div>
        <button type="button" onClick={onClose} className="p-2 rounded-full border border-current/15 cursor-pointer">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {/* Global Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className={`rounded-2xl border p-3 ${t.surface}`}>
            <div className="text-[10px] uppercase opacity-55">Total Tokens</div>
            <div className="text-sm font-mono font-semibold mt-1">{telemetry.totalTokens.toLocaleString()}</div>
          </div>
          <div className={`rounded-2xl border p-3 ${t.surface}`}>
            <div className="text-[10px] uppercase opacity-55">Rolling RPM</div>
            <div className="text-sm font-mono font-semibold mt-1">{telemetry.activeRpm} / 60</div>
          </div>
          <div className={`rounded-2xl border p-3 ${t.surface}`}>
            <div className="text-[10px] uppercase opacity-55">Daily RPD</div>
            <div className="text-sm font-mono font-semibold mt-1">{telemetry.totalRpd}</div>
          </div>
          <div className={`rounded-2xl border p-3 ${t.surface}`}>
            <div className="text-[10px] uppercase opacity-55">Context Fill</div>
            <div className="text-sm font-mono font-semibold mt-1 text-accent">{telemetry.contextPercent}%</div>
          </div>
        </div>

        {/* Context Bar */}
        <div className={`rounded-2xl border p-3.5 space-y-2 ${t.surface}`}>
          <div className="flex justify-between text-[11px]">
            <span className="font-medium">Peak Context Window (1M cap)</span>
            <span className="font-mono opacity-70">{telemetry.lastCallContextTokens.toLocaleString()} tok</span>
          </div>
          <div className="w-full h-2 rounded-full bg-current/10 overflow-hidden">
            <div className={`h-full rounded-full ${t.dot}`} style={{ width: `${Math.max(2, telemetry.contextPercent)}%` }} />
          </div>
        </div>

        {/* Test All Button */}
        <button
          type="button"
          disabled={testing}
          onClick={handleTestAll}
          className={`w-full py-2.5 rounded-full text-xs font-semibold cursor-pointer disabled:opacity-50 ${t.primaryBtn}`}
        >
          {testing ? 'Probing All Configured Keys…' : 'Test All 5 Keys Now'}
        </button>

        {/* Per-Key Breakdown */}
        <div className="space-y-2.5">
          {keys.map((k) => {
            const rpmPct = Math.min(100, (k.rpmTimestamps.length / 15) * 100);
            const cd = k.cooldownUntil ? Math.max(0, Math.ceil((k.cooldownUntil - Date.now()) / 1000)) : 0;
            return (
              <div key={k.id} className={`rounded-2xl border p-3.5 space-y-2 ${t.surface}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold">
                      {k.id} <span className="opacity-55 font-normal">• {k.label}</span>
                    </div>
                    <div className="text-[10px] font-mono opacity-60">
                      In: {k.promptTokens.toLocaleString()} • Out: {k.outputTokens.toLocaleString()} • RPD: {k.rpdCount}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${t.subtleBadge}`}>
                    {cd > 0 ? `COOLDOWN ${cd}s` : k.status}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-current/10 overflow-hidden">
                  <div className={`h-full rounded-full ${t.dot}`} style={{ width: `${rpmPct}%` }} />
                </div>
                {k.lastError && <div className="text-[10px] text-rose-400 font-mono truncate">{k.lastError}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
