import JSZip from 'jszip';
import type { MemoryItem, ProjectState, UserProfile } from '../types/agency';

const PROJECTS_KEY = 'cali_agency_projects_v020';
const ACTIVE_PROJECT_KEY = 'cali_agency_active_project_v020';
const MEMORIES_KEY = 'cali_agency_memories_v020';
const PROFILE_KEY = 'cali_agency_profile_v020';
const GITHUB_CFG_KEY = 'cali_agency_github_v020';

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

export function loadProjects(): ProjectState[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    return raw ? (JSON.parse(raw) as ProjectState[]) : [];
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
  return localStorage.getItem(ACTIVE_PROJECT_KEY);
}

export function saveActiveProjectId(id: string | null): void {
  if (id) localStorage.setItem(ACTIVE_PROJECT_KEY, id);
  else localStorage.removeItem(ACTIVE_PROJECT_KEY);
}

export function loadMemories(): MemoryItem[] {
  try {
    const raw = localStorage.getItem(MEMORIES_KEY);
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
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) return JSON.parse(raw) as UserProfile;
  } catch {
    // ignore
  }
  return {
    preferred_name: null,
    honorific: null,
    language_pref: 'en',
    onboarding_step: 1,
    onboarding_complete: false
  };
}

export function saveProfile(profile: UserProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function loadGitHubConfig(): GitHubConfig {
  try {
    const raw = localStorage.getItem(GITHUB_CFG_KEY);
    if (raw) return JSON.parse(raw) as GitHubConfig;
  } catch {
    // ignore
  }
  return { token: '', owner: '', repo: '', branch: 'main' };
}

export function saveGitHubConfig(cfg: GitHubConfig): void {
  localStorage.setItem(GITHUB_CFG_KEY, JSON.stringify(cfg));
}

export async function exportProjectZip(project: ProjectState): Promise<void> {
  const zip = new JSZip();
  const folderName = project.project_name.toLowerCase().replace(/[^a-z0-9-]+/g, '-') || 'pwa-project';
  const root = zip.folder(folderName)!;
  root.file('project-blueprint.md', project.blueprint_md || '# Blueprint');
  root.file('project_state.json', JSON.stringify({ ...project, files: undefined }, null, 2));
  for (const [path, content] of Object.entries(project.files)) {
    root.file(path.replace(/^\/+/, ''), content);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${folderName}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
