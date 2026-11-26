import React, { useState } from 'react';
import type { KeySlotState, TelemetrySummary } from '../../types/agency';
import type { ThemeTokens } from '../../theme/themes';
import { keyPool } from '../../engine/keyPool';
import { type DiagnosticCheck, runRcDiagnosticsSuite } from '../../engine/diagnostics';

interface TelemetryDrawerProps {
  open: boolean;
  t: ThemeTokens;
  keys: KeySlotState[];
  telemetry: TelemetrySummary;
  onToast: (msg: string) => void;
}

export const TelemetryDrawer: React.FC<TelemetryDrawerProps> = ({
  open,
  t,
  keys,
  telemetry,
  onToast
}) => {
  const [testing, setTesting] = useState(false);
  const [diagResults, setDiagResults] = useState<DiagnosticCheck[]>([]);

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
    onToast(`Health & model scan done: ${okCount} healthy keys`);
  };

  const handleRunDiagnostics = () => {
    const checks = runRcDiagnosticsSuite();
    setDiagResults(checks);
    const passed = checks.filter((c) => c.passed).length;
    onToast(`RC Diagnostics: ${passed}/${checks.length} subsystems passed`);
  };

  return (
    <div className={`absolute inset-0 z-20 flex flex-col backdrop-blur-2xl p-4 ${t.overlay}`}>
      <div className="pb-3 border-b border-current/10 shrink-0">
        <h3 className="text-base font-semibold leading-none">Telemetry &amp; RC Diagnostics</h3>
        <p className="text-[11px] opacity-60 mt-1">Rolling 60s RPM • Daily RPD • Context Window • Stress-Test</p>
      </div>

      <div className="flex-1 overflow-y-auto py-4 pb-28 space-y-4">
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

        <div className={`rounded-2xl border p-3.5 space-y-2 ${t.surface}`}>
          <div className="flex justify-between text-[11px]">
            <span className="font-medium">Peak Context Window (1M cap)</span>
            <span className="font-mono opacity-70">{telemetry.lastCallContextTokens.toLocaleString()} tok</span>
          </div>
          <div className="w-full h-2 rounded-full bg-current/10 overflow-hidden">
            <div className={`h-full rounded-full ${t.dot}`} style={{ width: `${Math.max(2, telemetry.contextPercent)}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            disabled={testing}
            onClick={handleTestAll}
            className={`py-2.5 rounded-full text-xs font-semibold cursor-pointer disabled:opacity-50 ${t.primaryBtn}`}
          >
            {testing ? 'Probing 5 Keys…' : 'Test All 5 Keys & Models'}
          </button>
          <button
            type="button"
            onClick={handleRunDiagnostics}
            className={`py-2.5 rounded-full text-xs font-semibold border cursor-pointer ${t.secondaryBtn}`}
          >
            Run RC Diagnostics Suite
          </button>
        </div>

        {/* RC Diagnostics Results */}
        {diagResults.length > 0 && (
          <div className={`rounded-2xl border p-3.5 space-y-2.5 ${t.accentCard}`}>
            <div className="text-[10px] font-mono uppercase tracking-widest text-accent">
              RC Engine Verification ({diagResults.filter((c) => c.passed).length}/{diagResults.length} Passed)
            </div>
            {diagResults.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-2 text-xs border-t border-current/10 pt-2">
                <div className="min-w-0">
                  <div className="font-semibold flex items-center gap-1.5">
                    <span className={c.passed ? 'text-emerald-400' : 'text-rose-400'}>{c.passed ? 'PASS' : 'FAIL'}</span>
                    <span>{c.name}</span>
                  </div>
                  <div className="text-[10px] opacity-75 mt-0.5">{c.detail}</div>
                </div>
                <span className="text-[10px] font-mono opacity-55 shrink-0">{c.durationMs}ms</span>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2.5">
          {keys.map((k) => {
            const rpmPct = Math.min(100, (k.rpmTimestamps.length / 15) * 100);
            const cd = k.cooldownUntil ? Math.max(0, Math.ceil((k.cooldownUntil - Date.now()) / 1000)) : 0;
            return (
              <div key={k.id} className={`rounded-2xl border p-3.5 space-y-2 ${t.surface}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">
                      {k.id} <span className="opacity-55 font-normal">• {k.selectedModel}</span>
                    </div>
                    <div className="text-[10px] font-mono opacity-60">
                      In: {k.promptTokens.toLocaleString()} • Out: {k.outputTokens.toLocaleString()} • RPD: {k.rpdCount}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono border shrink-0 ${t.subtleBadge}`}>
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
