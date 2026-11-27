import type { MemoryItem, OnboardingTopics, PendingDecision, ProjectState, UserProfile } from '../types/agency';
import type { ClearanceLevel, SharedMemoryItem } from './caliBrain';
import { getPromptByRole } from '../prompts/agencyPrompts';
import { callGeminiJson } from './geminiClient';
import { keyPool } from './keyPool';
import { getCompactContractorDirectoryForCali, recommendContractorsForIdea } from './specialistsEngine';

export interface CaliTurnResult {
  message: string;
  speech: string | null;
  memory_ops: Array<{
    op: 'upsert' | 'delete';
    type: 'preference' | 'pattern' | 'correction' | 'standing_rule';
    key: string;
    value: string;
    triggers: string[];
    source: 'explicit_user' | 'inferred_from_chat' | 'user_correction';
    confidence: number;
  }>;
  shared_candidates?: Array<{
    topic: string;
    category: 'coding_pattern' | 'ux_rule' | 'general_knowledge';
    value: string;
  }>;
  completed_topics: Array<keyof OnboardingTopics>;
  planning_gate?: 1 | 2 | 3 | 4;
  recommended_contractors?: string[];
  agency_command: 'NONE' | 'DRAFT_BLUEPRINT' | 'START_BLUEPRINT' | 'PAUSE_LOOP' | 'RESUME_LOOP' | 'APPROVE_PENDING';
  blueprint_markdown?: string;
}

const CONVERSATIONAL_SYSTEM_ADDENDUM = [
  '## 3-LAYER JARVIS BRAIN, ONBOARDING & 4-GATE ELABORATED PLANNING RULES',
  '- 24-PERSON COMPANY ROSTER LOCK: You are Cali (COO) leading a 24-person 4-tier software company (You + 4 Department Directors + 4 Team Leads + 15 Specialists). NEVER say you have 13 agents.',
  '- Zero emojis in all responses. Warm, sharp, casual JARVIS + trusted friend cadence.',
  '- 3-Layer Brain:',
  '  1. Layer 1 (shared_brain): Collective non-sensitive engineering/UX knowledge.',
  '  2. Layer 2 (private_vault): Strictly private memories for this user ONLY.',
  '  3. Clearance: If user_clearance is "BOSS", treat them as Founder & CEO (Tony Stark -> JARVIS dynamic).',
  '- If onboarding_complete is false, cover the 4 missing keys in user_profile.onboarding_topics ("name_vibe", "design_taste", "tech_stack", "autonomy") naturally and ALWAYS emit answered keys in "completed_topics".',
  '- VISITING CONTRACTORS: You also have 28 On-Demand Visiting Contractors in visiting_contractors_directory. When a project needs specialized domain expertise (3D, Games, Pentesting, SEO/Growth, GIS, Finance, HealthTech, Native Mobile, etc.), include 1-3 matching contractor IDs in "recommended_contractors" so the Founder can summon them.',
  '- IF chat_scope === "planning" (New Project Planning Mode):',
  '  - Conduct an elaborated, deeply thoughtful 4-Gate Discovery Conversation (do NOT rush a shallow blueprint on turn 1):',
  '    * Gate 1 (Vision & Users): Ask clarifying questions about the problem, who uses it, and the core daily flow. Return planning_gate: 1.',
  '    * Gate 2 (MVP Scope & Anti-Scope): Propose 3-5 must-have features, challenge scope creep once (Constructive Pushback), clarify offline/edge cases. Return planning_gate: 2.',
  '    * Gate 3 (Architecture & UI Taste): Confirm PWA vs Android APK target, Original Monolith Dark/Light layout, IndexedDB/Supabase storage, and special interactions. Return planning_gate: 3.',
  '    * Gate 4 (Complete Blueprint Canvas): Once all 3 gates are covered (or user says "draft the blueprint now"), emit planning_gate: 4, agency_command: "DRAFT_BLUEPRINT", and a comprehensive, multi-phase Markdown blueprint in blueprint_markdown.',
  '- Return ONLY raw valid JSON:',
  '{',
  '  "message": "string",',
  '  "speech": "concise spoken version or null",',
  '  "memory_ops": [],',
  '  "shared_candidates": [],',
  '  "completed_topics": [],',
  '  "planning_gate": 1,',
  '  "recommended_contractors": ["optional-contractor-id"],',
  '  "agency_command": "NONE | DRAFT_BLUEPRINT | START_BLUEPRINT | PAUSE_LOOP | RESUME_LOOP | APPROVE_PENDING",',
  '  "blueprint_markdown": "optional comprehensive markdown blueprint"',
  '}'
].join('\n');

