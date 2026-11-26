import type { AgentId } from '../../types/agency';

export interface SimWorker {
  id: AgentId;
  label: string;
  hairColor: string;
  outfitColor: string;
  accentColor: string;
  hairStyle: 'short' | 'bob' | 'bun' | 'beret' | 'parted';
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  state: 'idle' | 'walking' | 'working' | 'handoff';
  speech: string | null;
  speechUntil: number;
  carryingPacket: boolean;
  bobPhase: number;
}

export const LOUNGE_SPOTS = [
  { x: 675, y: 438 },
  { x: 795, y: 438 },
  { x: 735, y: 468 },
  { x: 145, y: 102 } // Kitchenette coffee counter
];

export function createInitialWorkers(): SimWorker[] {
  const defs: Array<[AgentId, string, string, string, string, SimWorker['hairStyle'], number, number]> = [
    // Executive Conference Room (Top-Right)
    ['cali-director', 'Cali (CEO)', '#3B2314', '#6D28D9', '#C4B5FD', 'bob', 740, 148],
    // Row 1: 3 Wooden Desks
    ['project-planner', '00. Planner', '#27272A', '#2563EB', '#93C5FD', 'short', 150, 165],
    ['master-orchestrator', '01. Orchestrator', '#1C1917', '#D97706', '#FCD34D', 'parted', 325, 165],
    ['ui-designer', '03. UI Designer', '#7C2D12', '#DB2777', '#F9A8D4', 'bun', 500, 165],
    // Row 2: 3 Wooden Desks
    ['api-designer', '10. API Designer', '#78350F', '#E11D48', '#FDA4AF', 'bob', 150, 290],
    ['frontend-developer', '04. Frontend', '#1E293B', '#0284C7', '#7DD3FC', 'short', 325, 290],
    ['dynamic-stack-specialist', '05. Stack Spec', '#713F12', '#0891B2', '#67E8F9', 'bun', 500, 290],
    // Row 3: 2 Wooden Desks + Curved Reception Desk
    ['backend-developer', '06. Backend', '#18181B', '#059669', '#6EE7B7', 'parted', 150, 415],
    ['code-reviewer', '07. Reviewer', '#5C2D16', '#B45309', '#FDE68A', 'beret', 325, 415],
    ['deployment-engineer', '13. Deploy', '#292524', '#0D9488', '#5EEAD4', 'bob', 500, 422],
    // Conference Room & Break Lounge Specialists
    ['qa-tester', '08. QA Tester', '#3F2E21', '#65A30D', '#BEF264', 'short', 662, 206],
    ['debugger', '09. Debugger', '#450A0A', '#DC2626', '#FCA5A5', 'parted', 816, 206],
    ['accessibility-tester', '11. A11y', '#4C1D95', '#9333EA', '#D8B4FE', 'beret', 676, 438],
    ['performance-engineer', '12. Perf Eng', '#1E3A8A', '#2563EB', '#93C5FD', 'bun', 796, 438]
  ];

  return defs.map(([id, label, hairColor, outfitColor, accentColor, hairStyle, x, y], i) => ({
    id,
    label,
    hairColor,
    outfitColor,
    accentColor,
    hairStyle,
    homeX: x,
    homeY: y,
    x,
    y,
    targetX: x,
    targetY: y,
    state: 'idle',
    speech: null,
    speechUntil: 0,
    carryingPacket: false,
    bobPhase: i * 0.65
  }));
}

export function stepOfficeSimulation(workers: SimWorker[], dt: number, now: number): void {
  const speed = 118;
  for (const w of workers) {
    w.bobPhase += dt * (w.state === 'walking' || w.state === 'handoff' ? 11 : 2.5);
    if (w.speech && now > w.speechUntil) {
      w.speech = null;
    }

    const dx = w.targetX - w.x;
    const dy = w.targetY - w.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 2) {
      const step = Math.min(dist, speed * dt);
      w.x += (dx / dist) * step;
      w.y += (dy / dist) * step;
    } else {
      w.x = w.targetX;
      w.y = w.targetY;
      if (w.state === 'handoff') {
        w.carryingPacket = false;
        w.targetX = w.homeX;
        w.targetY = w.homeY;
        w.state = 'walking';
      } else if (w.state === 'walking') {
        w.state = 'idle';
      }
    }

    // Cozy idle life: off-duty workers stroll to the Break Lounge or Kitchenette coffee counter
    if (w.state === 'idle' && w.id !== 'cali-director' && Math.random() < 0.0022) {
      const atHome = Math.hypot(w.x - w.homeX, w.y - w.homeY) < 12;
      if (atHome) {
        const spot = LOUNGE_SPOTS[Math.floor(Math.random() * LOUNGE_SPOTS.length)];
        w.targetX = spot.x + (Math.random() * 14 - 7);
        w.targetY = spot.y + (Math.random() * 14 - 7);
      } else {
        w.targetX = w.homeX;
        w.targetY = w.homeY;
      }
      w.state = 'walking';
    }
  }
}
