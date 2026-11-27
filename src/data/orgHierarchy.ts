import type { ThinkingLevel, WorkerAgentId } from '../types/agency';
import { getVisitingContractorById } from '../engine/specialistsEngine';

export type OrgTier = 1 | 2 | 3 | 4;

export interface OrgMember {
  id: string;
  name: string;
  title: string;
  tier: OrgTier;
  department: 'Executive' | 'Product' | 'Design' | 'Engineering' | 'Quality & Release';
  reportsTo: string;
  thinkingLevel: ThinkingLevel;
  keyRole: string;
  legacyAgentId?: WorkerAgentId | 'cali';
  homeRoom: 'boardroom' | 'engineering' | 'design' | 'coaching' | 'reception';
}

export const ORG_ROSTER: OrgMember[] = [
  // TIER 1: EXECUTIVE
  {
    id: 'cali',
    name: 'Cali',
    title: 'Chief Operating Officer (COO)',
    tier: 1,
    department: 'Executive',
    reportsTo: 'Mark (Founder & CEO)',
    thinkingLevel: 'high',
    keyRole: 'Runs day-to-day company operations, conducts 4-Gate planning, chairs Boardroom meetings, delivers Accomplishment Reports, and holds Emergency Alert authority.',
    legacyAgentId: 'cali',
    homeRoom: 'boardroom'
  },

  // TIER 2: 4 DEPARTMENT DIRECTORS (BOARDROOM SEATS)
  {
    id: 'director-product',
    name: 'Elena',
    title: 'Director of Product',
    tier: 2,
    department: 'Product',
    reportsTo: 'cali',
    thinkingLevel: 'high',
    keyRole: 'Owns product strategy, MVP scoping, anti-scope protection, and Phase Gate acceptance criteria.',
    homeRoom: 'boardroom'
  },
  {
    id: 'creative-director',
    name: 'Sora',
    title: 'Creative Director',
    tier: 2,
    department: 'Design',
    reportsTo: 'cali',
    thinkingLevel: 'medium',
    keyRole: 'Leads the Design Studio, enforces Original Monolith Dark/Light design tokens, editorial readability, and zero-native-popup UX.',
    homeRoom: 'design'
  },
  {
    id: 'cto-engineering',
    name: 'Marcus',
    title: 'CTO / Head of Engineering',
    tier: 2,
    department: 'Engineering',
    reportsTo: 'cali',
    thinkingLevel: 'high',
    keyRole: 'Owns technical architecture, IndexedDB + Local Folder persistence, 5-key quota resilience, and engineering escalations.',
    homeRoom: 'boardroom'
  },
  {
    id: 'director-quality',
    name: 'Nadia',
    title: 'Director of Quality & Release',
    tier: 2,
    department: 'Quality & Release',
    reportsTo: 'cali',
    thinkingLevel: 'high',
    keyRole: 'Owns release readiness, security/WCAG standards, Static Pre-Check policies, and critical bug Emergency escalations.',
    homeRoom: 'boardroom'
  },

  // TIER 3: 4 TEAM LEADS / SUPERVISORS (DISPATCH & 1-ON-1 COACHING)
  {
    id: 'delivery-manager',
    name: 'Kai',
    title: 'Delivery Manager (Orchestrator)',
    tier: 3,
    department: 'Product',
    reportsTo: 'director-product',
    thinkingLevel: 'high',
    keyRole: 'Breaks approved blueprints into atomic phased tasks, locks tech_stack, dispatches work, and runs Squad Whiteboard Huddles.',
    legacyAgentId: 'master-orchestrator',
    homeRoom: 'engineering'
  },
  {
    id: 'principal-architect',
    name: 'Devon',
    title: 'Principal Software Architect',
    tier: 3,
    department: 'Engineering',
    reportsTo: 'cto-engineering',
    thinkingLevel: 'high',
    keyRole: 'Supervises Backend, API, Database, and AI/Prompt Engineers; conducts 1-on-1 architecture coaching.',
    homeRoom: 'engineering'
  },
  {
    id: 'frontend-lead',
    name: 'Maya',
    title: 'Frontend Engineering Lead',
    tier: 3,
    department: 'Engineering',
    reportsTo: 'cto-engineering',
    thinkingLevel: 'medium',
    keyRole: 'Supervises Frontend, Mobile/PWA, and Build Stack specialists; runs 1-on-1 UI/PWA coaching pods.',
    homeRoom: 'engineering'
  },
  {
    id: 'qa-devsecops-lead',
    name: 'Rico',
    title: 'QA & DevSecOps Lead',
    tier: 3,
    department: 'Quality & Release',
    reportsTo: 'director-quality',
    thinkingLevel: 'high',
    keyRole: 'Supervises Code Reviewer, QA Automation, Debugger, and Release Engineer; coaches on defect prevention.',
    homeRoom: 'engineering'
  },

  // TIER 4: 15 SPECIALISTS
  {
    id: 'product-planner',
    name: 'Liam',
    title: 'Product Planner',
    tier: 4,
    department: 'Product',
    reportsTo: 'delivery-manager',
    thinkingLevel: 'high',
    keyRole: 'Converts 4-Gate discovery notes into structured Markdown blueprints with verifiable phase checklists.',
    legacyAgentId: 'project-planner',
    homeRoom: 'design'
  },
  {
    id: 'ux-architect',
    name: 'Chloe',
    title: 'Senior UX Architect',
    tier: 4,
    department: 'Design',
    reportsTo: 'creative-director',
    thinkingLevel: 'medium',
    keyRole: 'Designs user flows, mobile thumb-reachability, zero-confusion project scoping, and accessibility journeys.',
    homeRoom: 'design'
  },
  {
    id: 'ui-designer',
    name: 'Zara',
    title: 'Senior UI Designer',
    tier: 4,
    department: 'Design',
    reportsTo: 'creative-director',
    thinkingLevel: 'medium',
    keyRole: 'Defines CSS design tokens, Original Monolith Dark/Light palettes, editorial typography, and component spacing.',
    legacyAgentId: 'ui-designer',
    homeRoom: 'design'
  },
  {
    id: 'brand-designer',
    name: 'Toby',
    title: 'Brand & Asset Designer',
    tier: 4,
    department: 'Design',
    reportsTo: 'creative-director',
    thinkingLevel: 'low',
    keyRole: 'Creates crisp inline SVG icons, adaptive PWA/Android app icons, and visual assets with zero emoji clutter.',
    homeRoom: 'design'
  },
  {
    id: 'api-engineer',
    name: 'Owen',
    title: 'API & Schema Engineer',
    tier: 4,
    department: 'Engineering',
    reportsTo: 'principal-architect',
    thinkingLevel: 'medium',
    keyRole: 'Designs TypeScript data contracts, REST/Supabase schemas, offline sync queues, and validation rules.',
    legacyAgentId: 'api-designer',
    homeRoom: 'engineering'
  },
  {
    id: 'db-engineer',
    name: 'Priya',
    title: 'Database & Storage Engineer',
    tier: 4,
    department: 'Engineering',
    reportsTo: 'principal-architect',
    thinkingLevel: 'medium',
    keyRole: 'Implements IndexedDB repositories, Postgres RLS migrations, local folder sync, and zero-data-loss backups.',
    homeRoom: 'engineering'
  },
  {
    id: 'backend-engineer',
    name: 'Mateo',
    title: 'Backend Engineer',
    tier: 4,
    department: 'Engineering',
    reportsTo: 'principal-architect',
    thinkingLevel: 'medium',
    keyRole: 'Builds core business logic, CRUD services, resilient try/catch handlers, and offline-first state engines.',
    legacyAgentId: 'backend-developer',
    homeRoom: 'engineering'
  },
  {
    id: 'ai-prompt-engineer',
    name: 'Iris',
    title: 'AI & Prompt Engineer',
    tier: 4,
    department: 'Engineering',
    reportsTo: 'principal-architect',
    thinkingLevel: 'high',
    keyRole: 'Optimizes Gemini structured JSON schemas, rolling context compaction, and multi-key quota efficiency.',
    homeRoom: 'engineering'
  },
  {
    id: 'frontend-developer',
    name: 'Noah',
    title: 'Frontend Developer',
    tier: 4,
    department: 'Engineering',
    reportsTo: 'frontend-lead',
    thinkingLevel: 'medium',
    keyRole: 'Implements responsive mobile-first views, custom modals, interactive charts, and accessible DOM semantics.',
    legacyAgentId: 'frontend-developer',
    homeRoom: 'engineering'
  },
  {
    id: 'mobile-pwa-builder',
    name: 'Bea',
    title: 'Mobile & PWA Builder',
    tier: 4,
    department: 'Engineering',
    reportsTo: 'frontend-lead',
    thinkingLevel: 'medium',
    keyRole: 'Builds manifest.webmanifest, versioned Service Workers, Capacitor Android bridges, and offline boot shells.',
    legacyAgentId: 'performance-engineer',
    homeRoom: 'engineering'
  },
  {
    id: 'stack-specialist',
    name: 'Jules',
    title: 'Build & Stack Specialist',
    tier: 4,
    department: 'Engineering',
    reportsTo: 'frontend-lead',
    thinkingLevel: 'medium',
    keyRole: 'Configures Vite, TypeScript, Tailwind, Capacitor Gradle metadata, and clean single-command build pipelines.',
    legacyAgentId: 'dynamic-stack-specialist',
    homeRoom: 'engineering'
  },
  {
    id: 'code-reviewer',
    name: 'Victor',
    title: 'Staff Code Reviewer',
    tier: 4,
    department: 'Quality & Release',
    reportsTo: 'qa-devsecops-lead',
    thinkingLevel: 'high',
    keyRole: 'Audits diffs for real bugs, security flaws, placeholders, and PWA regressions. Zero-rubber-stamp policy.',
    legacyAgentId: 'code-reviewer',
    homeRoom: 'engineering'
  },
  {
    id: 'qa-automation',
    name: 'Hannah',
    title: 'QA Automation Engineer',
    tier: 4,
    department: 'Quality & Release',
    reportsTo: 'qa-devsecops-lead',
    thinkingLevel: 'medium',
    keyRole: 'Writes deterministic unit/integration tests, verifies Phase Checklists, and validates offline reloads.',
    legacyAgentId: 'qa-tester',
    homeRoom: 'engineering'
  },
  {
    id: 'debugger',
    name: 'Sam',
    title: 'Senior Debugging Engineer',
    tier: 4,
    department: 'Quality & Release',
    reportsTo: 'qa-devsecops-lead',
    thinkingLevel: 'high',
    keyRole: 'Performs root-cause analysis on runtime console errors, Pre-Check failures, and Reviewer blockers.',
    legacyAgentId: 'debugger',
    homeRoom: 'coaching'
  },
  {
    id: 'security-release-engineer',
    name: 'Aria',
    title: 'Security, A11y & Release Engineer',
    tier: 4,
    department: 'Quality & Release',
    reportsTo: 'qa-devsecops-lead',
    thinkingLevel: 'low',
    keyRole: 'Enforces WCAG 2.1 AA, zero hardcoded secrets, deployment configs (Vercel/Netlify/APK), and DEPLOY.md.',
    legacyAgentId: 'deployment-engineer',
    homeRoom: 'reception'
  }
];

