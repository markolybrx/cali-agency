import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { MemoryItem, UserProfile } from '../types/agency';

export type ClearanceLevel = 'BOSS' | 'TRUSTED' | 'USER';

export interface SharedMemoryItem {
  id: string;
  topic: string;
  category: string;
  value: string;
  status: 'pending' | 'approved' | 'rejected';
  updated_at: string;
}

export interface SupabaseBrainConfig {
  url: string;
  anonKey: string;
}

export interface CaliBrainCache {
  signedIn: boolean;
  userId: string | null;
  email: string | null;
  clearance: ClearanceLevel;
  sharedMemories: SharedMemoryItem[];
  pendingShared: SharedMemoryItem[];
  lastSyncedAt: string | null;
}

interface QueuedSyncOp {
  kind: 'profile' | 'private_memory' | 'shared_candidate';
  payload: unknown;
}

const CFG_KEY = 'cali_brain_supabase_cfg_v1';
const CACHE_KEY = 'cali_brain_cache_v1';
const QUEUE_KEY = 'cali_brain_offline_queue_v1';

let clientInstance: SupabaseClient | null = null;
let clientSig = '';

export function loadSupabaseConfig(): SupabaseBrainConfig {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SupabaseBrainConfig>;
      if (parsed.url || parsed.anonKey) {
        return { url: parsed.url || '', anonKey: parsed.anonKey || '' };
      }
    }
  } catch {
    // ignore
  }
  const envUrl = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL || '';
  const envKey = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_ANON_KEY || '';
  return { url: envUrl, anonKey: envKey };
}

export function saveSupabaseConfig(cfg: SupabaseBrainConfig): void {
  const clean = { url: cfg.url.trim().replace(/\/+$/, ''), anonKey: cfg.anonKey.trim() };
  localStorage.setItem(CFG_KEY, JSON.stringify(clean));
  clientInstance = null;
  clientSig = '';
}

export function getSupabaseClient(): SupabaseClient | null {
  const cfg = loadSupabaseConfig();
  if (!cfg.url || !cfg.anonKey) return null;
  const sig = `${cfg.url}::${cfg.anonKey}`;
  if (clientInstance && clientSig === sig) return clientInstance;
  clientInstance = createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  clientSig = sig;
  return clientInstance;
}

export function loadBrainCache(): CaliBrainCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw) as CaliBrainCache;
  } catch {
    // ignore
  }
  return {
    signedIn: false,
    userId: null,
    email: null,
    clearance: 'USER',
    sharedMemories: [],
    pendingShared: [],
    lastSyncedAt: null
  };
}

function saveBrainCache(cache: CaliBrainCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

function enqueueOfflineOp(op: QueuedSyncOp): void {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const list: QueuedSyncOp[] = raw ? JSON.parse(raw) : [];
    list.push(op);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-40)));
  } catch {
    // ignore
  }
}

/**
 * Automated PII Scrubber before submitting any candidate to Layer 1 Shared Brain.
 * Blocks/redacts emails, phone numbers, API keys, and tokens.
 */
export function scrubPiiForSharedBrain(text: string): { safe: boolean; cleaned: string; reason?: string } {
  const trimmed = text.trim();
  if (!trimmed) return { safe: false, cleaned: '', reason: 'Empty memory' };
  const secretPatterns = [
    /AQ\.[A-Za-z0-9_-]{10,}/g,
    /AIza[A-Za-z0-9_-]{20,}/g,
    /ghp_[A-Za-z0-9]{20,}/g,
    /sk-[A-Za-z0-9]{16,}/g
  ];
  for (const re of secretPatterns) {
    if (re.test(trimmed)) {
      return { safe: false, cleaned: '', reason: 'Blocked: detected API key or secret token.' };
    }
  }
  const cleaned = trimmed
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\+?\d[\d\s()-]{8,}\d/g, '[redacted-phone]');
  return { safe: true, cleaned };
}

export async function signInWithEmail(email: string, password: string): Promise<{ ok: boolean; detail: string }> {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, detail: 'Configure Supabase URL & Anon Key first.' };
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) return { ok: false, detail: error.message };
  return { ok: true, detail: 'Signed in! Syncing Cali Brain...' };
}

export async function signUpWithEmail(email: string, password: string): Promise<{ ok: boolean; detail: string }> {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, detail: 'Configure Supabase URL & Anon Key first.' };
  const { error } = await sb.auth.signUp({ email: email.trim(), password });
  if (error) return { ok: false, detail: error.message };
  return { ok: true, detail: 'Account created! Check email if confirmation is enabled, or sign in now.' };
}

