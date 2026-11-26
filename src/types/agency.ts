export type ThemeId = 'monolith' | 'nocturne' | 'alabaster';
export type AccentId = 'marigold' | 'lavender' | 'champagne' | 'silverblue';
export type ThinkingLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type KeySlotId = 'KEY_CALI' | 'K1' | 'K2' | 'K3' | 'K4';

export type KeyStatus = 'UNSET' | 'READY' | 'ACTIVE' | 'COOLDOWN' | 'RPD_EXHAUSTED' | 'OFFLINE' | 'INVALID';

export interface ApiKeySlot {
  id: KeySlotId;
  label: string;
  role: 'executive' | 'worker';
  key: string;
  status: KeyStatus;
  cooldownUntil: number | null;
  rpmCount: number;
  rpdCount: number;
  lastError: string | null;
  activeAgentId: string | null;
}

export type AgentId =
  | 'cali-director'
  | 'project-planner'
  | 'master-orchestrator'
  | 'ui-designer'
  | 'api-designer'
  | 'frontend-developer'
  | 'dynamic-stack-specialist'
  | 'backend-developer'
  | 'code-reviewer'
  | 'qa-tester'
  | 'debugger'
  | 'accessibility-tester'
  | 'performance-engineer'
  | 'deployment-engineer';

export interface AgentPromptDef {
  id: AgentId;
  name: string;
  shortName: string;
  zone: 'executive' | 'control' | 'design' | 'build' | 'audit';
  thinkingLevel: ThinkingLevel;
  systemPrompt: string;
}

export interface TechStack {
  framework: string;
  language: string;
  styling: string;
  storage_or_backend: string;
  testing_tool: string;
  deployment_target: string;
}

export interface PhaseChecklistItem {
  id: string;
  description: string;
  verified: boolean;
}

export interface AgencyTask {
  task_id: string;
  title: string;
  assigned_agent: AgentId;
  target_files: string[];
  status: 'PENDING' | 'CODED' | 'REVIEWED' | 'DONE' | 'FAILED';
  retry_count: number;
  split_depth: number;
  last_summary?: string;
}

export interface AgencyPhase {
  phase_id: number;
  name: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'PASSED' | 'BLOCKED';
  checklist: PhaseChecklistItem[];
  tasks: AgencyTask[];
}

export interface ProjectState {
  project_name: string;
  current_phase_id: number;
  tech_stack: TechStack;
  phases: AgencyPhase[];
  file_manifest: Record<string, string>;
}

export interface WorkerEnvelope {
  agent_id: string;
  task_id: string;
  status: 'COMPLETED' | 'NEEDS_REVISION' | 'BLOCKED';
  summary: string;
  files: Array<{ path: string; action: 'CREATE' | 'UPDATE' | 'DELETE'; content: string }>;
  verification_commands: string[];
  handoff_notes: string[];
  blockers: string[];
}

export interface OrchestratorDecision {
  mode: 'INTAKE' | 'PHASE_GATE' | 'RECOVER';
  decision: 'START_PHASE' | 'ADVANCE_PHASE' | 'REQUEUE_TASK' | 'SPLIT_TASK' | 'PROJECT_COMPLETE' | 'PAUSE_FOR_HUMAN';
  reasoning: string;
  updated_project_state: ProjectState;
  next_dispatch: {
    task_id: string | null;
    agent_id: AgentId | null;
    instructions: string;
  };
}

export interface CaliMemory {
  id: string;
  type: 'preference' | 'pattern' | 'correction' | 'standing_rule';
  key: string;
  value: string;
  triggers: string[];
  source: 'explicit_user' | 'inferred_from_chat' | 'user_correction';
  confidence: number;
  updatedAt: string;
}

export interface CaliProfile {
  preferredName: string | null;
  languagePref: 'en' | 'taglish';
  onboardingComplete: boolean;
  onboardingStep: number;
  autoResumeOnKeyRecovery: boolean;
  autoAdvancePhases: boolean;
}

export interface PendingDecision {
  id: string;
  title: string;
  detail: string;
  recommendedCall: string;
  kind: 'PHASE_GATE' | 'RECOVER' | 'INTAKE' | 'KEY_RECOVERY';
  approveLabel: string;
  declineLabel: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'cali';
  text: string;
  meta?: string;
}

export interface WorkspaceFile {
  path: string;
  content: string;
  updatedBy: string;
  updatedAt: string;
}

export interface AgencyActivity {
  id: string;
  timestamp: string;
  fromAgent: AgentId;
  toAgent?: AgentId;
  summary: string;
  keyId?: KeySlotId;
  status: 'working' | 'handoff' | 'done' | 'blocked' | 'watchdog';
}
