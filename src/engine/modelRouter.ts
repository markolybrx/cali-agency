import type { WorkerAgentId } from '../types/agency';

export interface ModelRoutingConfig {
  enabled: boolean;
  heavyModel: string;
  fastModel: string;
}

const ROUTING_KEY = 'cali_agency_model_routing_v090';

const HEAVY_ROLES = new Set<string>([
  'master-orchestrator',
  'project-planner',
  'ui-designer',
  'api-designer',
  'frontend-developer',
  'backend-developer',
  'dynamic-stack-specialist',
  'code-reviewer',
  'debugger'
]);

export const DEFAULT_MODEL_ROUTING: ModelRoutingConfig = {
  enabled: false,
  heavyModel: 'gemini-2.5-pro',
  fastModel: 'gemini-2.5-flash'
};

export function loadModelRouting(): ModelRoutingConfig {
  try {
    const raw = localStorage.getItem(ROUTING_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ModelRoutingConfig>;
      return {
        enabled: Boolean(parsed.enabled),
        heavyModel: parsed.heavyModel || DEFAULT_MODEL_ROUTING.heavyModel,
        fastModel: parsed.fastModel || DEFAULT_MODEL_ROUTING.fastModel
      };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_MODEL_ROUTING };
}

export function saveModelRouting(cfg: ModelRoutingConfig): void {
  try {
    localStorage.setItem(ROUTING_KEY, JSON.stringify(cfg));
  } catch {
    // ignore
  }
}

export function resolveModelForRole(agentId: WorkerAgentId | string): string | undefined {
  const cfg = loadModelRouting();
  if (!cfg.enabled) return undefined;
  return HEAVY_ROLES.has(agentId) ? cfg.heavyModel : cfg.fastModel;
}