export async function signInWithGoogle(): Promise<{ ok: boolean; detail: string }> {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, detail: 'Configure Supabase URL & Anon Key first.' };
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo }
  });
  if (error) return { ok: false, detail: error.message };
  return { ok: true, detail: 'Redirecting to Google Sign-In...' };
}

export async function signOutCaliBrain(): Promise<void> {
  const sb = getSupabaseClient();
  if (sb) {
    await sb.auth.signOut().catch(() => {});
  }
  const cleared: CaliBrainCache = {
    signedIn: false,
    userId: null,
    email: null,
    clearance: 'USER',
    sharedMemories: loadBrainCache().sharedMemories,
    pendingShared: [],
    lastSyncedAt: null
  };
  saveBrainCache(cleared);
}

/**
 * Offline-First Cloud Sync:
 * - Never throws or blocks if offline or Supabase isn't configured.
 * - Pulls profile, Layer 2 private_memories, and Layer 1 shared_memories.
 */
export async function syncBrainFromCloud(localProfile: UserProfile, localMemories: MemoryItem[]): Promise<{
  cache: CaliBrainCache;
  mergedProfile: UserProfile;
  mergedMemories: MemoryItem[];
  synced: boolean;
}> {
  const cached = loadBrainCache();
  const sb = getSupabaseClient();
  if (!sb || !navigator.onLine) {
    return { cache: cached, mergedProfile: localProfile, mergedMemories: localMemories, synced: false };
  }

  try {
    const { data: sessionData } = await sb.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) {
      const nextCache: CaliBrainCache = { ...cached, signedIn: false, userId: null, email: null };
      saveBrainCache(nextCache);
      return { cache: nextCache, mergedProfile: localProfile, mergedMemories: localMemories, synced: false };
    }

    // 1. Fetch Profile & Clearance
    const { data: profRow } = await sb
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    let mergedProfile = { ...localProfile };
    let clearance: ClearanceLevel = 'USER';

    if (profRow) {
      clearance = (profRow.clearance as ClearanceLevel) || 'USER';
      if (profRow.onboarding_complete) {
        mergedProfile = {
          preferred_name: profRow.preferred_name || localProfile.preferred_name,
          honorific: profRow.honorific || localProfile.honorific,
          language_pref: (profRow.language_pref as 'en' | 'taglish') || localProfile.language_pref,
          onboarding_topics: profRow.onboarding_topics || {
            name_vibe: true,
            design_taste: true,
            tech_stack: true,
            autonomy: true
          },
          onboarding_complete: true
        };
      } else if (localProfile.onboarding_complete) {
        // Push local completed onboarding up to cloud
        await pushProfileToCloud(localProfile);
      }
    } else if (localProfile.onboarding_complete) {
      await pushProfileToCloud(localProfile);
    }

    // 2. Fetch Layer 2 Private Memories (strictly filtered by RLS to auth.uid())
    const { data: privRows } = await sb
      .from('private_memories')
      .select('*')
      .order('updated_at', { ascending: false });

    const byKey = new Map<string, MemoryItem>();
    for (const m of localMemories) byKey.set(m.key, m);
    for (const r of privRows || []) {
      const existing = byKey.get(r.key);
      if (!existing || new Date(r.updated_at).getTime() >= new Date(existing.updated_at).getTime()) {
        byKey.set(r.key, {
          id: r.id,
          key: r.key,
          type: r.type,
          value: r.value,
          triggers: Array.isArray(r.triggers) ? r.triggers : [],
          source: r.source || 'explicit_user',
          confidence: Number(r.confidence ?? 0.9),
          updated_at: r.updated_at
        });
      }
    }
    const mergedMemories = Array.from(byKey.values());

    // 3. Fetch Layer 1 Shared Brain (approved for all; pending also visible to BOSS)
    const { data: sharedRows } = await sb
      .from('shared_memories')
      .select('*')
      .order('updated_at', { ascending: false });

    const sharedMemories: SharedMemoryItem[] = [];
    const pendingShared: SharedMemoryItem[] = [];
    for (const row of sharedRows || []) {
      const item: SharedMemoryItem = {
        id: row.id,
        topic: row.topic,
        category: row.category,
        value: row.value,
        status: row.status,
        updated_at: row.updated_at
      };
      if (item.status === 'approved') sharedMemories.push(item);
      else if (item.status === 'pending' && clearance === 'BOSS') pendingShared.push(item);
    }

    const nextCache: CaliBrainCache = {
      signedIn: true,
      userId: user.id,
      email: user.email || null,
      clearance,
      sharedMemories,
      pendingShared,
      lastSyncedAt: new Date().toISOString()
    };
    saveBrainCache(nextCache);
    return { cache: nextCache, mergedProfile, mergedMemories, synced: true };
  } catch {
    return { cache: cached, mergedProfile: localProfile, mergedMemories: localMemories, synced: false };
  }
}

