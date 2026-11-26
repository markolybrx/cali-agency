import JSZip from 'jszip';
import type { ApiKeySlot, CaliMemory, CaliProfile, PendingDecision, ProjectState, WorkspaceFile } from '../types/agency';

const KEYS = {
  API_KEYS: 'cali_agency_5keys_v1',
  PROFILE: 'cali_agency_profile_v1',
  MEMORIES: 'cali_agency_memories_v1',
  PROJECT: 'cali_agency_project_v1',
  FILES: 'cali_agency_files_v1',
  DECISIONS: 'cali_agency_decisions_v1',
  THEME: 'cali_theme',
  ACCENT: 'cali_accent'
};

export const DEFAULT_KEY_SLOTS: ApiKeySlot[] = [
  { id: 'KEY_CALI', label: 'Cali (Executive & Live)', role: 'executive', key: '', status: 'UNSET', cooldownUntil: null, rpmCount: 0, rpdCount: 0, lastError: null, activeAgentId: null },
  { id: 'K1', label: 'Worker Key 1', role: 'worker', key: '', status: 'UNSET', cooldownUntil: null, rpmCount: 0, rpdCount: 0, lastError: null, activeAgentId: null },
  { id: 'K2', label: 'Worker Key 2', role: 'worker', key: '', status: 'UNSET', cooldownUntil: null, rpmCount: 0, rpdCount: 0, lastError: null, activeAgentId: null },
  { id: 'K3', label: 'Worker Key 3', role: 'worker', key: '', status: 'UNSET', cooldownUntil: null, rpmCount: 0, rpdCount: 0, lastError: null, activeAgentId: null },
  { id: 'K4', label: 'Worker Key 4', role: 'worker', key: '', status: 'UNSET', cooldownUntil: null, rpmCount: 0, rpdCount: 0, lastError: null, activeAgentId: null }
];

export const DEFAULT_PROFILE: CaliProfile = {
  preferredName: null,
  languagePref: 'en',
  onboardingComplete: false,
  onboardingStep: 1,
  autoResumeOnKeyRecovery: true,
  autoAdvancePhases: false
};

function safeRead<T>(k: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(k: string, val: unknown): void {
  try {
    localStorage.setItem(k, JSON.stringify(val));
  } catch (e) {
    console.warn('Storage write warning:', e);
  }
}

export const storage = {
  loadKeys(): ApiKeySlot[] {
    const saved = safeRead<ApiKeySlot[]>(KEYS.API_KEYS, DEFAULT_KEY_SLOTS);
    return DEFAULT_KEY_SLOTS.map((def) => {
      const match = saved.find((s) => s.id === def.id);
      if (!match) return def;
      return {
        ...def,
        key: match.key || '',
        status: match.key ? 'READY' : 'UNSET',
        rpdCount: match.rpdCount || 0
      };
    });
  },
  saveKeys(slots: ApiKeySlot[]) { safeWrite(KEYS.API_KEYS, slots); },

  loadProfile(): CaliProfile { return { ...DEFAULT_PROFILE, ...safeRead(KEYS.PROFILE, DEFAULT_PROFILE) }; },
  saveProfile(p: CaliProfile) { safeWrite(KEYS.PROFILE, p); },

  loadMemories(): CaliMemory[] { return safeRead(KEYS.MEMORIES, []); },
  saveMemories(m: CaliMemory[]) { safeWrite(KEYS.MEMORIES, m); },

  loadProject(): ProjectState | null { return safeRead(KEYS.PROJECT, null); },
  saveProject(p: ProjectState | null) { safeWrite(KEYS.PROJECT, p); },

  loadFiles(): WorkspaceFile[] { return safeRead(KEYS.FILES, []); },
  saveFiles(f: WorkspaceFile[]) { safeWrite(KEYS.FILES, f); },

  loadDecisions(): PendingDecision[] { return safeRead(KEYS.DECISIONS, []); },
  saveDecisions(d: PendingDecision[]) { safeWrite(KEYS.DECISIONS, d); },

  async exportWorkspaceZip(projectName: string, files: WorkspaceFile[]): Promise<void> {
    const zip = new JSZip();
    const safeName = (projectName || 'pwa-project').toLowerCase().replace(/[^a-z0-9-_]+/g, '-');
    const root = zip.folder(safeName)!;
    files.forEach((f) => root.file(f.path, f.content));
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};
