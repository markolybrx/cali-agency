import type { AgentVisualState, WorkerAgentId } from '../../types/agency';

export interface PixelSpriteAgent {
  id: WorkerAgentId | 'cali';
  shortName: string;
  roleLabel: string;
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  shirt: string;
  hair: string;
  skin: string;
  state: AgentVisualState;
  speech: string;
  speechUntil: number;
  walkPhase: number;
  blinkOffset: number;
  roamCooldown: number;
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

export const OFFICE_WIDTH = 640;
export const OFFICE_HEIGHT = 400;

export function createInitialAgents(): PixelSpriteAgent[] {
  const defs: Array<[WorkerAgentId | 'cali', string, string, number, number, string, string, string]> = [
    ['cali', 'Cali (Dir)', 'Executive Director', 525, 118, '#6C4CD1', '#1E1B4B', '#F5D0B5'],
    ['master-orchestrator', '01. Orch', 'Master Orchestrator', 132, 134, '#7C3AED', '#292524', '#F3C6A5'],
    ['project-planner', '00. Plan', 'Project Planner', 252, 134, '#0EA5E9', '#451A03', '#F5D0B5'],
    ['ui-designer', '03. UI', 'UI Designer', 372, 134, '#EC4899', '#7C2D12', '#F7D7BE'],
    ['api-designer', '10. API', 'API Designer', 132, 212, '#14B8A6', '#1C1917', '#EAC0A0'],
    ['frontend-developer', '04. Front', 'Frontend Dev', 252, 212, '#2563EB', '#3F2305', '#F5D0B5'],
    ['dynamic-stack-specialist', '05. Stack', 'Stack Specialist', 372, 212, '#4F46E5', '#27272A', '#E7BC9D'],
    ['backend-developer', '06. Back', 'Backend Dev', 132, 290, '#059669', '#1E293B', '#F3C6A5'],
    ['code-reviewer', '07. Audit', 'Code Reviewer', 252, 290, '#D97706', '#422006', '#F5D0B5'],
    ['qa-tester', '08. QA', 'QA Tester', 372, 290, '#EA580C', '#292524', '#F7D7BE'],
    ['debugger', '09. Debug', 'Debugger', 506, 266, '#DC2626', '#18181B', '#F3C6A5'],
    ['accessibility-tester', '11. A11y', 'A11y Tester', 570, 266, '#0D9488', '#451A03', '#F5D0B5'],
    ['performance-engineer', '12. Perf', 'Perf Engineer', 506, 332, '#CA8A04', '#1E1B4B', '#EAC0A0'],
    ['deployment-engineer', '13. Ship', 'Deploy Engineer', 570, 332, '#475569', '#292524', '#F5D0B5']
  ];

  return defs.map(([id, shortName, roleLabel, x, y, shirt, hair, skin], idx) => ({
    id,
    shortName,
    roleLabel,
    homeX: x,
    homeY: y,
    x,
    y,
    targetX: x,
    targetY: y,
    shirt,
    hair,
    skin,
    state: 'IDLE',
    speech: '',
    speechUntil: 0,
    walkPhase: idx * 0.7,
    blinkOffset: idx * 31,
    roamCooldown: 120 + idx * 45
  }));
}

export function stepOfficeSimulation(
  agents: PixelSpriteAgent[],
  packets: PacketFlight[],
  tick: number
): void {
  const now = Date.now();
  for (const a of agents) {
    if (a.speechUntil > 0 && now > a.speechUntil) {
      a.speech = '';
      a.speechUntil = 0;
    }

    if (a.state === 'IDLE') {
      a.roamCooldown -= 1;
      if (a.roamCooldown <= 0) {
        const goHome = Math.hypot(a.x - a.homeX, a.y - a.homeY) > 10;
        if (goHome) {
          a.targetX = a.homeX;
          a.targetY = a.homeY;
        } else {
          a.targetX = a.homeX + (Math.random() * 28 - 14);
          a.targetY = a.homeY + (Math.random() * 14 - 7);
        }
        a.roamCooldown = 140 + Math.floor(Math.random() * 180);
      }
    } else {
      a.targetX = a.homeX;
      a.targetY = a.homeY;
    }

    const dx = a.targetX - a.x;
    const dy = a.targetY - a.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1.2) {
      a.x += (dx / dist) * 0.9;
      a.y += (dy / dist) * 0.9;
      a.walkPhase += 0.22;
    } else {
      a.x = a.targetX;
      a.y = a.targetY;
      if (a.state === 'CODING' || a.state === 'REVIEWING') {
        a.walkPhase = tick * 0.35;
      }
    }
  }

