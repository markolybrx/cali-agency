import { CALI_DIRECTOR_PROMPT, CALI_ONBOARDING_PROMPT } from '../prompts/agencyPrompts';
import type { CaliMemory, CaliProfile, ProjectState } from '../types/agency';
import { callGeminiJson } from './geminiClient';
import { keyPool } from './keyPool';

export interface CaliTurnResult {
  message: string;
  speech: string | null;
  memory_ops: Array<{
    key: string;
    type: 'preference' | 'pattern' | 'correction' | 'standing_rule';
    value: string;
    triggers: string[];
    source: 'explicit_user' | 'inferred_from_chat';
  }>;
  agency_action: 'NONE' | 'START_INTAKE' | 'RESUME_LOOP' | 'PAUSE_LOOP' | 'STAGE_DECISION';
  blueprint_markdown: string | null;
  onboarding_step_done?: boolean;
}

export async function runCaliTurn(params: {
  userMessage: string;
  profile: CaliProfile;
  memories: CaliMemory[];
  project: ProjectState | null;
}): Promise<CaliTurnResult> {
  const caliSlot = keyPool.getCaliKey();
  if (!caliSlot) {
    return {
      message: 'Drop your dedicated Cali API key (KEY_CALI) in Settings first so I can run onboarding and oversee your 13 agents.',
      speech: null,
      memory_ops: [],
      agency_action: 'NONE',
      blueprint_markdown: null
    };
  }

  const systemInstruction = params.profile.onboardingComplete
    ? CALI_DIRECTOR_PROMPT
    : `${CALI_DIRECTOR_PROMPT}\n\n---\n\n${CALI_ONBOARDING_PROMPT}\nCurrent Onboarding Step: ${params.profile.onboardingStep} of 4.`;

  const payload = JSON.stringify({
    user_profile: params.profile,
    memories: params.memories.slice(0, 12),
    active_project: params.project
      ? { name: params.project.project_name, phase: params.project.current_phase_id, stack: params.project.tech_stack }
      : null,
    user_message: params.userMessage
  });

  return await callGeminiJson<CaliTurnResult>({
    apiKey: caliSlot.key,
    systemInstruction,
    userPayload: payload,
    thinkingLevel: 'MEDIUM'
  });
}