export async function runCaliTurn(params: {
  userMessage: string;
  history: Array<{ role: 'user' | 'cali'; text: string }>;
  profile: UserProfile;
  memories: MemoryItem[];
  sharedMemories?: SharedMemoryItem[];
  clearance?: ClearanceLevel;
  chatScope?: 'project' | 'planning' | 'general';
  currentPlanningGate?: 1 | 2 | 3 | 4;
  activeProject: ProjectState | null;
  pendingDecisions: PendingDecision[];
}): Promise<CaliTurnResult> {
  const caliSlot = keyPool.getCaliKey();

  if (!caliSlot || !navigator.onLine) {
    if (!params.profile.onboarding_complete) {
      const t = params.profile.onboarding_topics;
      const missing = (['name_vibe', 'design_taste', 'tech_stack', 'autonomy'] as Array<keyof OnboardingTopics>).filter(
        (k) => !t[k]
      );
      const currentTopic = missing[0];
      const nextTopic = missing[1];
      const ops: CaliTurnResult['memory_ops'] = currentTopic
        ? [
            {
              op: 'upsert',
              type: 'preference',
              key: currentTopic === 'name_vibe' ? 'user.preferred_name' : 'onboarding.' + currentTopic,
              value: params.userMessage.trim(),
              triggers: ['onboarding', currentTopic],
              source: 'explicit_user',
              confidence: 0.95
            }
          ]
        : [];

      const followUps: Record<keyof OnboardingTopics, string> = {
        name_vibe: 'First up—what should I call you, and do you prefer clean English or natural Taglish?',
        design_taste:
          'Nice to meet you. Before I brief the Creative Director, what kind of app aesthetic do you love—and any UI pet peeves we should ban?',
        tech_stack:
          'Solid taste—locked that in. For apps we build together, do you have a favorite stack (Vanilla JS, React + Vite, Tailwind, IndexedDB), or should CTO pick the leanest stack per project?',
        autonomy:
          'Got it. Last question before we open the Project Hub: want me to pause at every Phase Gate for your review, or keep the 24-person studio rolling until a real blocker hits?'
      };

      if (!nextTopic) {
        return {
          message: 'We are completely aligned. I saved your preferences locally and unlocked the Project Hub.',
          speech: null,
          memory_ops: ops,
          completed_topics: currentTopic ? [currentTopic] : ['name_vibe', 'design_taste', 'tech_stack', 'autonomy'],
          agency_command: 'NONE'
        };
      }

      return {
        message: followUps[nextTopic],
        speech: null,
        memory_ops: ops,
        completed_topics: currentTopic ? [currentTopic] : [],
        agency_command: 'NONE'
      };
    }

    if (params.chatScope === 'planning') {
      const gate = params.currentPlanningGate || 1;
      if (gate === 1) {
        return {
          message: 'Gate 1 locked. Now for Gate 2 (MVP & Anti-Scope): what are the 3 absolute must-have features for v1, and what should we deliberately leave out so Phase 1 ships fast?',
          speech: null,
          memory_ops: [],
          completed_topics: [],
          planning_gate: 2,
          agency_command: 'NONE'
        };
      }
      if (gate === 2) {
        return {
          message: 'Gate 2 locked. Moving to Gate 3 (Architecture & UI Taste): should this target a Web PWA or Android APK, and do you want offline IndexedDB storage with our Original Monolith Dark/Light UI?',
          speech: null,
          memory_ops: [],
          completed_topics: [],
          planning_gate: 3,
          agency_command: 'NONE'
        };
      }
      const draftMd = [
        '# Project Blueprint: Custom Agency App',
        '',
        '## 1. Vision & Core Problem',
        params.userMessage,
        '',
        '## 2. Locked Tech Stack',
        '- **Framework:** Vanilla HTML/CSS/JS (Offline-First PWA)',
        '- **Storage:** IndexedDB + Local Folder Sync',
        '- **Design:** Original Monolith (Dark Default + Light Mode)',
        '',
        '## 3. Phased Delivery Plan',
        '- **Phase 1:** Foundation, Design Tokens, App Shell, Manifest & Service Worker',
        '- **Phase 2:** Core MVP Workflows & Offline Persistence',
        '- **Phase 3:** QA Automation, Accessibility Audit & Release Docs'
      ].join('\n');

      return {
        message: 'All 4 planning gates are complete. Tap the Blueprint Canvas card below to inspect the full spec, then approve to launch Phase 1.',
        speech: null,
        memory_ops: [],
        completed_topics: [],
        planning_gate: 4,
        agency_command: 'DRAFT_BLUEPRINT',
        blueprint_markdown: draftMd
      };
    }

    const lower = params.userMessage.toLowerCase();
    if (lower.includes('pause')) {
      return { message: 'Pausing the agency floor now.', speech: null, memory_ops: [], completed_topics: [], agency_command: 'PAUSE_LOOP' };
    }
    if (lower.includes('resume') || lower.includes('start')) {
      return { message: 'Resuming production on the agency floor.', speech: null, memory_ops: [], completed_topics: [], agency_command: 'RESUME_LOOP' };
    }
    return {
      message: !navigator.onLine
        ? 'You are currently offline. Your projects, files, 3D Office, and reports remain fully accessible locally.'
        : 'Configure KEY_CALI in Settings (and tap Save Settings) so I can converse live and run 4-Gate planning.',
      speech: null,
      memory_ops: [],
      completed_topics: [],
      agency_command: 'NONE'
    };
  }

  const directorPrompt = getPromptByRole('cali');
  const systemPrompt = directorPrompt.content + '\n\n---\n\n' + CONVERSATIONAL_SYSTEM_ADDENDUM;

  const payload = {
    user_clearance: params.clearance || 'USER',
    chat_scope: params.chatScope || 'project',
    current_planning_gate: params.currentPlanningGate || 1,
    conversation_history: params.history.slice(-10),
    user_message: params.userMessage,
    user_profile: params.profile,
    private_vault: params.memories.slice(0, 14),
    shared_brain: (params.sharedMemories || []).slice(0, 12).map((s) => ({ topic: s.topic, category: s.category, value: s.value })),
    active_project: params.activeProject
      ? {
          name: params.activeProject.project_name,
          phase: params.activeProject.current_phase_id,
          tech_stack: params.activeProject.tech_stack,
          file_count: Object.keys(params.activeProject.files).length
        }
      : null,
    visiting_contractors_directory: getCompactContractorDirectoryForCali(),
    pending_decisions: params.pendingDecisions,
    telemetry: keyPool.getTelemetry()
  };

  const res = await callGeminiJson<CaliTurnResult>({
    keyId: caliSlot.id,
    systemPrompt,
    userPayload: JSON.stringify(payload),
    thinkingLevel: directorPrompt.thinkingLevel,
    temperature: 0.65
  });

  const completed = Array.isArray(res.data.completed_topics) ? [...res.data.completed_topics] : [];
  if (!params.profile.onboarding_complete && completed.length === 0) {
    const missing = (['name_vibe', 'design_taste', 'tech_stack', 'autonomy'] as Array<keyof OnboardingTopics>).filter(
      (k) => !params.profile.onboarding_topics[k]
    );
    if (missing[0]) completed.push(missing[0]);
  }

  return {
    message: res.data.message || 'Got it.',
    speech: res.data.speech ?? null,
    memory_ops: Array.isArray(res.data.memory_ops) ? res.data.memory_ops : [],
    shared_candidates: Array.isArray(res.data.shared_candidates) ? res.data.shared_candidates : [],
    completed_topics: completed,
    planning_gate: res.data.planning_gate,
    recommended_contractors: Array.isArray(res.data.recommended_contractors) ? res.data.recommended_contractors : recommendContractorsForIdea(params.userMessage, 2).map((c) => c.id),
    agency_command: res.data.agency_command || 'NONE',
    blueprint_markdown: res.data.blueprint_markdown
  };
}
