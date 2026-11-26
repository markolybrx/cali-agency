import { GoogleGenAI } from '@google/genai';
import type { ThinkingLevel } from '../types/agency';

export const FLASH_LITE_MODEL = 'gemini-3.1-flash-lite';

export interface GeminiJsonCall {
  apiKey: string;
  systemInstruction: string;
  userPayload: string;
  thinkingLevel: ThinkingLevel;
  timeoutMs?: number;
}

export class GeminiApiError extends Error {
  public httpStatus: number;
  constructor(message: string, httpStatus: number) {
    super(message);
    this.httpStatus = httpStatus;
  }
}

export async function callGeminiJson<T>(opts: GeminiJsonCall): Promise<T> {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });
  const timeoutMs = opts.timeoutMs ?? 55_000;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await Promise.race([
      ai.models.generateContent({
        model: FLASH_LITE_MODEL,
        contents: opts.userPayload,
        config: {
          systemInstruction: opts.systemInstruction,
          responseMimeType: 'application/json',
          thinkingConfig: {
            thinkingLevel: opts.thinkingLevel as any
          }
        }
      }),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () =>
          reject(new GeminiApiError('Request timed out after 55s', 408))
        );
      })
    ]);

    const rawText = response.text?.trim() || '';
    if (!rawText) {
      throw new GeminiApiError('Empty response from Gemini', 502);
    }
    const clean = rawText.replace(/^\`\`\`json\s*/i, '').replace(/\`\`\`$/, '').trim();
    return JSON.parse(clean) as T;
  } catch (err: any) {
    if (err instanceof GeminiApiError) throw err;
    const status = Number(err?.status || err?.code || (String(err?.message).includes('429') ? 429 : 500));
    throw new GeminiApiError(err?.message || 'Gemini API request failed', status);
  } finally {
    clearTimeout(timer);
  }
}
