import type { AgencyReport } from '../types/agency';
import { ORG_ROSTER, getOrgMemberByLegacyId } from '../data/orgHierarchy';
import { getVisitingContractorById } from './specialistsEngine';
import { keyPool } from './keyPool';
import { callGeminiGroundedJson } from './geminiGrounded';
import { type AgentBrain, recordAgentStudyNotes } from './agentBrains';
import { resolveModelForRole } from './modelRouter';

export interface IdleStudySettings {
  enabled: boolean;
  maxSessionsPerDay: number;
  todayDate: string;
  todayCount: number;
}

const STUDY_CFG_KEY = 'cali_idle_study_cfg_v090';

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function loadIdleStudySettings(): IdleStudySettings {
  const today = todayIsoDate();
  try {
    const raw = localStorage.getItem(STUDY_CFG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<IdleStudySettings>;
      const sameDay = parsed.todayDate === today;
      return {
        enabled: parsed.enabled !== false,
        maxSessionsPerDay: Number(parsed.maxSessionsPerDay || 4),
        todayDate: today,
        todayCount: sameDay ? Number(parsed.todayCount || 0) : 0
      };
    }
  } catch {
    // ignore
  }
  return { enabled: true, maxSessionsPerDay: 4, todayDate: today, todayCount: 0 };
}

export function saveIdleStudySettings(cfg: IdleStudySettings): void {
  try {
    localStorage.setItem(STUDY_CFG_KEY, JSON.stringify(cfg));
  } catch {
    // ignore
  }
}

const ROLE_CURRICULA: Record<string, string[]> = {
  'frontend-developer': [
    'Modern mobile-first CSS container queries, dvh viewport units & zero-CLS layouts',
    'Vanilla JS & React state architecture patterns for instant offline-first PWAs',
    'Accessible custom modal, bottom dock & micro-interaction best practices'
  ],
  'performance-engineer': [
    'Service Worker cache-first vs stale-while-revalidate strategies for offline PWAs',
    'Capacitor Android WebView performance, touch responsiveness & safe-area insets',
    'Web App Manifest maskable icons, shortcuts & standalone installability criteria'
  ],
  'ui-designer': [
    'Editorial mobile typography hierarchy, contrast ratios & dark/light token systems',
    'Minimalist high-craft SaaS & mobile dashboard spacing patterns'
  ],
  'backend-developer': [
    'Resilient client-side repository patterns, optimistic updates & structured error handling',
    'Local-first sync conflict resolution & deterministic state machines'
  ],
  'db-engineer': [
    'IndexedDB schema migrations, transaction performance & quota error recovery',
    'Supabase Postgres Row-Level Security (RLS) & offline queue synchronization'
  ],
  'code-reviewer': [
    'Common AI-generated web app anti-patterns, XSS vectors & incomplete stub detection',
    'Static code audit checklists for offline PWAs & TypeScript strictness'
  ],
  'qa-tester': [
    'Deterministic offline PWA testing checklists & edge-case input validation',
    'Automated unit & integration test patterns for browser storage'
  ],
  'debugger': [
    'Root-cause debugging patterns for ServiceWorker sandboxes, CORS & async race conditions'
  ],
  'deployment-engineer': [
    'WCAG 2.1 AA mobile touch-target & screen-reader compliance checklists',
    'Content-Security-Policy & Cache-Control headers for Service Workers on Vercel/Netlify'
  ],
  'master-orchestrator': [
    'Atomic task decomposition strategies for multi-agent software engineering pipelines'
  ]
};

function pickTopicForRole(agentId: string): string {
  const contractor = getVisitingContractorById(agentId);
  if (contractor && contractor.studyTopics.length > 0) {
    return contractor.studyTopics[Math.floor(Math.random() * contractor.studyTopics.length)];
  }
  const member = getOrgMemberByLegacyId(agentId);
  const list = ROLE_CURRICULA[agentId] || ROLE_CURRICULA[member.id] || [
    `${member.title} modern engineering & UX best practices for mobile-first PWAs`
  ];
  return list[Math.floor(Math.random() * list.length)];
}

interface StudyJsonResponse {
  topic_studied: string;
  actionable_takeaways: string[];
  summary: string;
}

