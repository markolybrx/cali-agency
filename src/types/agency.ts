export type ThemeId = 'monolith' | 'nocturne' | 'alabaster';
export type AccentId = 'marigold' | 'lavender' | 'champagne' | 'silverblue';
export type LanguagePref = 'en' | 'taglish';
export type ThinkingLevel = 'low' | 'medium' | 'high';

export type KeySlotId = 'KEY_CALI' | 'K1' | 'K2' | 'K3' | 'K4';
export type KeyStatus = 'UNSET' | 'READY' | 'ACTIVE' | 'COOLDOWN' | 'BACKOFF' | 'INVALID';

export interface KeySlotState {
  id: KeySlotId;
  label: string;
  role: 'cali' | 'worker';
  apiKey: string;
  status: KeyStatus;
  cooldownUntil: number | null;
  backoffMs: number;
  rpmTimestamps: number[];
  rpdCount: number;
  rpdDate: string;
  promptTokens: number;
  outputTokens: number;
  lastContextTokens: number;
  lastError: string | null;
  lastAgent: string | null;
}

export interface TelemetrySummary {
  totalPromptTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  activeRpm: number;
  totalRpd: number;
  maxContextTokens: number;
  lastCallContextTokens: number;
  contextPercent: number;
}

export type WorkerAgentId =
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

export type AgentVisualState = 'IDLE' | 'WALKING' | 'THINKING' | 'CODING' | 'REVIEWING' | 'BLOCKED' | 'TALKING';

export interface AgencyTask {
  task_id: string;
  title: string;
  assigned_agent: WorkerAgentId;
  target_files: string[];
  status: 'PENDING' | 'CODED' | 'REVIEWED' | 'DONE' | 'FAILED';
  retry_count: number;
  split_depth: number;
  last_summary?: string;
  handoff_notes?: string[];
  blockers?: string[];
}

export interface PhaseChecklistItem {
  id: string;
  description: string;
  verified: boolean;
}

export interface AgencyPhase {
  phase_id: number;
  name: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'PASSED' | 'BLOCKED';
  checklist: PhaseChecklistItem[];
  tasks: AgencyTask[];
}

export interface TechStack {
  framework: string;
  language: string;
  styling: string;
  storage_or_backend: string;
  testing_tool: string;
  deployment_target: string;
}

export interface ProjectState {
  id: string;
  project_name: string;
  blueprint_md: string;
  current_phase_id: number;
  tech_stack: TechStack;
  phases: AgencyPhase[];
  file_manifest: Record<string, string>;
  files: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface MemoryItem {
  id: string;
  key: string;
  type: 'preference' | 'pattern' | 'correction' | 'standing_rule';
  value: string;
  triggers: string[];
  source: 'explicit_user' | 'inferred_from_chat' | 'user_correction';
  confidence: number;
  updated_at: string;
}

export interface PendingDecision {
  id: string;
  kind: 'PHASE_GATE' | 'CIRCUIT_BREAKER' | 'KEY_RECOVERY' | 'APPROVAL';
  title: string;
  detail: string;
  approveLabel: string;
  declineLabel: string;
  createdAt: string;
  payload?: Record<string, unknown>;
}

export interface ActivityEvent {
  id: string;
  ts: string;
  agentId: WorkerAgentId | 'cali' | 'watchdog';
  text: string;
  kind: 'info' | 'handoff' | 'warn' | 'success' | 'error';
  keyId?: KeySlotId;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'cali';
  text: string;
  meta?: string;
  ts: string;
}

export interface UserProfile {
  preferred_name: string | null;
  honorific: string | null;
  language_pref: LanguagePref;
  onboarding_step: number;
  onboarding_complete: boolean;
}

export interface PromptEntry {
  id: string;
  filename: string;
  folder: string;
  title: string;
  role: string;
  thinkingLevel: ThinkingLevel;
  content: string;
}