export async function pushProfileToCloud(profile: UserProfile): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb || !navigator.onLine) {
    enqueueOfflineOp({ kind: 'profile', payload: profile });
    return;
  }
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (!user) return;
  await sb.from('profiles').upsert({
    id: user.id,
    email: user.email,
    preferred_name: profile.preferred_name,
    honorific: profile.honorific,
    language_pref: profile.language_pref,
    onboarding_topics: profile.onboarding_topics,
    onboarding_complete: profile.onboarding_complete,
    updated_at: new Date().toISOString()
  });
}

export async function pushPrivateMemoryToCloud(mem: MemoryItem): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb || !navigator.onLine) {
    enqueueOfflineOp({ kind: 'private_memory', payload: mem });
    return;
  }
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (!user) return;
  await sb.from('private_memories').upsert(
    {
      user_id: user.id,
      key: mem.key,
      type: mem.type,
      value: mem.value,
      triggers: mem.triggers,
      source: mem.source,
      confidence: mem.confidence,
      updated_at: mem.updated_at
    },
    { onConflict: 'user_id,key' }
  );
}

export async function submitSharedBrainCandidate(
  topic: string,
  category: string,
  rawValue: string
): Promise<{ ok: boolean; detail: string }> {
  const scrub = scrubPiiForSharedBrain(rawValue);
  if (!scrub.safe) return { ok: false, detail: scrub.reason || 'Blocked by PII scrubber' };

  const sb = getSupabaseClient();
  if (!sb || !navigator.onLine) {
    enqueueOfflineOp({ kind: 'shared_candidate', payload: { topic, category, value: scrub.cleaned } });
    return { ok: true, detail: 'Queued for Shared Brain sync when online.' };
  }
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (!user) return { ok: false, detail: 'Sign in to contribute to Shared Brain.' };

  const { error } = await sb.from('shared_memories').upsert(
    {
      topic: topic.trim(),
      category: category || 'coding_pattern',
      value: scrub.cleaned,
      status: 'pending',
      contributed_by: user.id,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'topic' }
  );
  if (error) return { ok: false, detail: error.message };
  return { ok: true, detail: 'Submitted to BOSS approval queue.' };
}

export async function reviewSharedBrainCandidate(
  id: string,
  decision: 'approved' | 'rejected'
): Promise<{ ok: boolean; detail: string }> {
  const sb = getSupabaseClient();
  if (!sb || !navigator.onLine) return { ok: false, detail: 'Internet required to approve shared items.' };
  const { error } = await sb
    .from('shared_memories')
    .update({ status: decision, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, detail: error.message };
  return { ok: true, detail: decision === 'approved' ? 'Promoted to Shared Cali Brain!' : 'Candidate rejected.' };
}

export async function flushOfflineSyncQueue(): Promise<number> {
  if (!navigator.onLine) return 0;
  const sb = getSupabaseClient();
  if (!sb) return 0;
  let list: QueuedSyncOp[] = [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    list = raw ? JSON.parse(raw) : [];
  } catch {
    return 0;
  }
  if (list.length === 0) return 0;
  localStorage.removeItem(QUEUE_KEY);

  let flushed = 0;
  for (const op of list) {
    try {
      if (op.kind === 'profile') await pushProfileToCloud(op.payload as UserProfile);
      else if (op.kind === 'private_memory') await pushPrivateMemoryToCloud(op.payload as MemoryItem);
      else if (op.kind === 'shared_candidate') {
        const p = op.payload as { topic: string; category: string; value: string };
        await submitSharedBrainCandidate(p.topic, p.category, p.value);
      }
      flushed += 1;
    } catch {
      // re-queue failed item
      enqueueOfflineOp(op);
    }
  }
  return flushed;
}
