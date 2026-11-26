import type { AgentMetric, MemoryItem, ProjectState, UserProfile } from '../types/agency';

const PROJECTS_KEY = 'cali_agency_projects_v040';
const ACTIVE_PROJECT_KEY = 'cali_agency_active_project_v040';
const MEMORIES_KEY = 'cali_agency_memories_v040';
const PROFILE_KEY = 'cali_agency_profile_v040';
const GITHUB_CFG_KEY = 'cali_agency_github_v040';
const METRICS_KEY = 'cali_agency_metrics_v040';

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

export function createFreshProfile(): UserProfile {
  return {
    preferred_name: null,
    honorific: null,
    language_pref: 'en',
    onboarding_topics: {
      name_vibe: false,
      design_taste: false,
      tech_stack: false,
      autonomy: false
    },
    onboarding_complete: false
  };
}

export function countCompletedTopics(profile: UserProfile): number {
  const t = profile.onboarding_topics;
  return [t.name_vibe, t.design_taste, t.tech_stack, t.autonomy].filter(Boolean).length;
}

export function loadProjects(): ProjectState[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY) || localStorage.getItem('cali_agency_projects_v030');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProjectState[];
    return parsed.map((p) => ({ ...p, snapshots: Array.isArray(p.snapshots) ? p.snapshots : [] }));
  } catch {
    return [];
  }
}

export function saveProjects(projects: ProjectState[]): void {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  } catch {
    // ignore storage quota
  }
}

export function loadActiveProjectId(): string | null {
  return localStorage.getItem(ACTIVE_PROJECT_KEY) || localStorage.getItem('cali_agency_active_project_v030');
}

export function saveActiveProjectId(id: string | null): void {
  if (id) localStorage.setItem(ACTIVE_PROJECT_KEY, id);
  else localStorage.removeItem(ACTIVE_PROJECT_KEY);
}

export function loadMemories(): MemoryItem[] {
  try {
    const raw = localStorage.getItem(MEMORIES_KEY) || localStorage.getItem('cali_agency_memories_v030');
    if (raw) return JSON.parse(raw) as MemoryItem[];
  } catch {
    // ignore
  }
  return [];
}

export function saveMemories(items: MemoryItem[]): void {
  localStorage.setItem(MEMORIES_KEY, JSON.stringify(items));
}

export function upsertMemory(
  items: MemoryItem[],
  op: Omit<MemoryItem, 'id' | 'updated_at'>
): MemoryItem[] {
  const now = new Date().toISOString();
  const idx = items.findIndex((m) => m.key === op.key);
  if (idx >= 0) {
    const updated = [...items];
    updated[idx] = { ...updated[idx], ...op, updated_at: now };
    saveMemories(updated);
    return updated;
  }
  const next: MemoryItem[] = [
    { ...op, id: `mem_${Date.now().toString(36)}`, updated_at: now },
    ...items
  ];
  saveMemories(next);
  return next;
}

export function loadProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY) || localStorage.getItem('cali_agency_profile_v030');
    if (raw) {
      const p = JSON.parse(raw) as Partial<UserProfile>;
      const base = createFreshProfile();
      const topics = p.onboarding_topics
        ? { ...base.onboarding_topics, ...p.onboarding_topics }
        : p.onboarding_complete
        ? { name_vibe: true, design_taste: true, tech_stack: true, autonomy: true }
        : base.onboarding_topics;
      return {
        ...base,
        ...p,
        onboarding_topics: topics,
        onboarding_complete: Boolean(p.onboarding_complete)
      };
    }
  } catch {
    // ignore
  }
  return createFreshProfile();
}

export function saveProfile(profile: UserProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function loadGitHubConfig(): GitHubConfig {
  try {
    const raw = localStorage.getItem(GITHUB_CFG_KEY) || localStorage.getItem('cali_agency_github_v030');
    if (raw) return JSON.parse(raw) as GitHubConfig;
  } catch {
    // ignore
  }
  return { token: '', owner: '', repo: '', branch: 'main' };
}

export function saveGitHubConfig(cfg: GitHubConfig): void {
  localStorage.setItem(GITHUB_CFG_KEY, JSON.stringify(cfg));
}

export function loadAgentMetrics(): Record<string, AgentMetric> {
  try {
    const raw = localStorage.getItem(METRICS_KEY);
    if (raw) return JSON.parse(raw) as Record<string, AgentMetric>;
  } catch {
    // ignore
  }
  return {};
}

export function saveAgentMetrics(metrics: Record<string, AgentMetric>): void {
  try {
    localStorage.setItem(METRICS_KEY, JSON.stringify(metrics));
  } catch {
    // ignore
  }
}

function toBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function shipProjectToGitHub(
  project: ProjectState,
  cfg: GitHubConfig,
  onProgress?: (msg: string) => void
): Promise<{ pushedCount: number; repoUrl: string }> {
  if (!cfg.token || !cfg.owner || !cfg.repo) {
    throw new Error('Configure GitHub PAT, owner, and repository name in Settings first.');
  }
  const headers = {
    Authorization: `Bearer ${cfg.token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json'
  };
  const baseUrl = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
  const allFiles: Record<string, string> = {
    'project-blueprint.md': project.blueprint_md || '# Project Blueprint',
    ...project.files
  };
  const entries = Object.entries(allFiles);
  let pushedCount = 0;

  for (const [rawPath, content] of entries) {
    const cleanPath = rawPath.replace(/^\/+/, '');
    onProgress?.(`Pushing ${cleanPath} (${pushedCount + 1}/${entries.length})...`);
    let sha: string | undefined;
    const checkRes = await fetch(`${baseUrl}/contents/${cleanPath}?ref=${encodeURIComponent(cfg.branch || 'main')}`, {
      headers
    });
    if (checkRes.ok) {
      const existing = (await checkRes.json()) as { sha?: string };
      sha = existing.sha;
    }
    const putRes = await fetch(`${baseUrl}/contents/${cleanPath}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: `chore(agency): ship ${cleanPath}`,
        content: toBase64Utf8(content),
        branch: cfg.branch || 'main',
        ...(sha ? { sha } : {})
      })
    });
    if (!putRes.ok) {
      const errText = await putRes.text().catch(() => '');
      throw new Error(`GitHub push failed on ${cleanPath}: HTTP ${putRes.status} ${errText.slice(0, 100)}`);
    }
    pushedCount += 1;
  }

  return { pushedCount, repoUrl: `https://github.com/${cfg.owner}/${cfg.repo}` };
}
