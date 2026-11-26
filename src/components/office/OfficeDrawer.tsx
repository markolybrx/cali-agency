import React, { useEffect, useRef, useState } from 'react';
import type { KeySlotState, TelemetrySummary } from '../../types/agency';
import type { ThemeTokens } from '../../theme/themes';
import {
  OFFICE_HEIGHT,
  OFFICE_WIDTH,
  type PacketFlight,
  type PixelSpriteAgent,
  renderPixelOffice,
  stepOfficeSimulation
} from './pixelOffice';

interface MiniOfficeProps {
  agentsRef: React.MutableRefObject<PixelSpriteAgent[]>;
  packetsRef: React.MutableRefObject<PacketFlight[]>;
  onOpenFull: () => void;
}

export const MiniOfficePreview: React.FC<MiniOfficeProps> = ({ agentsRef, packetsRef, onOpenFull }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let raf = 0;
    let tick = 0;
    const loop = () => {
      tick += 1;
      stepOfficeSimulation(agentsRef.current, packetsRef.current, tick);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) renderPixelOffice(ctx, agentsRef.current, packetsRef.current, tick, null);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [agentsRef, packetsRef]);

  return (
    <button
      type="button"
      onClick={onOpenFull}
      className="w-full overflow-hidden rounded-2xl border border-current/15 relative group cursor-pointer block"
    >
      <canvas
        ref={canvasRef}
        width={OFFICE_WIDTH}
        height={OFFICE_HEIGHT}
        className="w-full h-36 object-cover pixel-art block"
      />
      <span className="absolute bottom-2 right-2 px-2.5 py-1 rounded-full bg-black/75 text-white text-[10px] font-semibold backdrop-blur">
        Expand Full Office
      </span>
    </button>
  );
};

interface OfficeDrawerProps {
  open: boolean;
  onClose: () => void;
  t: ThemeTokens;
  keys: KeySlotState[];
  telemetry: TelemetrySummary;
  agentsRef: React.MutableRefObject<PixelSpriteAgent[]>;
  packetsRef: React.MutableRefObject<PacketFlight[]>;
  onTriggerDemoHandoff: () => void;
  onRunDemoSprint: () => void;
  onOpenTelemetry: () => void;
}

