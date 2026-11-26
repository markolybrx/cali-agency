import type { MemoryItem, OnboardingTopics, PendingDecision, ProjectState, UserProfile } from '../types/agency';
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
  completed_topics: Array<keyof OnboardingTopics>;
  agency_command: 'NONE' | 'DRAFT_BLUEPRINT' | 'START_BLUEPRINT' | 'PAUSE_LOOP' | 'RESUME_LOOP' | 'APPROVE_PENDING';
  blueprint_markdown?: string;
}

const CONVERSATIONAL_SYSTEM_ADDENDUM = `
## CONVERSATIONAL ONBOARDING & BLUEPRINT RULES
- Be genuinely conversational, warm, and natural—like a sharp creative partner over coffee, NOT a robotic survey or form.
- If onboarding_complete is false, check which keys in user_profile.onboarding_topics are still false:
  1. "name_vibe": user's preferred name and English vs Taglish vibe.
  2. "design_taste": visual taste, colors, typography, or UI pet peeves.
  3. "tech_stack": preferred default PWA stack.
  4. "autonomy": whether to pause at Phase Gates or run autonomously until blockers.
- Weave naturally into the next missing topic based on what the user actually said. If they answer multiple topics in one reply, acknowledge all of them and mark all answered topics in "completed_topics".
- NEVER mark a topic in "completed_topics" unless the user actually answered it in this turn.
- When the user pitches a PWA/app idea after onboarding, set "agency_command": "DRAFT_BLUEPRINT" and put a clean Markdown blueprint in "blueprint_markdown" so the user can review and approve it in a live card before the 13 agents start.
- Return raw valid JSON:
{
  "message": "string",
  "speech": "string or null",
  "memory_ops": [],
  "completed_topics": ["name_vibe"],
  "agency_command": "NONE | DRAFT_BLUEPRINT | START_BLUEPRINT | PAUSE_LOOP | RESUME_LOOP | APPROVE_PENDING",
  "blueprint_markdown": "optional markdown string"
}`;

export async function runCaliTurn(params: {
  userMessage: string;
  history: Array<{ role: 'user' | 'cali'; text: string }>;
  profile: UserProfile;
  memories: MemoryItem[];
  activeProject: ProjectState | null;
  pendingDecisions: PendingDecision[];
}): Promise<CaliTurnResult> {
  const caliSlot = keyPool.getCaliKey();

  // Smart offline conversational fallback when KEY_CALI is not yet configured
  if (!caliSlot) {
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
          'Solid taste—I locked that in. For quick PWAs we build together, do you have a favorite stack (like Vanilla JS, React + Vite, Tailwind), or should I pick the leanest one per project?',
        autonomy:
          'Got it. Last thing before I unlock the agency floor: want me to pause and check in with you at every Phase Gate, or keep the 13 agents rolling until we hit a real blocker?'
      };

      if (!nextTopic) {
        return {
          message:
            'Love it—we are completely aligned. I have saved your profile and unlocked the Monolith HQ dashboard. Whenever you are ready for live AI reasoning, drop your KEY_CALI in Settings and tap Save.',
          speech: null,
          memory_ops: ops,
          completed_topics: currentTopic ? [currentTopic] : [],
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
      message: 'Configure KEY_CALI in Settings (and tap Save Settings) so I can converse live and draft blueprints for your 13 agents.',
      speech: null,
      memory_ops: [],
      completed_topics: [],
      agency_command: 'NONE'
    };
  }

  const directorPrompt = getPromptByRole('cali');
  const systemPrompt = `${directorPrompt.content}\n\n---\n\n${CONVERSATIONAL_SYSTEM_ADDENDUM}`;

  const payload = {
    conversation_history: params.history.slice(-8),
    user_message: params.userMessage,
    user_profile: params.profile,
    memories: params.memories.slice(0, 12),
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

  return {
    message: res.data.message || 'Got it.',
    speech: res.data.speech ?? null,
    memory_ops: Array.isArray(res.data.memory_ops) ? res.data.memory_ops : [],
    completed_topics: Array.isArray(res.data.completed_topics) ? res.data.completed_topics : [],
    agency_command: res.data.agency_command || 'NONE',
    blueprint_markdown: res.data.blueprint_markdown
  };
}
