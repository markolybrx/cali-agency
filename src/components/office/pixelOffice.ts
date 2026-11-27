import type { AgentVisualState } from '../../types/agency';

export const OFFICE_WIDTH = 560;
export const OFFICE_HEIGHT = 380;

export interface PixelSpriteAgent {
  id: string;
  shortName: string;
  roleLabel: string;
  tier: 1 | 2 | 3 | 4;
  shirt: string;
  hair: string;
  skin: string;
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  state: AgentVisualState;
  speech: string;
  speechUntil: number;
  walkPhase: number;
  blinkOffset: number;
}

export interface PacketFlight {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number;
  label: string;
}

const BREAK_SPOTS = [
  { x: 74, y: 332 },   // Pantry & Cafe
  { x: 146, y: 336 },  // Coffee Bar
  { x: 248, y: 336 },  // Arcade & Ping-Pong
  { x: 318, y: 338 },  // Rec Lounge
  { x: 432, y: 332 },  // Zen & Unwind
  { x: 492, y: 332 }   // Nap Chairs
];

export function createInitialAgents(): PixelSpriteAgent[] {
  // All 24 Staff Members (Tier 1 COO + Tier 2 Directors + Tier 3 Leads + Tier 4 Specialists)
  const roster: Array<[string, string, string, 1 | 2 | 3 | 4, string, string, string, number, number]> = [
    // TIER 1 & TIER 2: Glass Executive Boardroom (Top-Right)
    ['cali', 'Cali', 'T1 COO', 1, '#8B5CF6', '#2E1A12', '#FDE0C2', 452, 72],
    ['director-product', 'Elena', 'T2 Dir. Product', 2, '#2563EB', '#3B2314', '#FCD7B6', 410, 98],
    ['creative-director', 'Sora', 'T2 Creative Dir', 2, '#DB2777', '#7C2D12', '#FDE0C2', 494, 98],
    ['cto-engineering', 'Marcus', 'T2 CTO / Eng', 2, '#059669', '#18181B', '#E9B993', 418, 134],
    ['director-quality', 'Nadia', 'T2 Dir. Quality', 2, '#D97706', '#4A2511', '#FCD7B6', 486, 134],

    // TIER 3: 4 Team Leads (Command Row & Coaching)
    ['master-orchestrator', 'Kai', 'T3 Delivery Mgr', 3, '#F59E0B', '#1C1917', '#FDE0C2', 112, 112],
    ['principal-architect', 'Devon', 'T3 Principal Arch', 3, '#10B981', '#1E293B', '#E9B993', 216, 112],
    ['frontend-lead', 'Maya', 'T3 Frontend Lead', 3, '#3B82F6', '#5C2D16', '#FCD7B6', 320, 112],
    ['qa-devsecops-lead', 'Rico', 'T3 QA/Sec Lead', 3, '#EA580C', '#27272A', '#FDE0C2', 396, 206],

    // TIER 4: 15 Specialists (Engineering Floor, Design Studio, Coaching, Pantry, Rec & Zen)
    ['project-planner', 'Liam', 'T4 Planner', 4, '#60A5FA', '#27272A', '#FDE0C2', 78, 178],
    ['ux-architect', 'Chloe', 'T4 UX Architect', 4, '#F472B6', '#78350F', '#FCD7B6', 148, 178],
    ['ui-designer', 'Zara', 'T4 UI Designer', 4, '#EC4899', '#7C2D12', '#FDE0C2', 218, 178],
    ['brand-designer', 'Toby', 'T4 Brand/Assets', 4, '#A855F7', '#3F2E21', '#E9B993', 288, 178],
    ['api-designer', 'Owen', 'T4 API Engineer', 4, '#E11D48', '#451A03', '#FCD7B6', 352, 178],

    ['db-engineer', 'Priya', 'T4 DB Engineer', 4, '#6366F1', '#18181B', '#E9B993', 78, 246],
    ['backend-developer', 'Mateo', 'T4 Backend Eng', 4, '#059669', '#1C1917', '#FCD7B6', 148, 246],
    ['ai-prompt-engineer', 'Iris', 'T4 AI/Prompt Eng', 4, '#7C3AED', '#3B2314', '#FDE0C2', 218, 246],
    ['frontend-developer', 'Noah', 'T4 Frontend Dev', 4, '#0284C7', '#1E293B', '#FDE0C2', 288, 246],
    ['performance-engineer', 'Bea', 'T4 Mobile/PWA', 4, '#06B6D4', '#713F12', '#FCD7B6', 352, 246],

    ['dynamic-stack-specialist', 'Jules', 'T4 Stack Spec', 4, '#0891B2', '#5C2D16', '#FDE0C2', 88, 330],
    ['code-reviewer', 'Victor', 'T4 Code Reviewer', 4, '#B45309', '#292524', '#FCD7B6', 238, 330],
    ['qa-tester', 'Hannah', 'T4 QA Automation', 4, '#65A30D', '#3F2E21', '#FDE0C2', 316, 330],
    ['debugger', 'Sam', 'T4 Debugger', 4, '#DC2626', '#450A0A', '#FCD7B6', 442, 246],
    ['deployment-engineer', 'Aria', 'T4 Sec/A11y/Rel', 4, '#0D9488', '#1E3A8A', '#FDE0C2', 494, 330]
  ];

  return roster.map(([id, shortName, roleLabel, tier, shirt, hair, skin, x, y], idx) => ({
    id,
    shortName,
    roleLabel,
    tier,
    shirt,
    hair,
    skin,
    homeX: x,
    homeY: y,
    x,
    y,
    targetX: x,
    targetY: y,
    state: 'IDLE',
    speech: '',
    speechUntil: 0,
    walkPhase: idx * 0.55,
    blinkOffset: idx * 13
  }));
}

