import React, { useEffect, useRef, useState } from 'react';
import { AGENCY_PROMPTS } from '../../prompts/agencyPrompts';
import type { AgencyActivity, AgentId, ApiKeySlot } from '../../types/agency';
import { createInitialWorkers, stepOfficeSimulation, type SimWorker } from './officeSim';

interface Props {
  open: boolean;
  onClose: () => void;
  keys: ApiKeySlot[];
  latestActivity: AgencyActivity | null;
  running: boolean;
  onToggleRun: () => void;
  onStepOnce: () => void;
}

const DESK_COORDS: Array<[number, number]> = [
  [150, 165], [325, 165], [500, 165],
  [150, 290], [325, 290], [500, 290],
  [150, 415], [325, 415]
];

export const OfficeDrawer: React.FC<Props> = ({
  open,
  onClose,
  keys,
  latestActivity,
  running,
  onToggleRun,
  onStepOnce
}) => {
  const workersRef = useRef<SimWorker[]>(createInitialWorkers());
  const [, setTick] = useState(0);
  const [selectedAgent, setSelectedAgent] = useState<AgentId | null>(null);
  const [viewMode, setViewMode] = useState<'floor' | 'grid'>('floor');

  useEffect(() => {
    if (!latestActivity) return;
    const workers = workersRef.current;
    const actor = workers.find((w) => w.id === latestActivity.fromAgent);
    const target = latestActivity.toAgent ? workers.find((w) => w.id === latestActivity.toAgent) : null;
    const now = Date.now();

    if (actor) {
      actor.speech = latestActivity.summary.slice(0, 48);
      actor.speechUntil = now + 5400;
      if (target) {
        actor.targetX = target.homeX;
        actor.targetY = target.homeY - 12;
        actor.state = 'handoff';
        actor.carryingPacket = true;
      } else {
        actor.targetX = actor.homeX;
        actor.targetY = actor.homeY;
        actor.state = latestActivity.status === 'working' ? 'working' : 'walking';
      }
    }
  }, [latestActivity]);

  useEffect(() => {
    if (!open) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      stepOfficeSimulation(workersRef.current, dt, Date.now());
      setTick((t) => (t + 1) % 10000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [open]);

  if (!open) return null;

  const badgeColor = (status: ApiKeySlot['status']) => {
    if (status === 'ACTIVE') return 'bg-[#8B5CF6]/25 text-violet-200 border-[#8B5CF6]/50';
    if (status === 'READY') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35';
    if (status === 'COOLDOWN') return 'bg-amber-500/15 text-amber-300 border-amber-500/35';
    if (status === 'INVALID' || status === 'RPD_EXHAUSTED') return 'bg-rose-500/15 text-rose-300 border-rose-500/35';
    return 'bg-white/[0.05] text-zinc-400 border-white/[0.1]';
  };

  const workers = workersRef.current;
  const workingCount = workers.filter((w) => w.state === 'working' || w.state === 'handoff').length;
  const inspected = selectedAgent ? AGENCY_PROMPTS[selectedAgent] : null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#17120E]/98 backdrop-blur-2xl text-[#F5EFE6]">
      {/* Top Bar */}
      <div className="px-4 py-3 border-b border-amber-900/40 bg-[#221912] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono font-semibold">
            LIVE
          </span>
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-semibold leading-none truncate">CALI AI OFFICE</h3>
            <p className="text-[10px] text-amber-200/60 mt-1 truncate">
              {workingCount} Working &bull; {workers.length - workingCount} Standby &bull; Tap any character
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'floor' ? 'grid' : 'floor')}
            className="px-2.5 py-1.5 rounded-full text-[11px] font-medium border border-amber-700/40 bg-amber-950/50 text-amber-100"
          >
            {viewMode === 'floor' ? 'Mobile Grid' : 'Floorplan'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full border border-white/15 hover:bg-white/10"
            aria-label="Close office"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* 5-Key API Limit HUD */}
      <div className="px-4 py-2 border-b border-amber-900/30 bg-[#1B140F] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {keys.map((k) => {
          const secs = k.cooldownUntil ? Math.max(0, Math.ceil((k.cooldownUntil - Date.now()) / 1000)) : 0;
          return (
            <div
              key={k.id}
              className={`px-2.5 py-1 rounded-lg border text-[10px] font-mono shrink-0 flex items-center gap-1.5 ${badgeColor(k.status)}`}
            >
              <span className="font-semibold">{k.id === 'KEY_CALI' ? 'CALI' : k.id}</span>
              <span className="opacity-85">{k.status === 'COOLDOWN' ? `${secs}s` : k.status}</span>
              <span className="opacity-50">({k.rpdCount})</span>
            </div>
          );
        })}
      </div>

      {/* Main View: 1:1 Cozy Wooden Pixel-Art Floorplan OR Mobile Grid */}
      {viewMode === 'grid' ? (
        <div className="flex-1 overflow-y-auto p-4 bg-[#D8B48A]/10">
          <div className="grid grid-cols-3 gap-2.5 max-w-md mx-auto">
            {workers.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setSelectedAgent(w.id)}
                className="rounded-2xl border border-amber-800/40 bg-[#2A1F17] p-3 flex flex-col items-center gap-1.5 text-center"
              >
                <div className="w-10 h-10 rounded-full border-2 flex items-center justify-center" style={{ borderColor: w.accentColor, backgroundColor: w.outfitColor }}>
                  <span className="w-4 h-4 rounded-full bg-[#FDE1C3]" />
                </div>
                <span className="text-[10px] font-semibold text-amber-50 truncate w-full">{w.label}</span>
                <span className="text-[9px] font-mono text-amber-300/80 uppercase">{w.state}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-2.5 sm:p-4 flex items-center justify-center">
          <div className="w-full max-w-4xl rounded-2xl border-2 border-[#593822] bg-[#2B1D14] p-2 shadow-2xl">
            <svg viewBox="0 0 880 560" className="w-full h-auto rounded-xl">
              <defs>
                {/* Warm Wooden Plank Floor Pattern */}
                <pattern id="woodPlanks" width="64" height="16" patternUnits="userSpaceOnUse">
                  <rect width="64" height="16" fill="#C98D4E" />
                  <rect y="0" width="64" height="1" fill="#A66D34" fillOpacity="0.55" />
                  <rect x="32" y="0" width="1" height="16" fill="#9A622C" fillOpacity="0.4" />
                  <rect x="0" y="8" width="64" height="8" fill="#BE8244" fillOpacity="0.25" />
                </pattern>
                {/* Conference Room Slate-Teal Carpet */}
                <pattern id="confCarpet" width="16" height="16" patternUnits="userSpaceOnUse">
                  <rect width="16" height="16" fill="#2A4447" />
                  <rect width="8" height="8" fill="#243B3E" />
                </pattern>
              </defs>

              {/* Outer Room Walls & Wood Floor */}
              <rect x="12" y="12" width="856" height="536" rx="8" fill="#462A18" stroke="#2D1A0E" strokeWidth="4" />
              <rect x="28" y="76" width="824" height="456" fill="url(#woodPlanks)" />

              {/* Top Wall Interior Paneling */}
              <rect x="28" y="24" width="824" height="52" fill="#634028" />
              <rect x="28" y="72" width="824" height="6" fill="#3D2414" />

              {/* Kitchenette / Coffee Counter (Top-Left) */}
              <rect x="52" y="42" width="160" height="38" rx="3" fill="#4E321F" stroke="#2C1A0E" strokeWidth="2" />
              <rect x="64" y="48" width="28" height="16" rx="2" fill="#94A3B8" />
              <rect x="108" y="46" width="22" height="20" rx="3" fill="#27272A" />
              <circle cx="119" cy="54" r="3" fill="#EF4444" />
              <rect x="148" y="46" width="46" height="22" rx="2" fill="#785032" />

              {/* Wall Windows & Bookcases (Top-Center) */}
              <rect x="242" y="28" width="110" height="36" rx="2" fill="#E7D7BE" stroke="#4A2E1B" strokeWidth="3" />
              <line x1="297" y1="28" x2="297" y2="64" stroke="#4A2E1B" strokeWidth="3" />
              <rect x="372" y="34" width="90" height="44" fill="#5A3720" stroke="#361F10" strokeWidth="2" />
              <rect x="380" y="42" width="74" height="10" fill="#B45309" />
              <rect x="380" y="56" width="74" height="10" fill="#2563EB" />
              <rect x="476" y="34" width="90" height="44" fill="#5A3720" stroke="#361F10" strokeWidth="2" />
              <rect x="484" y="42" width="74" height="10" fill="#059669" />
              <rect x="484" y="56" width="74" height="10" fill="#DC2626" />

              {/* Restroom Doors (Top-Right) */}
              <rect x="645" y="34" width="38" height="42" rx="2" fill="#7A4B2A" stroke="#3A2212" strokeWidth="2" />
              <circle cx="675" cy="56" r="2.5" fill="#FBBF24" />
              <rect x="705" y="34" width="38" height="42" rx="2" fill="#7A4B2A" stroke="#3A2212" strokeWidth="2" />
              <circle cx="735" cy="56" r="2.5" fill="#FBBF24" />

              {/* Engraved Floor Sign */}
              <text x="325" y="106" textAnchor="middle" fill="#FFF3D6" fillOpacity="0.88" fontSize="13" fontWeight="700" letterSpacing="4">
                CALI AI OFFICE
              </text>

              {/* Soft Sunbeams from Left Windows */}
              <polygon points="28,110 210,165 210,240 28,195" fill="#FFF4CC" fillOpacity="0.11" />
              <polygon points="28,255 210,310 210,385 28,340" fill="#FFF4CC" fillOpacity="0.09" />

              {/* Top-Right Conference / Executive Room (Glass Partition + Carpet + Oval Table) */}
              <rect x="615" y="112" width="234" height="196" fill="url(#confCarpet)" stroke="#1E2E30" strokeWidth="4" />
              <rect x="615" y="298" width="234" height="12" fill="#64748B" fillOpacity="0.55" />
              {/* Oval Wooden Meeting Table */}
              <ellipse cx="740" cy="204" rx="74" ry="44" fill="#8A522C" stroke="#4A2913" strokeWidth="3.5" />
              <ellipse cx="740" cy="200" rx="64" ry="35" fill="#9E6238" fillOpacity="0.5" />

              {/* Bottom-Right Cozy Break Lounge (Glass Wall + Red Sofas + Coffee Table) */}
              <rect x="615" y="330" width="234" height="198" fill="#A6703D" fillOpacity="0.45" stroke="#462A18" strokeWidth="3" />
              <text x="732" y="352" textAnchor="middle" fill="#FEF3C7" fontSize="11" fontWeight="600">BREAK LOUNGE</text>
              {/* Left Red Sofa */}
              <rect x="646" y="408" width="54" height="92" rx="10" fill="#9E3329" stroke="#591A14" strokeWidth="2.5" />
              <rect x="646" y="418" width="16" height="72" rx="6" fill="#7D241C" />
              {/* Right Red Sofa */}
              <rect x="768" y="408" width="54" height="92" rx="10" fill="#9E3329" stroke="#591A14" strokeWidth="2.5" />
              <rect x="806" y="418" width="16" height="72" rx="6" fill="#7D241C" />
              {/* Lounge Coffee Table */}
              <rect x="712" y="430" width="44" height="54" rx="5" fill="#784726" stroke="#422512" strokeWidth="2" />
              <rect x="723" y="446" width="20" height="14" rx="2" fill="#CBD5E1" />

              {/* Glass Double-Door Entrance (Bottom Center-Right) */}
              <rect x="430" y="518" width="140" height="22" fill="#475569" stroke="#1E293B" strokeWidth="2" />
              <rect x="440" y="521" width="56" height="16" fill="#94A3B8" fillOpacity="0.45" />
              <rect x="504" y="521" width="56" height="16" fill="#94A3B8" fillOpacity="0.45" />

              {/* Curved Reception Counter (Row 3, Col 3) */}
              <path d="M432 418 Q432 456 500 456 Q568 456 568 418 L552 418 Q552 440 500 440 Q448 440 448 418 Z" fill="#D4B48C" stroke="#6E4728" strokeWidth="2.5" />
              <rect x="478" y="434" width="44" height="20" rx="3" fill="#27272A" stroke="#18181B" strokeWidth="2" />

              {/* 8 Wooden Office Desks (3x3 Grid minus Reception) */}
              {DESK_COORDS.map(([dx, dy], idx) => (
                <g key={idx}>
                  {/* Green Swivel Chair */}
                  <rect x={dx - 17} y={dy - 20} width="34" height="26" rx="7" fill="#275443" stroke="#163328" strokeWidth="2" />
                  {/* Wooden Desk */}
                  <rect x={dx - 50} y={dy + 4} width="100" height="44" rx="4" fill="#8B5732" stroke="#4D2C16" strokeWidth="2.5" />
                  <rect x={dx - 50} y={dy + 34} width="100" height="14" rx="2" fill="#633A1E" />
                  {/* Monitor */}
                  <rect x={dx - 22} y={dy - 6} width="44" height="28" rx="3" fill="#27272A" stroke="#111113" strokeWidth="2" />
                  <rect x={dx - 17} y={dy - 1} width="34" height="18" rx="1.5" fill="#38BDF8" fillOpacity="0.22" />
                  <rect x={dx - 6} y={dy + 22} width="12" height="5" fill="#18181B" />
                </g>
              ))}

              {/* Potted Plants Around Studio */}
              {[[54, 152], [54, 340], [234, 92], [588, 92], [628, 496], [828, 496]].map(([px, py], i) => (
                <g key={i} transform={`translate(${px}, ${py})`}>
                  <rect x="-8" y="2" width="16" height="13" rx="3" fill="#8D4B28" stroke="#4A2512" strokeWidth="1.5" />
                  <circle cy="-3" r="10" fill="#2F7D46" />
                  <circle cx="-5" cy="-7" r="6" fill="#46A05E" />
                  <circle cx="5" cy="-6" r="5.5" fill="#3B8E52" />
                </g>
              ))}

              {/* Animated Chibi Pixel-Art Workers */}
              {workers.map((w) => {
                const bob = Math.sin(w.bobPhase) * (w.state === 'walking' || w.state === 'handoff' ? 3 : 1);
                const dotColor = w.id === 'cali-director' ? '#A78BFA' : w.state === 'working' || w.state === 'handoff' ? '#4ADE80' : '#FBBF24';
                return (
                  <g
                    key={w.id}
                    transform={`translate(${w.x}, ${w.y + bob})`}
                    onClick={() => setSelectedAgent(w.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Soft Floor Shadow */}
                    <ellipse cy="13" rx="12" ry="4.5" fill="#000000" fillOpacity="0.28" />
                    {/* Outfit / Torso */}
                    <rect x="-10" y="-2" width="20" height="15" rx="5" fill={w.outfitColor} stroke="#1C1917" strokeWidth="1.8" />
                    {/* Chibi Head */}
                    <circle cy="-12" r="10.5" fill="#FDE1C3" stroke="#1C1917" strokeWidth="1.8" />
                    {/* Hair */}
                    <path d="M-11 -13 C-11 -25, 11 -25, 11 -13 C7 -17, -7 -17, -11 -13 Z" fill={w.hairColor} />
                    {w.hairStyle === 'bun' && <circle cy="-24" r="4.5" fill={w.hairColor} stroke="#1C1917" strokeWidth="1.2" />}
                    {w.hairStyle === 'beret' && <ellipse cx="2" cy="-22" rx="9" ry="4" fill="#B91C1C" stroke="#1C1917" strokeWidth="1.2" />}
                    {/* Pixel Eyes */}
                    <rect x="-4.5" y="-12" width="2.2" height="2.8" rx="0.8" fill="#1C1917" />
                    <rect x="2.3" y="-12" width="2.2" height="2.8" rx="0.8" fill="#1C1917" />
                    {/* Glowing Handoff Packet */}
                    {w.carryingPacket && (
                      <rect x="10" y="-6" width="10" height="12" rx="2" fill="#FBBF24" stroke="#1C1917" strokeWidth="1.5" />
                    )}

                    {/* Dark Floating Pill Nameplate (Exact Photo Style) */}
                    <g transform="translate(0, -34)">
                      <rect x="-48" y="-9" width="96" height="17" rx="8.5" fill="#1A1613" fillOpacity="0.9" stroke="#3F342B" strokeWidth="1" />
                      <circle cx="-39" cy="-0.5" r="3" fill={dotColor} />
                      <text x="2" y="2.5" textAnchor="middle" fill="#FEF3C7" fontSize="8.5" fontWeight="600">
                        {w.label}
                      </text>
                    </g>

                    {/* Active Dialog Bubble */}
                    {w.speech && (
                      <g transform="translate(0, -56)">
                        <rect x="-86" y="-12" width="172" height="20" rx="8" fill="#18181B" stroke="#8B5CF6" strokeWidth="1.3" />
                        <text textAnchor="middle" y="1" fill="#F4F4F5" fontSize="8.5">{w.speech.slice(0, 32)}</text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}

      {/* Tap-to-Inspect Agent Sheet */}
      {inspected && (
        <div className="mx-4 mb-2 p-3 rounded-2xl border border-amber-700/40 bg-[#241B14] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-amber-50 truncate">{inspected.name}</div>
            <div className="text-[11px] text-amber-200/70 truncate">
              Zone: {inspected.zone} &bull; Thinking: {inspected.thinkingLevel}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedAgent(null)}
            className="text-[11px] px-2.5 py-1 rounded-full border border-amber-700/40 text-amber-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Bottom Live Control Strip */}
      <div className="px-4 py-3 border-t border-amber-900/40 bg-[#221912] flex items-center justify-between gap-3">
        <div className="text-xs text-amber-100/90 truncate">
          {latestActivity ? `[${latestActivity.timestamp}] ${latestActivity.summary}` : 'All 13 agents + Cali seated in office.'}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onStepOnce}
            className="px-3 py-1.5 rounded-full text-xs font-medium border border-amber-700/40 bg-amber-950/50 text-amber-100"
          >
            Step
          </button>
          <button
            type="button"
            onClick={onToggleRun}
            className="px-4 py-1.5 rounded-full text-xs font-semibold bg-[#8B5CF6] hover:bg-[#7C3AED] text-white"
          >
            {running ? 'Pause' : 'Run Loop'}
          </button>
        </div>
      </div>
    </div>
  );
};
