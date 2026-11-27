import { GoogleGenAI } from '@google/genai';
import type { KeySlotId } from '../types/agency';
import { keyPool } from './keyPool';

export interface GroundedJsonResult<T> {
  data: T;
  sources: string[];
  totalTokens: number;
}

function stripJsonFences(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last > first) {
    return s.slice(first, last + 1);
  }
  return s;
}

/**
 * Executes a Gemini request with native Google Search Grounding enabled,
 * returning parsed JSON + real web grounding source titles/URLs.
 */
export async function callGeminiGroundedJson<T>(opts: {
  keyId: KeySlotId;
  systemPrompt: string;
  userPrompt: string;
  modelOverride?: string;
}): Promise<GroundedJsonResult<T>> {
  const slot = keyPool.getSlot(opts.keyId);
  if (!slot.apiKey) {
    throw new Error(`Key slot ${opts.keyId} has no API key configured.`);
  }

  const model = opts.modelOverride || slot.selectedModel || 'gemini-2.5-flash';
  const ai = new GoogleGenAI({ apiKey: slot.apiKey });

  try {
    let response;
    try {
      response = await ai.models.generateContent({
        model,
        contents: opts.userPrompt,
        config: {
          systemInstruction: opts.systemPrompt,
          tools: [{ googleSearch: {} }],
          temperature: 0.4
        }
      });
    } catch {
      // Fallback if key/model tier restricts search tool, still distilling best practices
      response = await ai.models.generateContent({
        model,
        contents: opts.userPrompt,
        config: {
          systemInstruction: opts.systemPrompt,
          responseMimeType: 'application/json',
          temperature: 0.4
        }
      });
    }

    const rawText = response.text || '';
    const parsed = JSON.parse(stripJsonFences(rawText)) as T;

    const usage = response.usageMetadata;
    const promptTokens = Number(usage?.promptTokenCount || 0);
    const outputTokens = Number(usage?.candidatesTokenCount || 0);
    const totalTokens = Number(usage?.totalTokenCount || promptTokens + outputTokens);
    keyPool.recordSuccess(opts.keyId, promptTokens, outputTokens);

    const sources: string[] = [];
    const candidates = (response as unknown as { candidates?: Array<{ groundingMetadata?: { groundingChunks?: Array<{ web?: { title?: string; uri?: string } }> } }> }).candidates;
    const chunks = candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    for (const ch of chunks) {
      if (ch.web?.title || ch.web?.uri) {
        sources.push(ch.web.title ? `${ch.web.title} (${ch.web.uri || 'web'})` : String(ch.web.uri));
      }
    }

    return { data: parsed, sources: Array.from(new Set(sources)).slice(0, 5), totalTokens };
  } catch (err) {
    const msg = (err as Error).message || 'Grounded study error';
    const status = msg.includes('429') ? 429 : 500;
    keyPool.recordError(opts.keyId, status, msg);
    throw err;
  }
}
