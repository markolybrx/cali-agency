import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import type { KeySlotId, MemoryItem, UserProfile } from '../types/agency';
import type { GitHubConfig } from './storage';
import type { ModelRoutingConfig } from './modelRouter';
import { getLocalSaveFolder } from './localSave';
import { getSupabaseClient } from './caliBrain';

export interface EncryptedVaultEnvelope {
  v: 1;
  alg: 'AES-256-GCM';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  updatedAt: string;
}

export interface VaultPayload {
  keys: Array<{
    id: KeySlotId;
    apiKey: string;
    selectedModel: string;
    availableModels: string[];
  }>;
  github: GitHubConfig;
  modelRouting: ModelRoutingConfig;
  profile: UserProfile;
  memories: MemoryItem[];
  agentBrains?: Record<string, unknown>;
  savedAt: string;
}

const LOCAL_VAULT_KEY = 'cali_encrypted_vault_v1';
const DEVICE_PASS_KEY = 'cali_vault_device_pass_v1';
const PBKDF2_ITERATIONS = 150000;

// Active passphrase held in RAM while unlocked
let runtimePassphrase: string | null = null;

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveAesKey(passphrase: string, salt: Uint8Array, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptVaultPayload(payload: VaultPayload, passphrase: string): Promise<EncryptedVaultEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt, PBKDF2_ITERATIONS);
  const plainBytes = new TextEncoder().encode(JSON.stringify(payload));
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBytes);
  return {
    v: 1,
    alg: 'AES-256-GCM',
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(cipherBuf)),
    updatedAt: new Date().toISOString()
  };
}

export async function decryptVaultEnvelope(env: EncryptedVaultEnvelope, passphrase: string): Promise<VaultPayload> {
  if (!env || env.v !== 1 || !env.salt || !env.iv || !env.ciphertext) {
    throw new Error('Invalid encrypted vault file format.');
  }
  const salt = base64ToBytes(env.salt);
  const iv = base64ToBytes(env.iv);
  const cipherBytes = base64ToBytes(env.ciphertext);
  const key = await deriveAesKey(passphrase, salt, env.iterations || PBKDF2_ITERATIONS);
  try {
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      cipherBytes as unknown as BufferSource
    );
    const jsonText = new TextDecoder().decode(plainBuf);
    return JSON.parse(jsonText) as VaultPayload;
  } catch {
    throw new Error('Incorrect Vault Passphrase or corrupted vault.');
  }
}

export function setRuntimeVaultPassphrase(passphrase: string | null, rememberOnDevice = false): void {
  runtimePassphrase = passphrase;
  try {
    if (passphrase && rememberOnDevice) {
      localStorage.setItem(DEVICE_PASS_KEY, btoa(unescape(encodeURIComponent(passphrase))));
    } else if (!rememberOnDevice) {
      localStorage.removeItem(DEVICE_PASS_KEY);
    }
  } catch {
    // ignore
  }
}

export function getRuntimeVaultPassphrase(): string | null {
  if (runtimePassphrase) return runtimePassphrase;
  try {
    const saved = localStorage.getItem(DEVICE_PASS_KEY);
    if (saved) {
      runtimePassphrase = decodeURIComponent(escape(atob(saved)));
      return runtimePassphrase;
    }
  } catch {
    // ignore
  }
  return null;
}

export function isDevicePassphraseRemembered(): boolean {
  return Boolean(localStorage.getItem(DEVICE_PASS_KEY));
}

export function loadLocalEncryptedEnvelope(): EncryptedVaultEnvelope | null {
  try {
    const raw = localStorage.getItem(LOCAL_VAULT_KEY);
    if (raw) return JSON.parse(raw) as EncryptedVaultEnvelope;
  } catch {
    // ignore
  }
  return null;
}

export function hasLocalEncryptedVault(): boolean {
  return loadLocalEncryptedEnvelope() !== null;
}

export async function writeEncryptedVaultToAndroidFolder(env: EncryptedVaultEnvelope): Promise<{ ok: boolean; path: string }> {
  const folder = getLocalSaveFolder();
  const relPath = `${folder}/cali-vault.enc.json`;
  try {
    await Filesystem.writeFile({
      path: relPath,
      data: JSON.stringify(env, null, 2),
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true
    });
    return { ok: true, path: `Documents/${relPath}` };
  } catch {
    return { ok: false, path: `Documents/${relPath}` };
  }
}

export async function readEncryptedVaultFromAndroidFolder(): Promise<EncryptedVaultEnvelope | null> {
  const folder = getLocalSaveFolder();
  const relPath = `${folder}/cali-vault.enc.json`;
  try {
    const res = await Filesystem.readFile({
      path: relPath,
      directory: Directory.Documents,
      encoding: Encoding.UTF8
    });
    const text = typeof res.data === 'string' ? res.data : '';
    if (!text) return null;
    return JSON.parse(text) as EncryptedVaultEnvelope;
  } catch {
    return null;
  }
}

export async function downloadEncryptedVaultFile(env: EncryptedVaultEnvelope): Promise<void> {
  const blob = new Blob([JSON.stringify(env, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cali-vault.enc.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Cloud-ready hook: silently upserts ciphertext to Supabase ONLY if signed in & online.
 * Zero impact during local-first testing.
 */
export async function syncEncryptedVaultToCloudIfConnected(env: EncryptedVaultEnvelope): Promise<boolean> {
  if (!navigator.onLine) return false;
  const sb = getSupabaseClient();
  if (!sb) return false;
  try {
    const { data } = await sb.auth.getSession();
    const user = data.session?.user;
    if (!user) return false;
    const { error } = await sb.from('encrypted_vaults').upsert({
      user_id: user.id,
      version: env.v,
      salt: env.salt,
      iv: env.iv,
      ciphertext: env.ciphertext,
      updated_at: env.updatedAt
    });
    return !error;
  } catch {
    return false;
  }
}

export async function pullEncryptedVaultFromCloudIfConnected(): Promise<EncryptedVaultEnvelope | null> {
  if (!navigator.onLine) return null;
  const sb = getSupabaseClient();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    const user = data.session?.user;
    if (!user) return null;
    const { data: row } = await sb.from('encrypted_vaults').select('*').eq('user_id', user.id).maybeSingle();
    if (!row) return null;
    return {
      v: 1,
      alg: 'AES-256-GCM',
      iterations: PBKDF2_ITERATIONS,
      salt: row.salt,
      iv: row.iv,
      ciphertext: row.ciphertext,
      updatedAt: row.updated_at || new Date().toISOString()
    };
  } catch {
    return null;
  }
}

/**
 * Encrypts and persists the vault locally (localStorage + Android Documents folder)
 * and mirrors to Supabase cloud if connected.
 */
export async function sealAndPersistVault(
  payload: VaultPayload,
  passphraseOverride?: string
): Promise<{ ok: boolean; folderSynced: boolean; cloudSynced: boolean; envelope: EncryptedVaultEnvelope | null }> {
  const pass = passphraseOverride || getRuntimeVaultPassphrase();
  if (!pass) {
    return { ok: false, folderSynced: false, cloudSynced: false, envelope: null };
  }
  const env = await encryptVaultPayload(payload, pass);
  try {
    localStorage.setItem(LOCAL_VAULT_KEY, JSON.stringify(env));
  } catch {
    // ignore
  }
  const folderRes = await writeEncryptedVaultToAndroidFolder(env);
  const cloudSynced = await syncEncryptedVaultToCloudIfConnected(env);
  return { ok: true, folderSynced: folderRes.ok, cloudSynced, envelope: env };
}