export async function runAgentWebStudySession(params: {
  targetAgentId?: string;
  bypassQuotaCap?: boolean;
}): Promise<{
  ok: boolean;
  reason?: string;
  agentId?: string;
  agentName?: string;
  topic?: string;
  updatedBrain?: AgentBrain;
  report?: AgencyReport;
}> {
  const cfg = loadIdleStudySettings();
  if (!params.bypassQuotaCap && (!cfg.enabled || cfg.todayCount >= cfg.maxSessionsPerDay)) {
    return { ok: false, reason: 'Daily idle study quota reached or disabled.' };
  }
  if (!navigator.onLine) {
    return { ok: false, reason: 'Offline — web study pauses until internet returns.' };
  }

  // Pick requested agent or a random Tier 3/4 specialist
  const candidates = ORG_ROSTER.filter((m) => m.tier >= 3);
  const chosen = params.targetAgentId
    ? getOrgMemberByLegacyId(params.targetAgentId)
    : candidates[Math.floor(Math.random() * candidates.length)];

  const slot = keyPool.acquireWorkerKey(chosen.id);
  if (!slot) {
    return { ok: false, reason: 'No worker API keys (K1-K4) currently READY.' };
  }

  const topic = pickTopicForRole(chosen.legacyAgentId || chosen.id);
  const systemPrompt = [
    `You are ${chosen.name}, ${chosen.title} in an autonomous software house.`,
    'You are in Off-Hours Web Study mode at the studio library.',
    'Research the assigned topic using Google Search grounding and distill 2-3 sharp, concrete engineering or UX rules you will apply in future builds.',
    'Zero emojis. Return ONLY valid JSON:',
    '{ "topic_studied": "string", "actionable_takeaways": ["rule 1", "rule 2"], "summary": "2 sentence digest" }'
  ].join('\n');

  try {
    const res = await callGeminiGroundedJson<StudyJsonResponse>({
      keyId: slot.id,
      systemPrompt,
      userPrompt: `Study topic for ${chosen.title}: ${topic}`,
      modelOverride: resolveModelForRole('qa-tester')
    });

    const takeaways = Array.isArray(res.data.actionable_takeaways) && res.data.actionable_takeaways.length > 0
      ? res.data.actionable_takeaways.slice(0, 3)
      : [res.data.summary || `Applied best practices for ${topic}`];

    const updatedBrain = await recordAgentStudyNotes(
      chosen.id,
      res.data.topic_studied || topic,
      takeaways,
      res.sources
    );

    saveIdleStudySettings({
      ...cfg,
      todayDate: todayIsoDate(),
      todayCount: cfg.todayCount + 1
    });

    const sourcesMd = res.sources.length
      ? ['## Web Sources Consulted', ...res.sources.map((s) => `- ${s}`)].join('\n')
      : '## Research Basis\n- Grounded synthesis for ' + chosen.title;

    const report: AgencyReport = {
      id: 'rep_study_' + Date.now().toString(36),
      projectId: null,
      projectName: 'Studio Library & R&D',
      category: 'cali',
      badge: 'OFF-HOURS WEB STUDY DIGEST',
      title: `${chosen.name} (${chosen.title}): ${res.data.topic_studied || topic}`,
      author: `${chosen.name} — ${chosen.title}`,
      summary: res.data.summary || takeaways[0],
      markdown: [
        '## Study Summary',
        res.data.summary || `Completed off-hours research on **${topic}**.`,
        '',
        '## Rules Saved to Personal Agent Brain (Level ' + updatedBrain.level + ')',
        ...takeaways.map((t) => `- ${t}`),
        '',
        sourcesMd
      ].join('\n'),
      metrics: [
        { label: 'Agent Level', value: 'Lv ' + updatedBrain.level },
        { label: 'Total XP', value: String(updatedBrain.xp) },
        { label: 'Rules Saved', value: String(takeaways.length) }
      ],
      createdAt: new Date().toISOString()
    };

    return {
      ok: true,
      agentId: chosen.id,
      agentName: `${chosen.name} (${chosen.title})`,
      topic: res.data.topic_studied || topic,
      updatedBrain,
      report
    };
  } catch (err) {
    return { ok: false, reason: (err as Error).message || 'Web study failed' };
  }
}