export function getOrgMemberByLegacyId(agentId: string): OrgMember {
  const contractor = getVisitingContractorById(agentId);
  if (contractor) {
    return {
      id: contractor.id,
      name: contractor.name,
      title: contractor.title,
      tier: 4,
      department: 'Engineering',
      reportsTo: 'delivery-manager',
      thinkingLevel: contractor.thinkingLevel,
      keyRole: contractor.summary,
      homeRoom: 'engineering'
    };
  }
  return (
    ORG_ROSTER.find((m) => m.id === agentId || m.legacyAgentId === agentId) ||
    ORG_ROSTER.find((m) => m.id === 'frontend-developer')!
  );
}

export function getEscalationChain(specialistId: string): {
  specialist: OrgMember;
  supervisor: OrgMember;
  director: OrgMember;
  coo: OrgMember;
} {
  const specialist = getOrgMemberByLegacyId(specialistId);
  const supervisor = ORG_ROSTER.find((m) => m.id === specialist.reportsTo) || ORG_ROSTER.find((m) => m.id === 'frontend-lead')!;
  const director =
    supervisor.tier === 2
      ? supervisor
      : ORG_ROSTER.find((m) => m.id === supervisor.reportsTo) || ORG_ROSTER.find((m) => m.id === 'cto-engineering')!;
  const coo = ORG_ROSTER.find((m) => m.id === 'cali')!;
  return { specialist, supervisor, director, coo };
}