export function stepOfficeSimulation(
  agents: PixelSpriteAgent[],
  packets: PacketFlight[],
  tick: number
): void {
  const now = Date.now();
  for (const ag of agents) {
    if (ag.speech && now > ag.speechUntil) {
      ag.speech = '';
    }
    const dx = ag.targetX - ag.x;
    const dy = ag.targetY - ag.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1.2) {
      const step = Math.min(dist, 1.35);
      ag.x += (dx / dist) * step;
      ag.y += (dy / dist) * step;
      ag.walkPhase += 0.24;
      if (ag.state === 'IDLE') ag.state = 'WALKING';
    } else {
      ag.x = ag.targetX;
      ag.y = ag.targetY;
      if (ag.state === 'WALKING') ag.state = 'IDLE';
      // Idle off-duty strolls to Pantry, Arcade, or Zen Room
      if (ag.state === 'IDLE' && ag.id !== 'cali' && tick % 40 === 0 && Math.random() < 0.04) {
        const nearHome = Math.hypot(ag.x - ag.homeX, ag.y - ag.homeY) < 12;
        if (nearHome) {
          const spot = BREAK_SPOTS[Math.floor(Math.random() * BREAK_SPOTS.length)];
          ag.targetX = spot.x + (Math.random() * 18 - 9);
          ag.targetY = spot.y + (Math.random() * 12 - 6);
        } else {
          ag.targetX = ag.homeX;
          ag.targetY = ag.homeY;
        }
      }
    }
  }

  for (let i = packets.length - 1; i >= 0; i--) {
    packets[i].progress += 0.018;
    if (packets[i].progress >= 1) {
      packets.splice(i, 1);
    }
  }
}