export const OfficeDrawer: React.FC<OfficeDrawerProps> = ({
  open,
  onClose,
  t,
  keys,
  telemetry,
  agentsRef,
  packetsRef,
  onTriggerDemoHandoff,
  onRunDemoSprint,
  onOpenTelemetry
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [viewMode, setViewMode] = useState<'canvas' | 'grid'>('canvas');
  const [selectedAgent, setSelectedAgent] = useState<PixelSpriteAgent | null>(null);

  useEffect(() => {
    if (!open || viewMode !== 'canvas') return;
    let raf = 0;
    let tick = 0;
    const loop = () => {
      tick += 1;
      stepOfficeSimulation(agentsRef.current, packetsRef.current, tick);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) renderPixelOffice(ctx, agentsRef.current, packetsRef.current, tick, selectedAgent?.id || null);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [open, viewMode, agentsRef, packetsRef, selectedAgent?.id]);

  if (!open) return null;

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * OFFICE_WIDTH;
    const sy = ((e.clientY - rect.top) / rect.height) * OFFICE_HEIGHT;
    const hit = agentsRef.current.find((a) => Math.hypot(a.x - sx, a.y - 10 - sy) < 26);
    setSelectedAgent(hit ? { ...hit } : null);
  };

  return (
    <div className={`absolute inset-0 z-30 flex flex-col backdrop-blur-2xl ${t.overlay}`}>
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-current/10 flex items-center justify-between gap-2 shrink-0">
        <div>
          <h3 className="text-base font-semibold leading-none">Cali AI Office</h3>
          <p className="text-[11px] opacity-60 mt-1">13 Pixel Agents + Cali Executive Suite</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'canvas' ? 'grid' : 'canvas')}
            className={`px-2.5 py-1.5 rounded-full text-[11px] font-medium border cursor-pointer ${t.secondaryBtn}`}
          >
            {viewMode === 'canvas' ? 'Mobile Grid' : 'Floorplan'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full border border-current/15 opacity-75 hover:opacity-100 cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Top Sticky API Limit & Token/RPM/RPD/Context HUD */}
      <div className="px-4 py-2.5 border-b border-current/10 space-y-2 shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {keys.map((k) => {
            const cd = k.cooldownUntil ? Math.max(0, Math.ceil((k.cooldownUntil - Date.now()) / 1000)) : 0;
            const dot =
              k.status === 'ACTIVE'
                ? 'bg-violet-400'
                : k.status === 'READY'
                ? 'bg-emerald-400'
                : k.status === 'COOLDOWN' || k.status === 'BACKOFF'
                ? 'bg-amber-400'
                : k.status === 'INVALID'
                ? 'bg-rose-500'
                : 'bg-zinc-500';
            return (
              <button
                key={k.id}
                type="button"
                onClick={onOpenTelemetry}
                className={`px-2.5 py-1 rounded-full text-[10px] font-mono border shrink-0 flex items-center gap-1.5 cursor-pointer ${t.subtleBadge}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                <span>{k.id === 'KEY_CALI' ? 'CALI' : k.id}</span>
                <span className="opacity-65">
                  {cd > 0 ? `${cd}s` : `${k.rpmTimestamps.length}rpm`}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between text-[10px] font-mono opacity-75">
          <span>TOK: {telemetry.totalTokens.toLocaleString()}</span>
          <span>RPM: {telemetry.activeRpm}</span>
          <span>RPD: {telemetry.totalRpd}</span>
          <span>CTX: {telemetry.contextPercent}%</span>
        </div>
      </div>

      {/* Main Office View */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {viewMode === 'canvas' ? (
          <div className="rounded-2xl overflow-hidden border border-current/15 shadow-xl bg-[#3D2716]">
            <canvas
              ref={canvasRef}
              width={OFFICE_WIDTH}
              height={OFFICE_HEIGHT}
              onClick={handleCanvasClick}
              className="w-full h-auto block pixel-art cursor-pointer"
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {agentsRef.current.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelectedAgent({ ...a })}
                className={`rounded-2xl border p-3 text-left space-y-1.5 cursor-pointer ${
                  selectedAgent?.id === a.id ? t.accentCard : t.surface
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold truncate">{a.shortName}</span>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      a.state === 'CODING'
                        ? 'bg-emerald-400'
                        : a.state === 'BLOCKED'
                        ? 'bg-rose-500'
                        : a.state !== 'IDLE'
                        ? 'bg-amber-400'
                        : 'bg-zinc-500'
                    }`}
                  />
                </div>
                <div className="text-[10px] opacity-65 truncate">{a.roleLabel}</div>
                <div className="text-[10px] font-mono text-accent uppercase">{a.state}</div>
              </button>
            ))}
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onTriggerDemoHandoff}
            className={`flex-1 py-2 rounded-full text-xs font-medium border cursor-pointer ${t.secondaryBtn}`}
          >
            Simulate Handoff
          </button>
          <button
            type="button"
            onClick={onRunDemoSprint}
            className={`flex-1 py-2 rounded-full text-xs font-semibold cursor-pointer ${t.primaryBtn}`}
          >
            Run Demo Sprint
          </button>
        </div>

        {/* Selected Agent Inspector Card */}
        {selectedAgent && (
          <div className={`rounded-2xl border p-3.5 space-y-1.5 ${t.accentCard}`}>
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold">
                {selectedAgent.shortName} — {selectedAgent.roleLabel}
              </div>
              <span className="text-[10px] font-mono uppercase text-accent">{selectedAgent.state}</span>
            </div>
            <p className="text-[11px] opacity-80">
              {selectedAgent.speech || 'Standing by at desk for next Master Orchestrator ticket.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
