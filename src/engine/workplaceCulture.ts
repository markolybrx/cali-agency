import type { AgencyReport } from '../types/agency';
import { getEscalationChain } from '../data/orgHierarchy';

export interface TeamSuggestion {
  id: string;
  projectId: string | null;
  specialistId: string;
  specialistLabel: string;
  supervisorLabel: string;
  directorLabel: string;
  escalationPath: string;
  title: string;
  rationale: string;
  impact: 'UX' | 'Performance' | 'Reliability' | 'Security';
  status: 'escalated' | 'approved' | 'deferred';
  createdAt: string;
}

export interface CoachingSession {
  id: string;
  kind: 'one_on_one' | 'squad_huddle';
  projectId: string | null;
  coachLabel: string;
  coacheeLabel: string;
  taskId: string;
  triggerReason: string;
  takeaway: string;
  createdAt: string;
}

const SUGGESTIONS_KEY = 'cali_agency_suggestions_v080';
const COACHING_KEY = 'cali_agency_coaching_v080';

export function loadSuggestions(): TeamSuggestion[] {
  try {
    const raw = localStorage.getItem(SUGGESTIONS_KEY);
    if (raw) return JSON.parse(raw) as TeamSuggestion[];
  } catch {
    // ignore
  }
  return [
    {
      id: 'sug_seed_1',
      projectId: null,
      specialistId: 'mobile-pwa-builder',
      specialistLabel: 'Bea (Mobile & PWA Builder)',
      supervisorLabel: 'Maya (Frontend Lead)',
      directorLabel: 'Marcus (CTO)',
      escalationPath: 'Mobile Builder -> Frontend Lead -> CTO -> Cali',
      title: 'Add offline-ready badge & cache freshness indicator in generated PWAs',
      rationale: 'Gives users immediate confidence that their app works cleanly with zero internet connection.',
      impact: 'UX',
      status: 'escalated',
      createdAt: new Date().toISOString()
    },
    {
      id: 'sug_seed_2',
      projectId: null,
      specialistId: 'qa-automation',
      specialistLabel: 'Hannah (QA Automation)',
      supervisorLabel: 'Rico (QA & DevSecOps Lead)',
      directorLabel: 'Nadia (Dir. Quality)',
      escalationPath: 'QA Automation -> QA Lead -> Dir. Quality -> Cali',
      title: 'Verify IndexedDB schema version migrations before every Phase Gate',
      rationale: 'Prevents local storage state mismatches when users upgrade between versions.',
      impact: 'Reliability',
      status: 'escalated',
      createdAt: new Date().toISOString()
    }
  ];
}

export function saveSuggestions(items: TeamSuggestion[]): void {
  try {
    localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(items.slice(0, 40)));
  } catch {
    // ignore
  }
}

export function createEscalatedSuggestion(params: {
  projectId: string | null;
  specialistId: string;
  title: string;
  rationale: string;
  impact?: TeamSuggestion['impact'];
}): TeamSuggestion {
  const chain = getEscalationChain(params.specialistId);
  const path =
    chain.supervisor.id === chain.director.id
      ? `${chain.specialist.title} -> ${chain.director.title} -> Cali`
      : `${chain.specialist.title} -> ${chain.supervisor.title} -> ${chain.director.title} -> Cali`;

  return {
    id: `sug_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    projectId: params.projectId,
    specialistId: chain.specialist.id,
    specialistLabel: `${chain.specialist.name} (${chain.specialist.title})`,
    supervisorLabel: `${chain.supervisor.name} (${chain.supervisor.title})`,
    directorLabel: `${chain.director.name} (${chain.director.title})`,
    escalationPath: path,
    title: params.title.trim(),
    rationale: params.rationale.trim(),
    impact: params.impact || 'UX',
    status: 'escalated',
    createdAt: new Date().toISOString()
  };
}

export function loadCoachingSessions(): CoachingSession[] {
  try {
    const raw = localStorage.getItem(COACHING_KEY);
    if (raw) return JSON.parse(raw) as CoachingSession[];
  } catch {
    // ignore
  }
  return [];
}

export function saveCoachingSessions(items: CoachingSession[]): void {
  try {
    localStorage.setItem(COACHING_KEY, JSON.stringify(items.slice(0, 40)));
  } catch {
    // ignore
  }
}

export function createCoachingRecord(params: {
  kind: 'one_on_one' | 'squad_huddle';
  projectId: string | null;
  projectName: string;
  specialistId: string;
  taskId: string;
  triggerReason: string;
  takeaway: string;
}): { session: CoachingSession; report: AgencyReport } {
  const chain = getEscalationChain(params.specialistId);
  const session: CoachingSession = {
    id: `coach_${Date.now().toString(36)}`,
    kind: params.kind,
    projectId: params.projectId,
    coachLabel: `${chain.supervisor.name} (${chain.supervisor.title})`,
    coacheeLabel: `${chain.specialist.name} (${chain.specialist.title})`,
    taskId: params.taskId,
    triggerReason: params.triggerReason,
    takeaway: params.takeaway,
    createdAt: new Date().toISOString()
  };

  const isHuddle = params.kind === 'squad_huddle';
  const report: AgencyReport = {
    id: `rep_coach_${Date.now().toString(36)}`,
    projectId: params.projectId,
    projectName: params.projectName,
    category: 'coaching',
    badge: isHuddle ? 'SQUAD WHITEBOARD HUDDLE' : '1-ON-1 COACHING LOG',
    title: isHuddle
      ? `Squad Huddle on ${params.taskId}: Task Decomposition`
      : `Coaching Pod: ${chain.supervisor.name} & ${chain.specialist.name} (${params.taskId})`,
    author: session.coachLabel,
    summary: `${params.triggerReason.slice(0, 110)}`,
    markdown: [
      '## Session Overview',
      `- **Session Type:** ${isHuddle ? 'Squad Whiteboard Huddle' : '1-on-1 Coaching Pod'}`,
      `- **Supervisor / Coach:** ${session.coachLabel}`,
      `- **Specialist:** ${session.coacheeLabel}`,
      `- **Ticket:** ${params.taskId}`,
      '',
      '## Issue Triggered',
      params.triggerReason,
      '',
      '## Actionable Coaching Takeaway',
      params.takeaway
    ].join('\n'),
    metrics: [
      { label: 'Ticket', value: params.taskId },
      { label: 'Mode', value: isHuddle ? 'Huddle' : '1-on-1' },
      { label: 'Status', value: 'Resolved' }
    ],
    createdAt: session.createdAt
  };

  return { session, report };
}
