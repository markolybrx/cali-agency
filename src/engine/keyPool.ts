import type { KeySlotId, KeySlotState, TelemetrySummary } from '../types/agency';

const STORAGE_KEY = 'cali_agency_5keys_v020';
const MAX_CONTEXT_WINDOW = 1_048_576; // 1M context window for Gemini Flash-Lite
const COOLDOWN_429_MS = 60_000;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function makeDefaultSlots(): Record<KeySlotId, KeySlotState> {
  const today = todayKey();
  const base = (id: KeySlotId, label: string, role: 'cali' | 'worker'): KeySlotState => ({
    id,
    label,
    role,
    apiKey: '',
    status: 'UNSET',
    cooldownUntil: null,
    backoffMs: 15_000,
    rpmTimestamps: [],
    rpdCount: 0,
    rpdDate: today,
    promptTokens: 0,
    outputTokens: 0,
    lastContextTokens: 0,
    lastError: null,
    lastAgent: null
  });
  return {
    KEY_CALI: base('KEY_CALI', 'Cali Dedicated', 'cali'),
    K1: base('K1', 'Worker Key 1', 'worker'),
    K2: base('K2', 'Worker Key 2', 'worker'),
    K3: base('K3', 'Worker Key 3', 'worker'),
    K4: base('K4', 'Worker Key 4', 'worker')
  };
}

export class FiveKeyPool {
  private slots: Record<KeySlotId, KeySlotState>;
  private rrIndex = 0;
  private workerOrder: KeySlotId[] = ['K1', 'K2', 'K3', 'K4'];
  private listeners = new Set<() => void>();
  private watchdogTimer: number | null = null;
  private onWatchdogRecover: ((keyId: KeySlotId) => void) | null = null;
  private tickTimer: number | null = null;

  constructor() {
    this.slots = this.load();
    this.tickTimer = window.setInterval(() => this.pruneAndRefresh(), 1000);
  }

