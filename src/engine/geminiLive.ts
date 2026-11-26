import { keyPool } from './keyPool';

export interface LiveCallbacks {
  onStatus: (status: 'connecting' | 'connected' | 'speaking' | 'closed' | 'error', detail?: string) => void;
  onTranscript: (role: 'user' | 'cali', text: string) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export class GeminiLiveClient {
  private ws: WebSocket | null = null;
  private captureCtx: AudioContext | null = null;
  private playbackCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private nextPlayTime = 0;
  private muted = false;

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.micStream) {
      this.micStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public async connect(systemInstruction: string, cb: LiveCallbacks, startMuted = false): Promise<void> {
    const slot = keyPool.getCaliKey();
    if (!slot) {
      cb.onStatus('error', 'Configure KEY_CALI in Settings and tap Save to use Gemini Live.');
      return;
    }

    this.muted = startMuted;
    cb.onStatus('connecting', `Connecting with ${slot.id}...`);

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
      });
      this.setMuted(startMuted);

      this.captureCtx = new AudioContext({ sampleRate: 16000 });
      this.playbackCtx = new AudioContext({ sampleRate: 24000 });
      this.nextPlayTime = this.playbackCtx.currentTime;

      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(
        slot.apiKey
      )}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        const setupMsg = {
          setup: {
            model: 'models/gemini-2.0-flash-exp',
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } } }
            },
            systemInstruction: { parts: [{ text: systemInstruction }] }
          }
        };
        this.ws?.send(JSON.stringify(setupMsg));
        cb.onStatus('connected', this.muted ? 'Connected • Mic Muted (Tap to Speak)' : 'Live voice active • Mic Open');
        this.startMicStreaming();
      };

      this.ws.onmessage = async (event) => {
        try {
          const text = event.data instanceof Blob ? await event.data.text() : String(event.data);
          const msg = JSON.parse(text) as {
            serverContent?: {
              modelTurn?: { parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }> };
            };
            toolCall?: { functionCalls?: Array<{ id: string; name: string; args?: Record<string, unknown> }> };
          };

          const parts = msg.serverContent?.modelTurn?.parts || [];
          for (const part of parts) {
            if (part.text) cb.onTranscript('cali', part.text);
            if (part.inlineData?.data) {
              cb.onStatus('speaking', 'Cali is speaking...');
              this.enqueuePcm24k(part.inlineData.data);
            }
          }

          if (msg.toolCall?.functionCalls && cb.onToolCall) {
            const responses = [];
            for (const fc of msg.toolCall.functionCalls) {
              const result = await cb.onToolCall(fc.name, fc.args || {});
              responses.push({ id: fc.id, name: fc.name, response: result });
            }
            this.ws?.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
          }
        } catch {
          // ignore non-json frames
        }
      };

      this.ws.onerror = () => cb.onStatus('error', 'Live WebSocket connection error');
      this.ws.onclose = () => {
        cb.onStatus('closed', 'Session ended');
        this.disconnect();
      };
    } catch (err) {
      cb.onStatus('error', (err as Error).message || 'Microphone permission denied');
      this.disconnect();
    }
  }

  private startMicStreaming(): void {
    if (!this.captureCtx || !this.micStream) return;
    const source = this.captureCtx.createMediaStreamSource(this.micStream);
    this.processor = this.captureCtx.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (e) => {
      if (this.muted || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      const bytes = new Uint8Array(pcm16.buffer);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      this.ws.send(
        JSON.stringify({
          realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: btoa(bin) }] }
        })
      );
    };
    source.connect(this.processor);
    this.processor.connect(this.captureCtx.destination);
  }

  private enqueuePcm24k(base64Data: string): void {
    if (!this.playbackCtx) return;
    const bin = atob(base64Data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;

    const buffer = this.playbackCtx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);
    const src = this.playbackCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.playbackCtx.destination);

    const startAt = Math.max(this.playbackCtx.currentTime, this.nextPlayTime);
    src.start(startAt);
    this.nextPlayTime = startAt + buffer.duration;
  }

  public disconnect(): void {
    try {
      this.processor?.disconnect();
      this.micStream?.getTracks().forEach((t) => t.stop());
      this.captureCtx?.close();
      this.playbackCtx?.close();
      if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.close();
    } catch {
      // ignore
    }
    this.processor = null;
    this.micStream = null;
    this.captureCtx = null;
    this.playbackCtx = null;
    this.ws = null;
  }
}
