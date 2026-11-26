import React, { useEffect, useRef, useState } from 'react';
import { OfficeDrawer } from './components/office/OfficeDrawer';
import { runCaliTurn } from './engine/caliDirector';
import { CaliLiveSession } from './engine/geminiLive';
import { keyPool } from './engine/keyPool';
import { AgencyOrchestratorLoop } from './engine/orchestratorLoop';
import { storage } from './engine/storage';
import { CALI_DIRECTOR_PROMPT } from './prompts/agencyPrompts';
import type {
  AccentId,
  AgencyActivity,
  ApiKeySlot,
  CaliMemory,
  CaliProfile,
  ChatMessage,
  KeySlotId,
  PendingDecision,
  ProjectState,
  ThemeId,
  WorkspaceFile
} from './types/agency';

const ACCENTS: Record<AccentId, { dark: string; light: string }> = {
  marigold: { dark: '#FFB732', light: '#C2610C' },
  lavender: { dark: '#C4B5FD', light: '#6D28D9' },
  champagne: { dark: '#E7D5B8', light: '#85643A' },
  silverblue: { dark: '#A5B4FC', light: '#4338CA' }
};

export default function App() {
  const [theme, setTheme] = useState<ThemeId>(() => (localStorage.getItem('cali_theme') as ThemeId) || 'monolith');
  const [accent, setAccent] = useState<AccentId>(() => (localStorage.getItem('cali_accent') as AccentId) || 'marigold');
  const [keys, setKeys] = useState<ApiKeySlot[]>(() => keyPool.getSnapshot());
  const [profile, setProfile] = useState<CaliProfile>(() => storage.loadProfile());
  const [memories, setMemories] = useState<CaliMemory[]>(() => storage.loadMemories());
  const [project, setProject] = useState<ProjectState | null>(() => storage.loadProject());
  const [files, setFiles] = useState<WorkspaceFile[]>(() => storage.loadFiles());
  const [decisions, setDecisions] = useState<PendingDecision[]>(() => storage.loadDecisions());
  const [latestActivity, setLatestActivity] = useState<AgencyActivity | null>(null);
  const [running, setRunning] = useState(false);
  const [statusLine, setStatusLine] = useState('Standing by');

  const [officeOpen, setOfficeOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [decisionsOpen, setDecisionsOpen] = useState(false);

  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      role: 'cali',
      text: storage.loadProfile().onboardingComplete
        ? 'Welcome back. Pitch a new PWA idea or open the Virtual Office to check on the team.'
        : 'Hey—I am Cali, your agency director. Before we spin up the 13 agents, let us do a quick 4-step onboarding. What should I call you, and do you prefer English or Taglish?',
      meta: 'Cali • Executive Director'
    }
  ]);

  const [liveStatus, setLiveStatus] = useState('Ready');
  const [liveTranscript, setLiveTranscript] = useState('Hold the FAB or tap Start to talk with Cali Live.');
  const [toast, setToast] = useState<string | null>(null);

  const loopRef = useRef<AgencyOrchestratorLoop | null>(null);
  const liveRef = useRef<CaliLiveSession | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const longFiredRef = useRef(false);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    const unsub = keyPool.subscribe(setKeys);
    loopRef.current = new AgencyOrchestratorLoop({
      onProjectUpdate: setProject,
      onFilesUpdate: setFiles,
      onActivity: setLatestActivity,
      onStageDecision: (dec) => {
        setDecisions((prev) => {
          const next = [dec, ...prev];
          storage.saveDecisions(next);
          return next;
        });
        showToast(`Decision staged: ${dec.title}`);
      },
      onLoopStateChange: (isRun, txt) => {
        setRunning(isRun);
        setStatusLine(txt);
      }
    });
    return () => { unsub(); liveRef.current?.disconnect(); };
  }, []);

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    setChatInput('');
    setMessages((prev) => [...prev, { id: `u_${Date.now()}`, role: 'user', text }]);
    setChatBusy(true);

    try {
      const res = await runCaliTurn({ userMessage: text, profile, memories, project });
      setMessages((prev) => [...prev, { id: `c_${Date.now()}`, role: 'cali', text: res.message, meta: 'KEY_CALI' }]);

      if (res.memory_ops?.length) {
        setMemories((prev) => {
          const next = [...prev];
          for (const op of res.memory_ops) {
            const idx = next.findIndex((m) => m.key === op.key);
            const rec: CaliMemory = {
              id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
              key: op.key,
              type: op.type,
              value: op.value,
              triggers: op.triggers || ['agency'],
              source: op.source,
              confidence: op.source === 'explicit_user' ? 0.95 : 0.8,
              updatedAt: new Date().toISOString()
            };
            if (idx >= 0) next[idx] = rec;
            else next.unshift(rec);
          }
          storage.saveMemories(next);
          return next;
        });
      }

      if (!profile.onboardingComplete && res.onboarding_step_done) {
        const nextStep = profile.onboardingStep + 1;
        const updated: CaliProfile = {
          ...profile,
          onboardingStep: Math.min(4, nextStep),
          onboardingComplete: nextStep > 4
        };
        setProfile(updated);
        storage.saveProfile(updated);
      }

      if (res.agency_action === 'START_INTAKE' && res.blueprint_markdown) {
        showToast('Handing blueprint to Master Orchestrator...');
        void loopRef.current?.intakeBlueprint(res.blueprint_markdown);
      } else if (res.agency_action === 'RESUME_LOOP') {
        loopRef.current?.start();
      } else if (res.agency_action === 'PAUSE_LOOP') {
        loopRef.current?.pause('Paused by Cali');
      }
    } catch (err: any) {
      setMessages((prev) => [...prev, { id: `e_${Date.now()}`, role: 'cali', text: `Error: ${err?.message}`, meta: 'KEY_CALI Error' }]);
    } finally {
      setChatBusy(false);
    }
  };

  const startLiveCall = async () => {
    const caliKey = keyPool.getCaliKey()?.key || '';
    liveRef.current?.disconnect();
    liveRef.current = new CaliLiveSession();
    await liveRef.current.connect(caliKey, CALI_DIRECTOR_PROMPT, {
      onStatus: (st, detail) => {
        setLiveStatus(st.toUpperCase());
        if (detail) setLiveTranscript(detail);
      },
      onTranscript: (_role, text) => setLiveTranscript(text),
      onToolCall: async (name, args) => {
        if (name === 'get_agency_status') {
          return {
            project: project?.project_name || 'None',
            phase: project?.current_phase_id || 0,
            running,
            keys: keyPool.getSnapshot().map((k) => ({ id: k.id, status: k.status }))
          };
        }
        if (name === 'control_loop') {
          if (args.action === 'pause') loopRef.current?.pause('Paused via Cali Live');
          else loopRef.current?.start();
          return { ok: true };
        }
        if (name === 'resolve_approval' && decisions.length > 0) {
          handleDecision(decisions[0], Boolean(args.approved));
          return { ok: true };
        }
        return { ok: false };
      }
    });
  };

  const handleDecision = (dec: PendingDecision, approved: boolean) => {
    const next = decisions.filter((d) => d.id !== dec.id);
    setDecisions(next);
    storage.saveDecisions(next);
    if (approved) {
      loopRef.current?.start();
      showToast(`Approved: ${dec.title}`);
    } else {
      showToast('Declined');
    }
    if (next.length === 0) setDecisionsOpen(false);
  };

  const startFabHold = () => {
    longFiredRef.current = false;
    holdTimerRef.current = window.setTimeout(() => {
      longFiredRef.current = true;
      setVoiceOpen(true);
      void startLiveCall();
    }, 450);
  };

  const endFabHold = () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (!longFiredRef.current) setChatOpen(true);
  };

  const isLight = theme === 'alabaster';
  const shellBg = isLight ? 'bg-[#F7F5F0] text-[#18181B]' : theme === 'nocturne' ? 'bg-[#0C0B0E] text-[#F5F2EB]' : 'bg-[#121215] text-[#F4F4F5]';
  const surface = isLight ? 'bg-white/85 border-zinc-900/[0.08]' : 'bg-[#18181D]/90 border-white/[0.08]';
  const activePhase = project?.phases.find((p) => p.phase_id === project.current_phase_id) || null;

  return (
    <div
      style={{ ['--text-accent' as any]: isLight ? ACCENTS[accent].light : ACCENTS[accent].dark }}
      className={`w-full max-w-2xl mx-auto h-screen flex flex-col overflow-hidden relative transition-colors ${shellBg}`}
    >
      {/* Ambient Top Glow */}
      <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[360px] h-[220px] rounded-full blur-3xl opacity-25 bg-[#8B5CF6]" />

      {/* Toast */}
      {toast && (
        <div className="fixed top-16 right-4 z-50 px-4 py-2.5 rounded-2xl border border-[#8B5CF6]/40 bg-[#16161C]/95 text-zinc-100 text-xs font-medium shadow-2xl">
          {toast}
        </div>
      )}

      {/* Fixed Header */}
      <header className="absolute top-0 inset-x-0 z-20 px-5 pt-4 pb-3 flex items-center justify-between gap-2 bg-transparent backdrop-blur-md">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-[#8B5CF6] shrink-0" />
          <div className="flex items-baseline gap-2.5 min-w-0">
            <span className="text-2xl sm:text-3xl font-semibold tracking-tight leading-none">Cali</span>
            <span className="text-[11px] font-medium text-accent truncate">
              {project ? project.project_name : 'Agency Ready'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => setOfficeOpen(true)} title="Virtual Office" className="relative p-2 rounded-full hover:bg-white/[0.08]">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/></svg>
            {running && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />}
          </button>
          <button type="button" onClick={() => setWorkspaceOpen(true)} title="Generated Files" className="p-2 rounded-full hover:bg-white/[0.08]">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>
          </button>
          <button type="button" onClick={() => setMemoryOpen(true)} title="Cali Memory" className="p-2 rounded-full hover:bg-white/[0.08]">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 2a7 7 0 00-7 7c0 2.38 1.19 4.47 3 5.74V17a2 2 0 002 2h4a2 2 0 002-2v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 00-7-7z"/></svg>
          </button>
          <button type="button" onClick={() => setSettingsOpen(true)} title="5-Key Vault & Theme" className="p-2 rounded-full hover:bg-white/[0.08]">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/></svg>
          </button>
        </div>
      </header>

      {/* Main Executive Feed */}
      <main className="relative z-10 flex-1 overflow-y-auto px-5 pt-20 pb-28 space-y-5">
        {/* Hero Briefing */}
        <section className="space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xl font-semibold tracking-tight">
                {new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
              </div>
              <div className="text-xs font-medium text-accent mt-0.5">
                {activePhase ? `Phase ${activePhase.phase_id}: ${activePhase.name}` : statusLine}
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setVoiceOpen(true); void startLiveCall(); }}
              className="px-3 py-1 rounded-full text-[11px] font-medium border border-white/15 bg-white/[0.05]"
            >
              Gemini Live
            </button>
          </div>
          <p className="text-[15px] leading-relaxed opacity-90">
            {!profile.onboardingComplete
              ? 'Tap the violet orb below so I can interview you on your taste, stack preferences, and approval rules before we start building.'
              : latestActivity
              ? latestActivity.summary
              : 'All 5 API key slots are standing by. Pitch a PWA project in Chat or step into the Virtual Office.'}
          </p>
        </section>

        {/* Pending Decisions Bar */}
        <button
          type="button"
          onClick={() => decisions.length && setDecisionsOpen(true)}
          className={`w-full rounded-2xl border px-4 py-3.5 flex items-center justify-between text-left ${decisions.length ? 'bg-[#8B5CF6]/10 border-[#8B5CF6]/35' : surface}`}
        >
          <div className="min-w-0">
            <div className="text-xs font-semibold">{decisions.length ? `${decisions.length} Pending Decisions` : 'All Caught Up'}</div>
            <div className="text-[11px] opacity-60 truncate mt-0.5">
              {decisions.length ? decisions[0].title : 'No phase gates or recoveries waiting'}
            </div>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#8B5CF6] text-white">
            {decisions.length}
          </span>
        </button>

        {/* Living Virtual Office Quick Card */}
        <section className={`rounded-3xl border p-4 space-y-3 ${surface}`}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-widest opacity-55">Agency Floor</div>
              <div className="text-sm font-semibold mt-0.5">13 Coding Agents + Cali Suite</div>
            </div>
            <button
              type="button"
              onClick={() => setOfficeOpen(true)}
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#8B5CF6] text-white"
            >
              Enter Office
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
            {keys.map((k) => (
              <span key={k.id} className="px-2 py-1 rounded-lg border border-white/10 bg-black/20">
                {k.id === 'KEY_CALI' ? 'CALI' : k.id}: <span className="text-accent">{k.status}</span>
              </span>
            ))}
          </div>
        </section>

        {/* Active Phase Tasks */}
        <section className={`rounded-3xl border p-4 space-y-2.5 ${surface}`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-widest opacity-55">Active Phase Queue</span>
            <span className="text-[11px] opacity-55">{files.length} files generated</span>
          </div>
          {activePhase ? (
            <div className="space-y-2">
              {activePhase.tasks.map((t) => (
                <div key={t.task_id} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-white/[0.06] last:border-0">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{t.task_id}: {t.title}</div>
                    <div className="text-[10px] opacity-55">{t.assigned_agent}</div>
                  </div>
                  <span className="text-[10px] font-mono text-accent shrink-0">{t.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs opacity-60">No active project yet. Chat with Cali to generate and lock your first blueprint.</p>
          )}
        </section>

        {/* Cali Remembers */}
        <section className={`rounded-3xl border p-4 space-y-1.5 ${surface}`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-widest opacity-55">Cali Remembers</span>
            <button type="button" onClick={() => setMemoryOpen(true)} className="text-[11px] font-medium text-accent">Review all</button>
          </div>
          <p className="text-xs opacity-75">
            {memories.slice(0, 2).map((m) => m.value).join(' • ') || 'Complete onboarding so Cali learns your taste and tech stack.'}
          </p>
        </section>
      </main>

      {/* Lower-Right Floating Cali Orb (Tap = Chat, Hold = Gemini Live) */}
      <div className="fixed sm:absolute bottom-5 right-5 z-20 select-none">
        <button
          type="button"
          onMouseDown={startFabHold}
          onMouseUp={endFabHold}
          onTouchStart={(e) => { e.preventDefault(); startFabHold(); }}
          onTouchEnd={(e) => { e.preventDefault(); endFabHold(); }}
          aria-label="Tap to chat, hold for Gemini Live"
          className="relative w-16 h-16 rounded-full flex items-center justify-center touch-none active:scale-95 transition-transform"
        >
          <span className="absolute inset-0 rounded-full animate-breathe bg-[#8B5CF6]/35" />
          <div className="relative w-14 h-14 rounded-full bg-[#8B5CF6] text-white border border-violet-300/30 shadow-2xl flex items-center justify-center">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3l2.15 6.85L21 12l-6.85 2.15L12 21l-2.15-6.85L3 12l6.85-2.15L12 3z"/></svg>
          </div>
        </button>
      </div>

      {/* Living Virtual Office Drawer */}
      <OfficeDrawer
        open={officeOpen}
        onClose={() => setOfficeOpen(false)}
        keys={keys}
        latestActivity={latestActivity}
        running={running}
        onToggleRun={() => (running ? loopRef.current?.pause() : loopRef.current?.start())}
        onStepOnce={() => void loopRef.current?.stepOnce()}
      />

      {/* Chat Sheet */}
      {chatOpen && (
        <div className="fixed inset-0 z-30 flex flex-col bg-[#121215]/95 backdrop-blur-2xl">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold">Cali</h3>
              <p className="text-[11px] opacity-55">
                {profile.onboardingComplete ? 'Executive Project Director (KEY_CALI)' : `Onboarding Step ${profile.onboardingStep}/4`}
              </p>
            </div>
            <button type="button" onClick={() => setChatOpen(false)} className="p-2 rounded-full border border-white/15">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {messages.map((m) => (
              <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[85%] rounded-3xl border px-4 py-3 text-xs leading-relaxed ${m.role === 'user' ? 'bg-[#8B5CF6] text-white border-transparent' : 'bg-white/[0.05] border-white/10'}`}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={handleSendChat} className="p-4 border-t border-white/10 flex gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Talk to Cali or paste your project idea..."
              className="flex-1 px-4 py-2.5 rounded-full text-xs bg-white/[0.06] border border-white/15 focus:outline-none focus:border-[#8B5CF6]"
            />
            <button type="submit" disabled={chatBusy} className="px-4 py-2.5 rounded-full text-xs font-semibold bg-[#8B5CF6] text-white">
              {chatBusy ? '...' : 'Send'}
            </button>
          </form>
        </div>
      )}

      {/* Gemini Live Voice Overlay */}
      {voiceOpen && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-between p-6 bg-[#121215]/95 backdrop-blur-2xl text-center">
          <div className="w-full flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-accent">{liveStatus}</span>
            <button type="button" onClick={() => { liveRef.current?.disconnect(); setVoiceOpen(false); }} className="p-2 rounded-full border border-white/15">✕</button>
          </div>
          <div className="space-y-6 my-auto">
            <div className="w-32 h-32 mx-auto rounded-full bg-[#8B5CF6]/20 border border-[#8B5CF6]/50 flex items-center justify-center animate-breathe">
              <div className="w-16 h-16 rounded-full bg-[#8B5CF6] text-white flex items-center justify-center font-semibold">Live</div>
            </div>
            <p className="text-sm max-w-xs mx-auto opacity-85">{liveTranscript}</p>
          </div>
          <button
            type="button"
            onClick={() => { liveRef.current?.disconnect(); setVoiceOpen(false); }}
            className="px-6 py-2.5 rounded-full bg-rose-600 text-white text-xs font-semibold"
          >
            End Live Call
          </button>
        </div>
      )}

      {/* Pending Decisions Modal */}
      {decisionsOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl border border-white/15 bg-[#16161B] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Pending Decisions</h3>
              <button type="button" onClick={() => setDecisionsOpen(false)} className="p-1.5 rounded-full border border-white/15">✕</button>
            </div>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {decisions.map((d) => (
                <div key={d.id} className="rounded-2xl border border-[#8B5CF6]/35 bg-[#8B5CF6]/10 p-4 space-y-2.5">
                  <div className="text-xs font-semibold">{d.title}</div>
                  <p className="text-xs opacity-80">{d.detail}</p>
                  <p className="text-[11px] text-accent">Cali’s Call: {d.recommendedCall}</p>
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => handleDecision(d, true)} className="flex-1 py-2 rounded-full bg-[#8B5CF6] text-white text-xs font-semibold">{d.approveLabel}</button>
                    <button type="button" onClick={() => handleDecision(d, false)} className="px-4 py-2 rounded-full border border-white/15 text-xs">{d.declineLabel}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Workspace & ZIP Export Drawer */}
      {workspaceOpen && (
        <div className="fixed inset-0 z-30 flex flex-col bg-[#121215]/95 backdrop-blur-2xl p-5">
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div>
              <h3 className="text-lg font-semibold">Generated Workspace</h3>
              <p className="text-[11px] opacity-60">{files.length} files stored on-device</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!files.length}
                onClick={() => void storage.exportWorkspaceZip(project?.project_name || 'pwa-app', files)}
                className="px-3.5 py-1.5 rounded-full bg-[#8B5CF6] text-white text-xs font-semibold disabled:opacity-40"
              >
                Export .zip
              </button>
              <button type="button" onClick={() => setWorkspaceOpen(false)} className="p-2 rounded-full border border-white/15">✕</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-4 space-y-3">
            {files.length === 0 ? (
              <p className="text-xs opacity-60 text-center py-10">No generated project files yet.</p>
            ) : (
              files.map((f) => (
                <div key={f.path} className="rounded-2xl border border-white/10 bg-[#18181D] p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-accent">{f.path}</span>
                    <span className="text-[10px] opacity-55">{f.updatedBy}</span>
                  </div>
                  <pre className="text-[11px] font-mono opacity-80 max-h-40 overflow-auto whitespace-pre-wrap">{f.content}</pre>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Memory Drawer */}
      {memoryOpen && (
        <div className="fixed inset-0 z-30 flex flex-col bg-[#121215]/95 backdrop-blur-2xl p-5">
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <h3 className="text-lg font-semibold">What Cali Remembers</h3>
            <button type="button" onClick={() => setMemoryOpen(false)} className="p-2 rounded-full border border-white/15">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto py-4 space-y-3">
            {memories.map((m) => (
              <div key={m.id} className="rounded-2xl border border-white/10 bg-[#18181D] p-3.5 space-y-1">
                <div className="text-[10px] font-mono uppercase text-accent">{m.type} &bull; {m.key}</div>
                <p className="text-xs">{m.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5-Key Vault & Appearance Settings Drawer */}
      {settingsOpen && (
        <div className="fixed inset-0 z-30 flex flex-col bg-[#121215]/95 backdrop-blur-2xl p-5">
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div>
              <h3 className="text-lg font-semibold">5-Key Vault &amp; Appearance</h3>
              <p className="text-[11px] opacity-60">Stored locally on Android only</p>
            </div>
            <button type="button" onClick={() => setSettingsOpen(false)} className="p-2 rounded-full border border-white/15">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto py-4 space-y-4">
            <div className="rounded-3xl border border-white/10 bg-[#18181D] p-4 space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-widest opacity-55">Gemini API Keys (5 Separate Projects)</div>
              {keys.map((k) => (
                <div key={k.id} className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="font-medium">{k.label}</span>
                    <span className="font-mono text-accent">{k.status}</span>
                  </div>
                  <input
                    type="password"
                    defaultValue={k.key}
                    onBlur={(e) => {
                      keyPool.updateKey(k.id as KeySlotId, e.target.value);
                      showToast(`Saved ${k.id}`);
                    }}
                    placeholder={`Paste ${k.id} Gemini API Key...`}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-black/30 border border-white/10 focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
              ))}
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#18181D] p-4 space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-widest opacity-55">Theme &amp; Accent</div>
              <div className="grid grid-cols-3 gap-1.5">
                {(['monolith', 'nocturne', 'alabaster'] as ThemeId[]).map((th) => (
                  <button
                    key={th}
                    type="button"
                    onClick={() => { setTheme(th); localStorage.setItem('cali_theme', th); }}
                    className={`py-2 rounded-2xl text-xs font-medium capitalize ${theme === th ? 'bg-[#8B5CF6] text-white' : 'bg-white/[0.06]'}`}
                  >
                    {th}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {(['marigold', 'lavender', 'champagne', 'silverblue'] as AccentId[]).map((ac) => (
                  <button
                    key={ac}
                    type="button"
                    onClick={() => { setAccent(ac); localStorage.setItem('cali_accent', ac); }}
                    className={`py-1.5 rounded-2xl text-[11px] font-medium capitalize ${accent === ac ? 'bg-[#8B5CF6] text-white' : 'bg-white/[0.06]'}`}
                  >
                    {ac}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