  public subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.save();
    this.listeners.forEach((fn) => fn());
  }

  private load(): Record<KeySlotId, KeySlotState> {
    const defaults = makeDefaultSlots();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw) as Partial<Record<KeySlotId, Partial<KeySlotState>>>;
      const today = todayKey();
      (Object.keys(defaults) as KeySlotId[]).forEach((id) => {
        const s = parsed[id];
        if (!s) return;
        const apiKey = typeof s.apiKey === 'string' ? s.apiKey.trim() : '';
        const sameDay = s.rpdDate === today;
        defaults[id] = {
          ...defaults[id],
          ...s,
          apiKey,
          status: apiKey ? (s.status === 'INVALID' ? 'INVALID' : 'READY') : 'UNSET',
          cooldownUntil: null,
          rpmTimestamps: [],
          rpdDate: today,
          rpdCount: sameDay ? Number(s.rpdCount || 0) : 0,
          promptTokens: Number(s.promptTokens || 0),
          outputTokens: Number(s.outputTokens || 0),
          lastContextTokens: Number(s.lastContextTokens || 0)
        };
      });
    } catch {
      // ignore corrupt storage
    }
    return defaults;
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.slots));
    } catch {
      // ignore quota error
    }
  }

  private pruneAndRefresh(): void {
    const now = Date.now();
    let changed = false;
    const today = todayKey();
    for (const id of Object.keys(this.slots) as KeySlotId[]) {
      const slot = this.slots[id];
      const beforeRpm = slot.rpmTimestamps.length;
      slot.rpmTimestamps = slot.rpmTimestamps.filter((ts) => now - ts < 60_000);
      if (slot.rpmTimestamps.length !== beforeRpm) changed = true;

      if (slot.rpdDate !== today) {
        slot.rpdDate = today;
        slot.rpdCount = 0;
        changed = true;
      }

      if ((slot.status === 'COOLDOWN' || slot.status === 'BACKOFF') && slot.cooldownUntil && now >= slot.cooldownUntil) {
        slot.status = slot.apiKey ? 'READY' : 'UNSET';
        slot.cooldownUntil = null;
        changed = true;
      }
    }
    if (changed) this.emit();
  }

  public setKey(id: KeySlotId, rawKey: string): void {
    const clean = rawKey.trim();
    const slot = this.slots[id];
    slot.apiKey = clean;
    slot.status = clean ? 'READY' : 'UNSET';
    slot.cooldownUntil = null;
    slot.lastError = null;
    this.emit();
  }

  public getAll(): KeySlotState[] {
    return (['KEY_CALI', 'K1', 'K2', 'K3', 'K4'] as KeySlotId[]).map((id) => ({ ...this.slots[id] }));
  }

  public getSlot(id: KeySlotId): KeySlotState {
    return { ...this.slots[id] };
  }

  public getCaliKey(): KeySlotState | null {
    const cali = this.slots.KEY_CALI;
    if (cali.apiKey && cali.status !== 'INVALID' && cali.status !== 'COOLDOWN') return cali;
    // Fallback to any ready worker key if KEY_CALI is unset
    for (const id of this.workerOrder) {
      if (this.slots[id].apiKey && this.slots[id].status === 'READY') return this.slots[id];
    }
    return null;
  }

  public acquireWorkerKey(agentId: string): KeySlotState | null {
    this.pruneAndRefresh();
    for (let i = 0; i < this.workerOrder.length; i++) {
      const idx = (this.rrIndex + i) % this.workerOrder.length;
      const id = this.workerOrder[idx];
      const slot = this.slots[id];
      if (slot.apiKey && slot.status === 'READY') {
        this.rrIndex = (idx + 1) % this.workerOrder.length;
        slot.status = 'ACTIVE';
        slot.lastAgent = agentId;
        this.emit();
        return slot;
      }
    }
    return null;
  }

  public recordSuccess(id: KeySlotId, usage?: { promptTokens?: number; outputTokens?: number; totalTokens?: number }): void {
    const slot = this.slots[id];
    const now = Date.now();
    slot.status = slot.apiKey ? 'READY' : 'UNSET';
    slot.cooldownUntil = null;
    slot.backoffMs = 15_000;
    slot.lastError = null;
    slot.rpmTimestamps = [...slot.rpmTimestamps.filter((ts) => now - ts < 60_000), now];
    slot.rpdCount += 1;
    if (usage) {
      const p = Number(usage.promptTokens || 0);
      const o = Number(usage.outputTokens || 0);
      slot.promptTokens += p;
      slot.outputTokens += o;
      slot.lastContextTokens = p + o;
    }
    this.emit();
  }

  public recordFailure(id: KeySlotId, httpStatus: number, message: string): void {
    const slot = this.slots[id];
    slot.lastError = message.slice(0, 140);
    if (httpStatus === 401 || httpStatus === 403) {
      slot.status = 'INVALID';
      slot.cooldownUntil = null;
    } else if (httpStatus === 429) {
      slot.status = 'COOLDOWN';
      slot.cooldownUntil = Date.now() + COOLDOWN_429_MS;
    } else {
      slot.status = 'BACKOFF';
      slot.cooldownUntil = Date.now() + slot.backoffMs;
      slot.backoffMs = Math.min(slot.backoffMs * 2, 120_000);
    }
    this.emit();
  }

  public simulateCooldown(id: KeySlotId, seconds = 12): void {
    const slot = this.slots[id];
    slot.status = 'COOLDOWN';
    slot.cooldownUntil = Date.now() + seconds * 1000;
    slot.lastError = 'Simulated 429 RESOURCE_EXHAUSTED';
    this.emit();
  }

  public getTelemetry(): TelemetrySummary {
    const all = this.getAll();
    let totalPromptTokens = 0;
    let totalOutputTokens = 0;
    let activeRpm = 0;
    let totalRpd = 0;
    let lastCallContextTokens = 0;

    for (const s of all) {
      totalPromptTokens += s.promptTokens;
      totalOutputTokens += s.outputTokens;
      activeRpm += s.rpmTimestamps.length;
      totalRpd += s.rpdCount;
      if (s.lastContextTokens > lastCallContextTokens) {
        lastCallContextTokens = s.lastContextTokens;
      }
    }
    const totalTokens = totalPromptTokens + totalOutputTokens;
    const contextPercent = Math.min(100, Number(((lastCallContextTokens / MAX_CONTEXT_WINDOW) * 100).toFixed(2)));
    return {
      totalPromptTokens,
      totalOutputTokens,
      totalTokens,
      activeRpm,
      totalRpd,
      maxContextTokens: MAX_CONTEXT_WINDOW,
      lastCallContextTokens,
      contextPercent
    };
  }

  public async testKeyHealth(id: KeySlotId): Promise<{ ok: boolean; status: number; detail: string }> {
    const slot = this.slots[id];
    if (!slot.apiKey) return { ok: false, status: 0, detail: 'Unset' };
    try {
      const isAq = slot.apiKey.startsWith('AQ.');
      const url = isAq
        ? 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite?fields=name'
        : `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(slot.apiKey)}`;
      const headers: Record<string, string> = isAq
        ? { Authorization: `Bearer ${slot.apiKey}`, 'x-goog-api-key': slot.apiKey }
        : {};
      const res = await fetch(url, { method: 'GET', headers });
      if (res.ok) {
        slot.status = 'READY';
        slot.lastError = null;
        slot.cooldownUntil = null;
        this.emit();
        return { ok: true, status: res.status, detail: 'Healthy' };
      }
      const txt = await res.text().catch(() => '');
      this.recordFailure(id, res.status, txt || `HTTP ${res.status}`);
      return { ok: false, status: res.status, detail: `HTTP ${res.status}` };
    } catch (err) {
      const msg = (err as Error).message || 'Network error';
      this.recordFailure(id, 503, msg);
      return { ok: false, status: 503, detail: msg };
    }
  }

  public startWatchdog(onRecover: (keyId: KeySlotId) => void): void {
    this.stopWatchdog();
    this.onWatchdogRecover = onRecover;
    const poll = async () => {
      this.pruneAndRefresh();
      for (const id of this.workerOrder) {
        const slot = this.slots[id];
        if (!slot.apiKey || slot.status === 'INVALID') continue;
        if (slot.status === 'READY') {
          const check = await this.testKeyHealth(id);
          if (check.ok) {
            const cb = this.onWatchdogRecover;
            this.stopWatchdog();
            if (cb) cb(id);
            return;
          }
        }
      }
      this.watchdogTimer = window.setTimeout(poll, 10_000);
    };
    this.watchdogTimer = window.setTimeout(poll, 8_000);
  }

  public stopWatchdog(): void {
    if (this.watchdogTimer !== null) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.onWatchdogRecover = null;
  }

  public destroy(): void {
    this.stopWatchdog();
    if (this.tickTimer !== null) clearInterval(this.tickTimer);
  }
}

export const keyPool = new FiveKeyPool();
