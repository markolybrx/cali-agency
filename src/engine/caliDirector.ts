import type { MemoryItem, PendingDecision, ProjectState, UserProfile } from '../types/agency';
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
  agency_command: 'NONE' | 'START_BLUEPRINT' | 'PAUSE_LOOP' | 'RESUME_LOOP' | 'APPROVE_PENDING';
  blueprint_idea?: string;
}

const ONBOARDING_FALLBACK_QUESTIONS = [
  "Hey, I'm Cali—your Executive Director here. Before we spin up the 13-agent floor, what should I call you, and do you prefer clean English or natural Taglish?",
  "Got it. What's your visual taste for apps we build? Any favorite typography, color accents, or UI pet peeves I should lock in for the UI Designer?",
  "Noted. What's your go-to tech stack for quick PWAs—Vanilla HTML/CSS/JS, React + Vite + Tailwind, or something else?",
  "Last one: how hands-on do you want to be? Should I pause at every Phase Gate for your sign-off, or run autonomously and only ping you on blockers?"
];

export function getOnboardingPrompt(step: number): string {
  return ONBOARDING_FALLBACK_QUESTIONS[Math.min(step - 1, ONBOARDING_FALLBACK_QUESTIONS.length - 1)];
}

export async function runCaliTurn(params: {
  userMessage: string;
  profile: UserProfile;
  memories: MemoryItem[];
  activeProject: ProjectState | null;
  pendingDecisions: PendingDecision[];
}): Promise<CaliTurnResult> {
  const caliSlot = keyPool.getCaliKey();

  // Offline / Unset key smart fallback so Onboarding & Commands still work smoothly
  if (!caliSlot) {
    if (!params.profile.onboarding_complete) {
      const step = params.profile.onboarding_step;
      const keys = ['user.preferred_name', 'design.taste', 'stack.default', 'agency.autonomy'];
      const ops: CaliTurnResult['memory_ops'] = [
        {
          op: 'upsert',
          type: 'preference',
          key: keys[step - 1] || `onboarding.step_${step}`,
          value: params.userMessage.trim(),
          triggers: ['onboarding', 'preference'],
          source: 'explicit_user',
          confidence: 0.95
        }
      ];
      if (step >= 4) {
        ops.push({
          op: 'upsert',
          type: 'standing_rule',
          key: 'user.onboarding_complete',
          value: 'true',
          triggers: ['onboarding'],
          source: 'explicit_user',
          confidence: 1.0
        });
        return {
          message:
            "All locked in. I've briefed the floor on your taste and autonomy rules. Add your API keys in Settings—or hit Demo Sprint on the dashboard to watch the 13 pixel agents in action right now.",
          speech: null,
          memory_ops: ops,
          agency_command: 'NONE'
        };
      }
      return {
        message: ONBOARDING_FALLBACK_QUESTIONS[step],
        speech: null,
        memory_ops: ops,
        agency_command: 'NONE'
      };
    }

    const lower = params.userMessage.toLowerCase();
    if (lower.includes('pause')) {
      return { message: 'Pausing the agency loop now.', speech: null, memory_ops: [], agency_command: 'PAUSE_LOOP' };
    }
    if (lower.includes('resume') || lower.includes('start')) {
      return { message: 'Resuming the agency floor.', speech: null, memory_ops: [], agency_command: 'RESUME_LOOP' };
    }
    return {
      message:
        'Add your dedicated KEY_CALI in the 5-Key Vault (top-right sliders) for live Gemini reasoning, or tap Demo Sprint to test the full 13-agent floor offline.',
      speech: null,
      memory_ops: [],
      agency_command: 'NONE'
    };
  }

  const directorPrompt = getPromptByRole('cali');
  const onboardingPrompt = getPromptByRole('cali-onboarding');
  const systemPrompt = params.profile.onboarding_complete
    ? directorPrompt.content
    : `${directorPrompt.content}\n\n---\n\n${onboardingPrompt.content}`;

  const payload = {
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
    temperature: 0.55
  });

  return {
    message: res.data.message || 'Done.',
    speech: res.data.speech ?? null,
    memory_ops: Array.isArray(res.data.memory_ops) ? res.data.memory_ops : [],
    agency_command: res.data.agency_command || 'NONE',
    blueprint_idea: res.data.blueprint_idea
  };
}