  for (let i = packets.length - 1; i >= 0; i--) {
    packets[i].progress += 0.025;
    if (packets[i].progress >= 1) packets.splice(i, 1);
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

  ctx.fillStyle = '#B87B44';
  ctx.fillRect(0, 0, OFFICE_WIDTH, OFFICE_HEIGHT);
  for (let y = 58; y < OFFICE_HEIGHT; y += 14) {
    ctx.fillStyle = y % 28 === 0 ? '#A96E39' : '#C0834A';
    ctx.fillRect(0, y, OFFICE_WIDTH, 13);
    ctx.fillStyle = '#8E582A';
    ctx.fillRect(0, y + 13, OFFICE_WIDTH, 1);
    for (let x = (y % 28) * 2; x < OFFICE_WIDTH; x += 68) {
      ctx.fillRect(x, y, 1, 13);
    }
  }

  ctx.fillStyle = '#4A311E';
  ctx.fillRect(0, 0, OFFICE_WIDTH, 58);
  ctx.fillStyle = '#6B482C';
  ctx.fillRect(0, 52, OFFICE_WIDTH, 6);

  ctx.fillStyle = '#7A5434';
  ctx.fillRect(14, 16, 118, 36);
  ctx.fillStyle = '#D6C7B2';
  ctx.fillRect(18, 22, 28, 16);
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(22, 25, 20, 10);
  ctx.fillStyle = '#334155';
  ctx.fillRect(54, 18, 18, 22);
  ctx.fillStyle = '#EF4444';
  ctx.fillRect(60, 22, 6, 4);

  ctx.fillStyle = '#291B12';
  ctx.fillRect(204, 14, 168, 28);
  ctx.strokeStyle = '#C99A63';
  ctx.lineWidth = 2;
  ctx.strokeRect(204, 14, 168, 28);
  ctx.fillStyle = '#FDE68A';
  ctx.font = 'bold 11px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('CALI AI OFFICE', 288, 32);

  ctx.fillStyle = '#5C3A21';
  ctx.fillRect(386, 12, 66, 40);
  const bookColors = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];
  for (let row = 0; row < 2; row++) {
    for (let b = 0; b < 9; b++) {
      ctx.fillStyle = bookColors[(b + row * 3) % bookColors.length];
      ctx.fillRect(390 + b * 6, 17 + row * 16, 5, 12);
    }
  }

  ctx.fillStyle = '#265359';
  ctx.fillRect(466, 58, 164, 134);
  ctx.strokeStyle = '#5EEAD4';
  ctx.lineWidth = 2;
  ctx.strokeRect(466, 58, 164, 134);
  ctx.fillStyle = '#6D4322';
  ctx.beginPath();
  ctx.ellipse(548, 128, 46, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#4A2B14';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#643B22';
  ctx.fillRect(466, 206, 164, 182);
  ctx.fillStyle = '#7E4A2B';
  ctx.fillRect(472, 212, 152, 170);
  ctx.fillStyle = '#1E1510';
  ctx.fillRect(508, 216, 80, 15);
  ctx.fillStyle = '#FDE68A';
  ctx.font = 'bold 8px monospace';
  ctx.fillText('BREAK LOUNGE', 548, 226);

  ctx.fillStyle = '#991B1B';
  ctx.fillRect(478, 286, 20, 62);
  ctx.fillRect(598, 286, 20, 62);
  ctx.fillStyle = '#DC2626';
  ctx.fillRect(481, 290, 14, 54);
  ctx.fillRect(601, 290, 14, 54);
  ctx.fillStyle = '#5C3A21';
  ctx.fillRect(524, 300, 48, 34);
  ctx.fillStyle = '#92623A';
  ctx.fillRect(528, 304, 40, 26);

  const drawPlant = (px: number, py: number) => {
    ctx.fillStyle = '#92400E';
    ctx.fillRect(px - 6, py, 12, 10);
    ctx.fillStyle = '#15803D';
    ctx.fillRect(px - 9, py - 10, 18, 11);
    ctx.fillStyle = '#22C55E';
    ctx.fillRect(px - 6, py - 14, 12, 8);
  };
  drawPlant(452, 74);
  drawPlant(24, 368);
  drawPlant(452, 368);

  const deskCols = [132, 252, 372];
  const deskRows = [148, 226, 304];
  for (const ry of deskRows) {
    for (const cx of deskCols) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(cx - 34, ry + 14, 68, 8);
      ctx.fillStyle = '#7C4A22';
      ctx.fillRect(cx - 34, ry - 8, 68, 24);
      ctx.fillStyle = '#9C6234';
      ctx.fillRect(cx - 32, ry - 6, 64, 14);
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(cx - 11, ry - 12, 22, 13);
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(cx - 9, ry - 10, 18, 9);
      ctx.fillStyle = '#334155';
      ctx.fillRect(cx - 8, ry + 3, 16, 4);
    }
  }

  ctx.fillStyle = '#7C4A22';
  ctx.fillRect(190, 356, 132, 22);
  ctx.fillStyle = '#C99A63';
  ctx.fillRect(194, 358, 124, 8);

