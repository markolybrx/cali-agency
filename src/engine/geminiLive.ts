export interface LiveCallbacks {
  onStatus: (status: 'connecting' | 'connected' | 'speaking' | 'closed' | 'error', detail?: string) => void;
  onTranscript: (role: 'user' | 'cali', text: string) => void;
  onToolCall: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export class CaliLiveSession {
  private ws: WebSocket | null = null;
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private nextPlayTime = 0;

  public async connect(apiKey: string, systemPrompt: string, cb: LiveCallbacks): Promise<void> {
    if (!apiKey) {
      cb.onStatus('error', 'Set KEY_CALI in Settings first.');
      return;
    }
    cb.onStatus('connecting', 'Connecting to Gemini Live...');
    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(apiKey)}`;

    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = async () => {
        this.sendJson({
          setup: {
            model: 'models/gemini-2.0-flash-exp',
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } } }
            },
            systemInstruction: { parts: [{ text: systemPrompt }] },
            tools: [{
              functionDeclarations: [
                { name: 'get_agency_status', description: 'Get current project phase, active agent, and K1-K4 quota status.' },
                { name: 'control_loop', description: 'Pause or resume the 13-agent build loop.', parameters: { type: 'OBJECT', properties: { action: { type: 'STRING' } } } },
                { name: 'resolve_approval', description: 'Approve or decline the top pending decision.', parameters: { type: 'OBJECT', properties: { approved: { type: 'BOOLEAN' } } } }
              ]
            }]
          }
        });
        await this.startMicCapture();
        cb.onStatus('connected', 'Cali Live connected. Go ahead.');
      };

      this.ws.onmessage = async (ev) => {
        const raw = typeof ev.data === 'string' ? ev.data : await (ev.data as Blob).text();
        const msg = JSON.parse(raw);

        if (msg.toolCall?.functionCalls) {
          for (const fc of msg.toolCall.functionCalls) {
            const result = await cb.onToolCall(fc.name, fc.args || {});
            this.sendJson({
              toolResponse: {
                functionResponses: [{ id: fc.id, name: fc.name, response: result }]
              }
            });
          }
        }

        const parts = msg.serverContent?.modelTurn?.parts || [];
        for (const p of parts) {
          if (p.text) cb.onTranscript('cali', p.text);
          if (p.inlineData?.data && String(p.inlineData.mimeType || '').includes('audio/pcm')) {
            cb.onStatus('speaking');
            this.playPcm24k(p.inlineData.data);
          }
        }
      };

      this.ws.onerror = () => cb.onStatus('error', 'Live WebSocket connection error');
      this.ws.onclose = () => {
        this.cleanupAudio();
        cb.onStatus('closed', 'Live session ended');
      };
    } catch (err: any) {
      cb.onStatus('error', err?.message || 'Failed to open Live session');
    }
  }

  public disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.cleanupAudio();
  }

  private sendJson(obj: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  private async startMicCapture(): Promise<void> {
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
    });
    this.audioCtx = new AudioContext({ sampleRate: 16000 });
    const src = this.audioCtx.createMediaStreamSource(this.mediaStream);
    this.processor = this.audioCtx.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (e) => {
      const float32 = e.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      const bytes = new Uint8Array(pcm16.buffer);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      this.sendJson({
        realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: btoa(bin) }] }
      });
    };
    src.connect(this.processor);
    this.processor.connect(this.audioCtx.destination);
  }

  private playPcm24k(base64: string): void {
    if (!this.audioCtx) this.audioCtx = new AudioContext({ sampleRate: 24000 });
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 0x8000;
    const buf = this.audioCtx.createBuffer(1, float32.length, 24000);
    buf.getChannelData(0).set(float32);
    const src = this.audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(this.audioCtx.destination);
    const now = this.audioCtx.currentTime;
    const startAt = Math.max(now, this.nextPlayTime);
    src.start(startAt);
    this.nextPlayTime = startAt + buf.duration;
  }

  private cleanupAudio(): void {
    this.processor?.disconnect();
    this.processor = null;
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.mediaStream = null;
    this.audioCtx?.close().catch(() => {});
    this.audioCtx = null;
    this.nextPlayTime = 0;
  }
}
