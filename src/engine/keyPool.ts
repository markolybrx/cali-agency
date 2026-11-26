import type { ApiKeySlot, KeySlotId } from '../types/agency';
import { storage } from './storage';

type Listener = (slots: ApiKeySlot[]) => void;
type RecoveryCallback = (recoveredKeys: KeySlotId[]) => void;

export class KeyPoolManager {
  private slots: ApiKeySlot[];
  private rrCursor = 0;
  private listeners = new Set<Listener>();
  private watchdogTimer: number | null = null;
  private backoffMs = 15000;
  private onRecovered: RecoveryCallback | null = null;

  constructor() {
    this.slots = storage.loadKeys();
  }

  public subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.getSnapshot());
    return () => this.listeners.delete(fn);
  }

  public setRecoveryHandler(cb: RecoveryCallback): void {
    this.onRecovered = cb;
  }

  public getSnapshot(): ApiKeySlot[] {
    const now = Date.now();
    let changed = false;
    this.slots = this.slots.map((s) => {
      if (s.status === 'COOLDOWN' && s.cooldownUntil && now >= s.cooldownUntil) {
        changed = true;
        return { ...s, status: s.key ? 'READY' : 'UNSET', cooldownUntil: null, lastError: null };
      }
      return s;
    });
    if (changed) this.emit();
    return this.slots.map((s) => ({ ...s }));
  }

  public updateKey(id: KeySlotId, rawKey: string): void {
    const trimmed = rawKey.trim();
    this.slots = this.slots.map((s) =>
      s.id === id
        ? { ...s, key: trimmed, status: trimmed ? 'READY' : 'UNSET', cooldownUntil: null, lastError: null }
        : s
    );
    storage.saveKeys(this.slots);
    this.emit();
  }

  public getCaliKey(): ApiKeySlot | null {
    const slot = this.getSnapshot().find((s) => s.id === 'KEY_CALI');
    return slot && slot.key ? slot : null;
  }

  public acquireWorkerKey(agentId: string): ApiKeySlot | null {
    const workers = this.getSnapshot().filter((s) => s.role === 'worker');
    for (let i = 0; i < workers.length; i++) {
      const idx = (this.rrCursor + i) % workers.length;
      const candidate = workers[idx];
      if (candidate.key && candidate.status === 'READY') {
        this.rrCursor = (idx + 1) % workers.length;
        this.mutateSlot(candidate.id, {
          status: 'ACTIVE',
          activeAgentId: agentId,
          rpmCount: candidate.rpmCount + 1,
          rpdCount: candidate.rpdCount + 1
        });
        return this.slots.find((s) => s.id === candidate.id)!;
      }
    }
    return null;
  }

  public releaseKey(id: KeySlotId): void {
    const slot = this.slots.find((s) => s.id === id);
    if (!slot) return;
    if (slot.status === 'ACTIVE') {
      this.mutateSlot(id, { status: slot.key ? 'READY' : 'UNSET', activeAgentId: null });
    }
  }

  public reportKeyError(id: KeySlotId, httpStatus: number, message: string): void {
    if (httpStatus === 401 || httpStatus === 403) {
      this.mutateSlot(id, { status: 'INVALID', activeAgentId: null, lastError: 'Invalid or revoked API key' });
      return;
    }
    if (httpStatus === 429) {
      const isDaily = /daily|quota|rpd/i.test(message);
      this.mutateSlot(id, {
        status: isDaily ? 'RPD_EXHAUSTED' : 'COOLDOWN',
        cooldownUntil: isDaily ? Date.now() + 15 * 60_000 : Date.now() + 60_000,
        activeAgentId: null,
        lastError: isDaily ? 'Daily quota reached' : 'Rate limited (60s cooldown)'
      });
      return;
    }
    this.mutateSlot(id, {
      status: 'OFFLINE',
      cooldownUntil: Date.now() + 20_000,
      activeAgentId: null,
      lastError: message.slice(0, 90)
    });
  }

  public areAllWorkersUnavailable(): boolean {
    const configured = this.getSnapshot().filter((s) => s.role === 'worker' && Boolean(s.key));
    if (configured.length === 0) return true;
    return configured.every((s) => s.status !== 'READY' && s.status !== 'ACTIVE');
  }

  public startWatchdog(): void {
    if (this.watchdogTimer !== null) return;
    this.backoffMs = 15_000;
    const tick = async () => {
      const recovered: KeySlotId[] = [];
      const workers = this.getSnapshot().filter((s) => s.role === 'worker' && Boolean(s.key));
      for (const w of workers) {
        if (w.status === 'INVALID') continue;
        if (w.status === 'READY') {
          recovered.push(w.id);
          continue;
        }
        if (w.cooldownUntil && Date.now() < w.cooldownUntil) continue;
        const ok = await this.probeKeyMetadata(w.key);
        if (ok) {
          this.mutateSlot(w.id, { status: 'READY', cooldownUntil: null, lastError: null });
          recovered.push(w.id);
        }
      }
      if (recovered.length > 0) {
        this.stopWatchdog();
        if (this.onRecovered) this.onRecovered(recovered);
        return;
      }
      this.backoffMs = Math.min(this.backoffMs * 2, 120_000);
      this.watchdogTimer = window.setTimeout(tick, this.backoffMs);
    };
    this.watchdogTimer = window.setTimeout(tick, this.backoffMs);
  }

  public stopWatchdog(): void {
    if (this.watchdogTimer !== null) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private async probeKeyMetadata(apiKey: string): Promise<boolean> {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite?key=${encodeURIComponent(apiKey)}`
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  private mutateSlot(id: KeySlotId, patch: Partial<ApiKeySlot>): void {
    this.slots = this.slots.map((s) => (s.id === id ? { ...s, ...patch } : s));
    storage.saveKeys(this.slots);
    this.emit();
  }

  private emit(): void {
    const snap = this.slots.map((s) => ({ ...s }));
    this.listeners.forEach((fn) => fn(snap));
  }
}

export const keyPool = new KeyPoolManager();
