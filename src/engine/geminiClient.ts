import type { KeySlotId, ThinkingLevel } from '../types/agency';
import { keyPool } from './keyPool';

export interface GeminiCallOptions {
  keyId: KeySlotId;
  systemPrompt: string;
  userPayload: string;
  thinkingLevel?: ThinkingLevel;
  model?: string;
  temperature?: number;
  timeoutMs?: number;
}

export interface GeminiUsage {
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface GeminiJsonResult<T = unknown> {
  data: T;
  usage: GeminiUsage;
  finishReason: string;
}

const DEFAULT_MODEL = 'gemini-3.1-flash-lite';

function extractJsonString(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) return fenced[1].trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

export async function callGeminiJson<T = Record<string, unknown>>(opts: GeminiCallOptions): Promise<GeminiJsonResult<T>> {
  const slot = keyPool.getSlot(opts.keyId);
  if (!slot.apiKey) {
    throw new Error(`API key ${opts.keyId} is not configured.`);
  }

  const model = opts.model || DEFAULT_MODEL;
  const isAq = slot.apiKey.startsWith('AQ.');
  const url = isAq
    ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
    : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(slot.apiKey)}`;

  const headers: Record<string, string> = isAq
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${slot.apiKey}`, 'x-goog-api-key': slot.apiKey }
    : { 'Content-Type': 'application/json' };

  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.35,
    responseMimeType: 'application/json'
  };

  if (opts.thinkingLevel) {
    generationConfig.thinkingConfig = {
      thinkingLevel: opts.thinkingLevel.toUpperCase()
    };
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), opts.timeoutMs ?? 55_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: opts.userPayload }] }],
        generationConfig
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      keyPool.recordFailure(opts.keyId, res.status, errText || `HTTP ${res.status}`);
      throw new Error(`Gemini HTTP ${res.status}${errText ? `: ${errText.slice(0, 140)}` : ''}`);
    }

    const payload = (await res.json()) as {
      candidates?: Array<{
        finishReason?: string;
        content?: { parts?: Array<{ text?: string }> };
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };

    const candidate = payload.candidates?.[0];
    const finishReason = candidate?.finishReason || 'STOP';
    const rawText = candidate?.content?.parts?.map((p) => p.text || '').join('') || '';
    const usage: GeminiUsage = {
      promptTokens: Number(payload.usageMetadata?.promptTokenCount || Math.ceil(opts.userPayload.length / 4)),
      outputTokens: Number(payload.usageMetadata?.candidatesTokenCount || Math.ceil(rawText.length / 4)),
      totalTokens: Number(payload.usageMetadata?.totalTokenCount || 0)
    };
    if (!usage.totalTokens) usage.totalTokens = usage.promptTokens + usage.outputTokens;

    keyPool.recordSuccess(opts.keyId, usage);

    if (finishReason === 'MAX_TOKENS') {
      throw new Error('MAX_TOKENS');
    }
    if (!rawText) {
      throw new Error('Empty response text from Gemini');
    }

    const cleanJson = extractJsonString(rawText);
    const parsed = JSON.parse(cleanJson) as T;
    return { data: parsed, usage, finishReason };
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      keyPool.recordFailure(opts.keyId, 504, '55s HTTP Timeout');
      throw new Error('TIMEOUT_55S');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
