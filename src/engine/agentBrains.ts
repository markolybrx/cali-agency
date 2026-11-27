import { ORG_ROSTER, getOrgMemberByLegacyId } from '../data/orgHierarchy';

export interface AgentLesson {
  id: string;
  source: 'coaching_pod' | 'squad_huddle' | 'reviewer' | 'ceo_direct';
  rule: string;
  taskId?: string;
  learnedAt: string;
}

export interface AgentStudyNote {
  id: string;
  topic: string;
  takeaway: string;
  sources: string[];
  learnedAt: string;
}

export interface AgentBrain {
  agentId: string;
  name: string;
  title: string;
  xp: number;
  level: number;
  lessons: AgentLesson[];
  studyNotes: AgentStudyNote[];
  updatedAt: string;
}

const DB_NAME = 'cali_agent_brains_db';
const DB_VERSION = 1;
const STORE_BRAINS = 'brains';

const brainCache = new Map<string, AgentBrain>();

function calcLevel(xp: number): number {
  return Math.max(1, Math.floor(xp / 100) + 1);
}

function createSeedBrain(agentId: string): AgentBrain {
  const member = getOrgMemberByLegacyId(agentId);
  return {
    agentId: member.id,
    name: member.name,
    title: member.title,
    xp: 25,
    level: 1,
    lessons: [],
    studyNotes: [],
    updatedAt: new Date().toISOString()
  };
}

function openBrainsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_BRAINS)) {
        db.createObjectStore(STORE_BRAINS, { keyPath: 'agentId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open brains DB'));
  });
}

async function putBrainToIdb(brain: AgentBrain): Promise<void> {
  try {
    const db = await openBrainsDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_BRAINS, 'readwrite');
      tx.objectStore(STORE_BRAINS).put(brain);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

export async function hydrateAgentBrains(): Promise<Record<string, AgentBrain>> {
  for (const m of ORG_ROSTER) {
    if (!brainCache.has(m.id)) {
      brainCache.set(m.id, createSeedBrain(m.id));
    }
  }
  try {
    const db = await openBrainsDb();
    const rows = await new Promise<AgentBrain[]>((resolve, reject) => {
      const tx = db.transaction(STORE_BRAINS, 'readonly');
      const req = tx.objectStore(STORE_BRAINS).getAll();
      req.onsuccess = () => resolve((req.result as AgentBrain[]) || []);
      req.onerror = () => reject(req.error);
    });
    for (const r of rows) {
      if (r && r.agentId) brainCache.set(r.agentId, r);
    }
  } catch {
    // ignore
  }
  return exportAllAgentBrains();
}

export function getAgentBrain(agentId: string): AgentBrain {
  const member = getOrgMemberByLegacyId(agentId);
  let existing = brainCache.get(member.id);
  if (!existing) {
    existing = createSeedBrain(member.id);
    brainCache.set(member.id, existing);
  }
  return {
    ...existing,
    lessons: [...existing.lessons],
    studyNotes: [...existing.studyNotes]
  };
}

export function exportAllAgentBrains(): Record<string, AgentBrain> {
  for (const m of ORG_ROSTER) {
    if (!brainCache.has(m.id)) brainCache.set(m.id, createSeedBrain(m.id));
  }
  const out: Record<string, AgentBrain> = {};
  brainCache.forEach((val, key) => {
    out[key] = { ...val, lessons: [...val.lessons], studyNotes: [...val.studyNotes] };
  });
  return out;
}

export async function importAllAgentBrains(map: Record<string, AgentBrain>): Promise<Record<string, AgentBrain>> {
  for (const [id, raw] of Object.entries(map || {})) {
    if (!raw || typeof raw !== 'object') continue;
    const member = getOrgMemberByLegacyId(id);
    const normalized: AgentBrain = {
      agentId: member.id,
      name: raw.name || member.name,
      title: raw.title || member.title,
      xp: Number(raw.xp || 25),
      level: calcLevel(Number(raw.xp || 25)),
      lessons: Array.isArray(raw.lessons) ? raw.lessons.slice(0, 25) : [],
      studyNotes: Array.isArray(raw.studyNotes) ? raw.studyNotes.slice(0, 20) : [],
      updatedAt: raw.updatedAt || new Date().toISOString()
    };
    brainCache.set(member.id, normalized);
    await putBrainToIdb(normalized);
  }
  return exportAllAgentBrains();
}

export async function recordAgentLesson(
  agentId: string,
  source: AgentLesson['source'],
  rule: string,
  taskId?: string
): Promise<AgentBrain> {
  const cleanRule = rule.trim();
  const cur = getAgentBrain(agentId);
  if (!cleanRule) return cur;

  const deduped = cur.lessons.filter((l) => l.rule.toLowerCase() !== cleanRule.toLowerCase());
  const nextXp = cur.xp + (source === 'ceo_direct' ? 30 : 20);
  const updated: AgentBrain = {
    ...cur,
    xp: nextXp,
    level: calcLevel(nextXp),
    lessons: [
      {
        id: 'les_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5),
        source,
        rule: cleanRule,
        taskId,
        learnedAt: new Date().toISOString()
      },
      ...deduped
    ].slice(0, 25),
    updatedAt: new Date().toISOString()
  };
  brainCache.set(updated.agentId, updated);
  await putBrainToIdb(updated);
  return updated;
}

export async function recordAgentStudyNotes(
  agentId: string,
  topic: string,
  takeaways: string[],
  sources: string[]
): Promise<AgentBrain> {
  const cur = getAgentBrain(agentId);
  const now = new Date().toISOString();
  const newNotes: AgentStudyNote[] = takeaways
    .map((t) => t.trim())
    .filter(Boolean)
    .map((takeaway, idx) => ({
      id: 'std_' + Date.now().toString(36) + '_' + idx,
      topic,
      takeaway,
      sources: sources.slice(0, 4),
      learnedAt: now
    }));

  const nextXp = cur.xp + 35;
  const updated: AgentBrain = {
    ...cur,
    xp: nextXp,
    level: calcLevel(nextXp),
    studyNotes: [...newNotes, ...cur.studyNotes].slice(0, 20),
    updatedAt: now
  };
  brainCache.set(updated.agentId, updated);
  await putBrainToIdb(updated);
  return updated;
}

export function getAgentBrainSummaryForPrompt(agentId: string): {
  level: number;
  personal_lessons_learned: string[];
  recent_web_study_notes: string[];
} {
  const brain = getAgentBrain(agentId);
  return {
    level: brain.level,
    personal_lessons_learned: brain.lessons.slice(0, 6).map((l) => `[${l.source}] ${l.rule}`),
    recent_web_study_notes: brain.studyNotes.slice(0, 4).map((s) => `[${s.topic}] ${s.takeaway}`)
  };
}
