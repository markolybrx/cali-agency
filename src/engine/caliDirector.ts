import type { MemoryItem, OnboardingTopics, PendingDecision, ProjectState, UserProfile } from '../types/agency';
import type { ClearanceLevel, SharedMemoryItem } from './caliBrain';
import { getPromptByRole } from '../prompts/agencyPrompts';
import { callGeminiJson } from './geminiClient';
import { keyPool } from './keyPool';

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
  agency_command: 'NONE' | 'DRAFT_BLUEPRINT' | 'START_BLUEPRINT' | 'PAUSE_LOOP' | 'RESUME_LOOP' | 'APPROVE_PENDING';
  blueprint_markdown?: string;
}

const CONVERSATIONAL_SYSTEM_ADDENDUM = `
## 3-LAYER JARVIS BRAIN & CONVERSATIONAL ONBOARDING RULES
- You operate with a 3-Layer Brain:
  1. Layer 1 (shared_brain): Non-sensitive collective patterns shared across all users.
  2. Layer 2 (private_vault): Strictly private memories for the current user ONLY. Never leak secrets.
  3. Clearance: If user_clearance is "BOSS", treat them as your primary creator/director (Tony Stark -> JARVIS rapport).
- Be genuinely conversational, warm, and natural—NOT a robotic survey.
- If onboarding_complete is false, check which keys in user_profile.onboarding_topics are still false:
  1. "name_vibe": user's preferred name and English vs Taglish vibe.
  2. "design_taste": visual taste, colors, typography, or UI pet peeves.
  3. "tech_stack": preferred default PWA stack.
  4. "autonomy": whether to pause at Phase Gates or run autonomously until blockers.
- IMPORTANT: Whenever the user answers a topic, ALWAYS include its exact key ("name_vibe", "design_taste", "tech_stack", or "autonomy") in "completed_topics". When all 4 are answered, congratulate them warmly and let them know the dashboard is unlocked.
- Only put strictly non-personal, reusable technical/UX wisdom into "shared_candidates" (never names, emails, keys, or personal details).
- When the user pitches a PWA/APK idea after onboarding, set "agency_command": "DRAFT_BLUEPRINT" and put a clean Markdown blueprint in "blueprint_markdown".
- Return raw valid JSON:
{
  "message": "string",
  "speech": "string or null",
  "memory_ops": [],
  "shared_candidates": [],
  "completed_topics": ["name_vibe"],
  "agency_command": "NONE | DRAFT_BLUEPRINT | START_BLUEPRINT | PAUSE_LOOP | RESUME_LOOP | APPROVE_PENDING",
  "blueprint_markdown": "optional markdown string"
}`;

export async function runCaliTurn(params: {
  userMessage: string;
  history: Array<{ role: 'user' | 'cali'; text: string }>;
  profile: UserProfile;
  memories: MemoryItem[];
  sharedMemories?: SharedMemoryItem[];
  clearance?: ClearanceLevel;
  activeProject: ProjectState | null;
  pendingDecisions: PendingDecision[];
}): Promise<CaliTurnResult> {
  const caliSlot = keyPool.getCaliKey();

  // Offline / no-key conversational fallback
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
              key: currentTopic === 'name_vibe' ? 'user.preferred_name' : `onboarding.${currentTopic}`,
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
          'Nice to meet you. Before I brief the UI Designer, what kind of app aesthetic do you actually love—and any UI pet peeves I should ban?',
        tech_stack:
          'Solid taste—I locked that in. For apps we build together, do you have a favorite stack (like Vanilla JS, React + Vite, Tailwind), or should I pick the leanest one per project?',
        autonomy:
          'Got it. Last thing before I unlock the agency floor: want me to pause and check in with you at every Phase Gate, or keep the 13 agents rolling until we hit a real blocker?'
      };

      if (!nextTopic) {
        return {
          message:
            'Love it—we are completely aligned! I saved your preferences locally and unlocked the Monolith HQ dashboard.',
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

    const lower = params.userMessage.toLowerCase();
    if (lower.includes('pause')) {
      return { message: 'Pausing the agency floor now.', speech: null, memory_ops: [], completed_topics: [], agency_command: 'PAUSE_LOOP' };
    }
    if (lower.includes('resume') || lower.includes('start')) {
      return { message: 'Resuming production on the agency floor.', speech: null, memory_ops: [], completed_topics: [], agency_command: 'RESUME_LOOP' };
    }
    return {
      message: !navigator.onLine
        ? 'You are currently offline. You can still browse all projects, preview code, use the 3D Office, and save .zip backups locally—I will sync automatically once internet returns.'
        : 'Configure KEY_CALI in Settings (and tap Save Settings) so I can converse live and draft blueprints for your 13 agents.',
      speech: null,
      memory_ops: [],
      completed_topics: [],
      agency_command: 'NONE'
    };
  }

  const directorPrompt = getPromptByRole('cali');
  const systemPrompt = `${directorPrompt.content}\n\n---\n\n${CONVERSATIONAL_SYSTEM_ADDENDUM}`;

  const payload = {
    user_clearance: params.clearance || 'USER',
    conversation_history: params.history.slice(-8),
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

  // Safety net: if user is in onboarding and Gemini forgot completed_topics on a turn,
  // infer the next missing topic so the user is NEVER stuck on Q4.
  let completed = Array.isArray(res.data.completed_topics) ? [...res.data.completed_topics] : [];
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
    agency_command: res.data.agency_command || 'NONE',
    blueprint_markdown: res.data.blueprint_markdown
  };
}