  const sorted = [...agents].sort((a, b) => a.y - b.y);
  for (const a of sorted) {
    drawChibiSprite(ctx, a, tick, a.id === selectedId);
  }

  for (const pkt of packets) {
    const px = pkt.fromX + (pkt.toX - pkt.fromX) * pkt.progress;
    const py = pkt.fromY + (pkt.toY - pkt.fromY) * pkt.progress - Math.sin(pkt.progress * Math.PI) * 26;
    ctx.strokeStyle = 'rgba(196, 181, 253, 0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pkt.fromX, pkt.fromY);
    ctx.lineTo(pkt.toX, pkt.toY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#8B5CF6';
    ctx.fillRect(px - 5, py - 5, 10, 10);
    ctx.fillStyle = '#FDE68A';
    ctx.fillRect(px - 3, py - 3, 6, 6);

    ctx.fillStyle = 'rgba(18,18,21,0.92)';
    ctx.fillRect(px - 36, py - 21, 72, 13);
    ctx.fillStyle = '#E9D5FF';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(pkt.label.slice(0, 14), px, py - 12);
  }
}

function drawChibiSprite(
  ctx: CanvasRenderingContext2D,
  a: PixelSpriteAgent,
  tick: number,
  selected: boolean
): void {
  const x = Math.round(a.x);
  const y = Math.round(a.y);
  const isMoving = Math.hypot(a.targetX - a.x, a.targetY - a.y) > 1.2;
  const bob = isMoving ? Math.round(Math.sin(a.walkPhase) * 1.5) : 0;
  const armOffset = a.state === 'CODING' || a.state === 'REVIEWING' ? Math.round(Math.sin(tick * 0.45) * 1.5) : 0;

  if (selected) {
    ctx.strokeStyle = '#FFB732';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y + 6, 15, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(x - 7, y + 5, 14, 4);

  const leftLeg = isMoving ? Math.round(Math.sin(a.walkPhase) * 2) : 0;
  const rightLeg = isMoving ? -leftLeg : 0;
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(x - 5, y + 1 + leftLeg, 4, 5);
  ctx.fillRect(x + 1, y + 1 + rightLeg, 4, 5);

  ctx.fillStyle = a.shirt;
  ctx.fillRect(x - 7, y - 9 + bob, 14, 11);
  ctx.fillRect(x - 9, y - 7 + bob + armOffset, 2, 7);
  ctx.fillRect(x + 7, y - 7 + bob - armOffset, 2, 7);

  ctx.fillStyle = a.skin;
  ctx.fillRect(x - 6, y - 20 + bob, 12, 11);
  ctx.fillStyle = a.hair;
  ctx.fillRect(x - 7, y - 22 + bob, 14, 5);
  ctx.fillRect(x - 7, y - 18 + bob, 2, 5);
  ctx.fillRect(x + 5, y - 18 + bob, 2, 5);

  const isBlinking = (tick + a.blinkOffset) % 140 < 6;
  ctx.fillStyle = '#111827';
  if (isBlinking) {
    ctx.fillRect(x - 4, y - 14 + bob, 3, 1);
    ctx.fillRect(x + 1, y - 14 + bob, 3, 1);
  } else {
    ctx.fillRect(x - 4, y - 15 + bob, 2, 3);
    ctx.fillRect(x + 2, y - 15 + bob, 2, 3);
  }

  const pillW = 64;
  const pillH = 13;
  const px = x - pillW / 2;
  const py = y - 37 + bob;
  ctx.fillStyle = 'rgba(18, 18, 22, 0.88)';
  ctx.fillRect(px, py, pillW, pillH);
  ctx.strokeStyle = a.state === 'BLOCKED' ? '#EF4444' : a.state !== 'IDLE' ? '#8B5CF6' : 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(px, py, pillW, pillH);

  const dotColor =
    a.state === 'CODING'
      ? '#34D399'
      : a.state === 'REVIEWING' || a.state === 'THINKING'
      ? '#FBBF24'
      : a.state === 'BLOCKED'
      ? '#EF4444'
      : a.state === 'TALKING'
      ? '#C4B5FD'
      : '#94A3B8';
  ctx.fillStyle = dotColor;
  ctx.fillRect(px + 4, py + 4, 4, 4);

  ctx.fillStyle = '#F4F4F5';
  ctx.font = 'bold 8px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(a.shortName, px + 11, py + 9.5);

  if (a.speech) {
    const label = a.speech.length > 26 ? `${a.speech.slice(0, 25)}…` : a.speech;
    const bw = Math.max(76, label.length * 5.2 + 12);
    const bx = Math.max(6, Math.min(OFFICE_WIDTH - bw - 6, x - bw / 2));
    const by = py - 18;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(bx, by, bw, 15);
    ctx.strokeStyle = '#18181B';
    ctx.strokeRect(bx, by, bw, 15);
    ctx.fillStyle = '#18181B';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, bx + bw / 2, by + 10);
  }
}