export function renderPixelOffice(
  ctx: CanvasRenderingContext2D,
  agents: PixelSpriteAgent[],
  packets: PacketFlight[],
  tick: number,
  selectedId: string | null
): void {
  ctx.imageSmoothingEnabled = false;
  const px = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };

  // 1. Outer Frame & Warm Hardwood Floor Planks
  px(0, 0, OFFICE_WIDTH, OFFICE_HEIGHT, '#2C190E');
  for (let y = 14; y < 282; y += 8) {
    px(10, y, OFFICE_WIDTH - 20, 8, (y / 8) % 2 === 0 ? '#C78E50' : '#BC8346');
    px(10, y, OFFICE_WIDTH - 20, 1, '#9E6730');
  }

  // Top Wall Paneling & Bookshelves
  px(10, 10, OFFICE_WIDTH - 20, 34, '#5E3B23');
  px(10, 42, OFFICE_WIDTH - 20, 4, '#3B2313');
  ctx.fillStyle = '#FEF3C7';
  ctx.font = 'bold 8px "JetBrains Mono", monospace';
  ctx.fillText('CALI AI SOFTWARE HOUSE (24 STAFF)', 22, 30);

  // 2. Engineering & Design Desks (3 Rows)
  const desks: Array<[number, number]> = [
    [88, 118], [192, 118], [296, 118],
    [58, 184], [128, 184], [198, 184], [268, 184], [332, 184],
    [58, 252], [128, 252], [198, 252], [268, 252], [332, 252]
  ];
  for (const [dx, dy] of desks) {
    px(dx, dy, 46, 18, '#6B3E20');
    px(dx + 2, dy + 2, 42, 10, '#965E36');
    px(dx + 12, dy - 6, 22, 10, '#1E293B');
    px(dx + 14, dy - 4, 18, 6, '#38BDF8');
  }

  // 3. Glass Executive Boardroom (Top-Right) + Blinking Red Emergency Button
  px(382, 48, 166, 116, '#1B363A');
  px(386, 52, 158, 108, '#274C52');
  ctx.fillStyle = '#99F6E4';
  ctx.font = 'bold 7px "JetBrains Mono", monospace';
  ctx.fillText('GLASS BOARDROOM', 394, 64);
  px(414, 86, 98, 42, '#7C4825');
  px(418, 90, 90, 34, '#9C6138');
  const blink = Math.floor(tick / 18) % 2 === 0;
  px(457, 101, 12, 12, '#7F1D1D');
  px(459, 103, 8, 8, blink ? '#EF4444' : '#FCA5A5');

  // 4. Suggestion Wall & Coaching Pod (Mid-Right)
  px(384, 170, 164, 42, '#4A2C16');
  px(390, 176, 152, 30, '#C69663');
  px(398, 182, 12, 12, '#FEF08A');
  px(416, 184, 12, 12, '#A7F3D0');
  px(434, 181, 12, 12, '#FBCFE8');
  px(384, 218, 164, 62, '#543A2C');
  ctx.fillStyle = '#FDE68A';
  ctx.fillText('COACHING PODS', 394, 232);

  // 5. South Wing: Pantry & Cafe | Arcade & Rec | Zen & Unwind
  // Pantry
  px(10, 286, 176, 84, '#D6D3D1');
  ctx.fillStyle = '#18181B';
  ctx.fillText('PANTRY & CAFE', 20, 300);
  px(22, 308, 72, 16, '#573620');
  px(110, 306, 22, 22, '#94A3B8');

  // Arcade & Rec
  px(192, 286, 176, 84, '#1E1B4B');
  ctx.fillStyle = '#C4B5FD';
  ctx.fillText('ARCADE & REC', 202, 300);
  px(204, 308, 20, 26, '#18181B');
  px(207, 313, 14, 9, blink ? '#38BDF8' : '#A855F7');
  px(244, 316, 68, 34, '#2563EB');
  px(277, 316, 2, 34, '#FFFFFF');

  // Zen & Unwind
  px(374, 286, 176, 84, '#2E231D');
  ctx.fillStyle = '#FCD34D';
  ctx.fillText('ZEN & UNWIND', 384, 300);
  px(392, 318, 30, 38, '#047857');
  px(500, 318, 30, 38, '#9A3412');

  // 6. Depth-Sorted 16-Bit Chibi Staff (All 24)
  const sorted = [...agents].sort((a, b) => a.y - b.y);
  for (const ag of sorted) {
    const sx = Math.round(ag.x);
    const sy = Math.round(ag.y);
    const bob = ag.state === 'WALKING' ? (Math.floor(ag.walkPhase) % 2 === 0 ? -1 : 0) : 0;
    const isSel = selectedId === ag.id;

    if (isSel) {
      px(sx - 9, sy + 5, 18, 5, '#FFB732');
    }
    px(sx - 5, sy + 6, 10, 3, 'rgba(0,0,0,0.32)');
    px(sx - 5, sy - 2 + bob, 10, 8, '#18181B');
    px(sx - 4, sy - 1 + bob, 8, 6, ag.shirt);
    px(sx - 5, sy - 11 + bob, 10, 9, '#18181B');
    px(sx - 4, sy - 10 + bob, 8, 7, ag.skin);
    px(sx - 5, sy - 12 + bob, 10, 3, ag.hair);
    if ((tick + ag.blinkOffset) % 140 > 5) {
      px(sx - 2, sy - 7 + bob, 1.5, 2, '#18181B');
      px(sx + 1, sy - 7 + bob, 1.5, 2, '#18181B');
    }

    // Compact Nameplate Pill
    const dotColor = ag.id === 'cali' ? '#A78BFA' : ag.state === 'CODING' ? '#4ADE80' : ag.state === 'BLOCKED' ? '#F43F5E' : '#FBBF24';
    ctx.fillStyle = 'rgba(18,18,21,0.88)';
    ctx.fillRect(sx - 20, sy - 22 + bob, 40, 8);
    px(sx - 18, sy - 19 + bob, 2, 2, dotColor);
    ctx.fillStyle = '#FEF3C7';
    ctx.font = 'bold 5.5px "JetBrains Mono", monospace';
    ctx.fillText(ag.shortName.slice(0, 7), sx - 14, sy - 16 + bob);

    if (ag.speech) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(sx - 38, sy - 33 + bob, 76, 9);
      ctx.fillStyle = '#18181B';
      ctx.fillText(ag.speech.slice(0, 18), sx - 35, sy - 26.5 + bob);
    }
  }

  // 7. Flying Glowing Handoff Packets
  for (const pkt of packets) {
    const x = pkt.fromX + (pkt.toX - pkt.fromX) * pkt.progress;
    const y = pkt.fromY + (pkt.toY - pkt.fromY) * pkt.progress - Math.sin(pkt.progress * Math.PI) * 26;
    px(x - 4, y - 4, 8, 8, '#18181B');
    px(x - 3, y - 3, 6, 6, '#FFB732');
  }
}
