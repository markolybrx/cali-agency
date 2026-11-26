import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AccentId,
  ActivityEvent,
  ChatMessage,
  KeySlotId,
  KeySlotState,
  MemoryItem,
  PendingDecision,
  ProjectState,
  PromptEntry,
  TelemetrySummary,
  ThemeId,
  UserProfile,
  WorkerAgentId
} from './types/agency';
import { TEXT_ACCENTS, THEMES } from './theme/themes';
import { keyPool } from './engine/keyPool';
import {
  type GitHubConfig,
  loadActiveProjectId,
  loadGitHubConfig,
  loadMemories,
  loadProfile,
  loadProjects,
  saveActiveProjectId,
  saveGitHubConfig,
  saveMemories,
  saveProfile,
  saveProjects,
  upsertMemory
} from './engine/storage';
import { loadPrompts, STARTER_BLUEPRINTS } from './prompts/agencyPrompts';
import { getOnboardingPrompt, runCaliTurn } from './engine/caliDirector';
import { GeminiLiveClient } from './engine/geminiLive';
import { AgencyOrchestratorLoop } from './engine/orchestratorLoop';
import { createInitialAgents, type PacketFlight, type PixelSpriteAgent } from './components/office/pixelOffice';
import { MiniOfficePreview, OfficeDrawer } from './components/office/OfficeDrawer';
import { WorkspaceDrawer } from './components/workspace/WorkspaceDrawer';
import { PromptStudioDrawer } from './components/prompts/PromptStudioDrawer';
import { TelemetryDrawer } from './components/telemetry/TelemetryDrawer';

export default function App() {
  // Theme & Accent
  const [theme, setTheme] = useState<ThemeId>(() => (localStorage.getItem('cali_theme') as ThemeId) || 'monolith');
  const [accent, setAccent] = useState<AccentId>(() => (localStorage.getItem('cali_accent') as AccentId) || 'marigold');
  const t = THEMES[theme] || THEMES.monolith;
  const accentHex = t.isLight ? TEXT_ACCENTS[accent].light : TEXT_ACCENTS[accent].dark;

  // Profile, Memories, Projects, Prompts
  const [profile, setProfile] = useState<UserProfile>(() => loadProfile());
  const [memories, setMemories] = useState<MemoryItem[]>(() => loadMemories());
  const [projects, setProjects] = useState<ProjectState[]>(() => loadProjects());
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => loadActiveProjectId());
  const [prompts, setPrompts] = useState<PromptEntry[]>(() => loadPrompts());
  const [githubCfg, setGithubCfg] = useState<GitHubConfig>(() => loadGitHubConfig());

  // Live Keys & Telemetry
  const [keys, setKeys] = useState<KeySlotState[]>(() => keyPool.getAll());
  const [telemetry, setTelemetry] = useState<TelemetrySummary>(() => keyPool.getTelemetry());

  // Agency Loop State
  const [loopStatus, setLoopStatus] = useState<'IDLE' | 'RUNNING' | 'PAUSED' | 'WATCHDOG' | 'DEMO'>('IDLE');
  const [hubTab, setHubTab] = useState<'feed' | 'agents' | 'checklist' | 'watchdog'>('feed');
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [decisions, setDecisions] = useState<PendingDecision[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  // Drawers & Modals
  const [officeOpen, setOfficeOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [telemetryOpen, setTelemetryOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [decisionsOpen, setDecisionsOpen] = useState(false);
  const [blueprintModalOpen, setBlueprintModalOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);

  // Blueprint Importer
  const [blueprintDraft, setBlueprintDraft] = useState('');

  // Chat & Live Voice
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      role: 'cali',
      text: profile.onboarding_complete
        ? `Welcome back${profile.preferred_name ? `, ${profile.preferred_name}` : ''}. The 13-agent floor is standing by—drop a blueprint or hit Demo Sprint.`
        : getOnboardingPrompt(profile.onboarding_step),
      meta: profile.onboarding_complete ? 'Cali • Executive Director' : `Onboarding ${profile.onboarding_step}/4`,
      ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [liveStatus, setLiveStatus] = useState<'idle' | 'connecting' | 'connected' | 'speaking' | 'closed' | 'error'>('idle');
  const [liveDetail, setLiveDetail] = useState('Tap Connect to start Gemini Live voice');
  const [liveTranscripts, setLiveTranscripts] = useState<string[]>([]);
  const liveClientRef = useRef<GeminiLiveClient | null>(null);

  // Pixel Office Shared Refs
  const agentsRef = useRef<PixelSpriteAgent[]>(createInitialAgents());
  const packetsRef = useRef<PacketFlight[]>([]);
  const holdTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) || projects[0] || null,
    [projects, activeProjectId]
  );

  // Sync body background + localStorage for Theme & Accent
  useEffect(() => {
    document.body.style.backgroundColor = t.bodyBg;
    localStorage.setItem('cali_theme', theme);
    localStorage.setItem('cali_accent', accent);
  }, [theme, accent, t.bodyBg]);

  // Subscribe to KeyPool updates
  useEffect(() => {
    return keyPool.subscribe(() => {
      setKeys(keyPool.getAll());
      setTelemetry(keyPool.getTelemetry());
    });
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2800);
  };

  const pushActivity = (ev: Omit<ActivityEvent, 'id' | 'ts'>) => {
    setActivity((prev) => [
      {
        ...ev,
        id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      },
      ...prev.slice(0, 49)
    ]);
  };

  const upsertProject = (proj: ProjectState) => {
    setProjects((prev) => {
      const idx = prev.findIndex((p) => p.id === proj.id);
      const next = idx >= 0 ? prev.map((p, i) => (i === idx ? proj : p)) : [proj, ...prev];
      saveProjects(next);
      return next;
    });
    setActiveProjectId(proj.id);
    saveActiveProjectId(proj.id);
  };

  const spawnHandoff = (from: WorkerAgentId | 'cali', to: WorkerAgentId | 'cali', label: string) => {
    const a = agentsRef.current.find((x) => x.id === from);
    const b = agentsRef.current.find((x) => x.id === to);
    if (a && b) {
      packetsRef.current.push({
        id: `pkt_${Date.now()}_${Math.random()}`,
        fromX: a.x,
        fromY: a.y - 10,
        toX: b.x,
        toY: b.y - 10,
        progress: 0,
        label
      });
    }
  };

  const orchestratorRef = useRef<AgencyOrchestratorLoop | null>(null);
  if (!orchestratorRef.current) {
    orchestratorRef.current = new AgencyOrchestratorLoop({
      onProjectUpdate: (proj) => upsertProject(proj),
      onActivity: (ev) => pushActivity(ev),
      onHandoff: (from, to, label) => spawnHandoff(from, to, label),
      onAgentVisual: (agentId, state, speech) => {
        const ag = agentsRef.current.find((x) => x.id === agentId);
        if (ag) {
          ag.state = state;
          if (speech) {
            ag.speech = speech;
            ag.speechUntil = Date.now() + 5500;
          }
        }
      },
      onPendingDecision: (dec) => {
        setDecisions((prev) => [
          { ...dec, id: `dec_${Date.now().toString(36)}`, createdAt: new Date().toISOString() },
          ...prev
        ]);
        showToast('Cali staged a pending decision');
      },
      onLoopStatus: (st) => setLoopStatus(st)
    });
  }

  const handleLaunchBlueprint = async (md: string) => {
    if (!md.trim()) return;
    setBlueprintModalOpen(false);
    setBlueprintDraft('');
    showToast('Master Orchestrator running INTAKE...');
    try {
      const proj = await orchestratorRef.current!.intakeBlueprint(md, memories);
      showToast(`Project "${proj.project_name}" ready!`);
      const hasWorkerKey = keyPool.getAll().some((k) => k.role === 'worker' && k.apiKey);
      if (hasWorkerKey) {
        orchestratorRef.current!.runLoop(proj);
      }
    } catch (err) {
      showToast((err as Error).message);
    }
  };

  const handleSendChat = async (raw: string) => {
    const text = raw.trim();
    if (!text || chatBusy) return;
    setChatInput('');
    setChatBusy(true);
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages((prev) => [...prev, { id: `u_${Date.now()}`, role: 'user', text, ts: nowTime }]);

    try {
      const res = await runCaliTurn({
        userMessage: text,
        profile,
        memories,
        activeProject,
        pendingDecisions: decisions
      });

      let nextMems = memories;
      let nextProfile = { ...profile };
      for (const op of res.memory_ops) {
        if (op.op === 'delete') {
          nextMems = nextMems.filter((m) => m.key !== op.key);
          saveMemories(nextMems);
        } else {
          nextMems = upsertMemory(nextMems, {
            key: op.key,
            type: op.type,
            value: op.value,
            triggers: op.triggers,
            source: op.source,
            confidence: op.confidence
          });
          if (op.key === 'user.preferred_name') nextProfile.preferred_name = op.value;
          if (op.key === 'user.onboarding_complete' && op.value === 'true') {
            nextProfile.onboarding_complete = true;
            nextProfile.onboarding_step = 4;
          }
        }
      }

      if (!nextProfile.onboarding_complete) {
        if (nextProfile.onboarding_step >= 4) {
          nextProfile.onboarding_complete = true;
        } else {
          nextProfile.onboarding_step += 1;
        }
      }

      setMemories(nextMems);
      setProfile(nextProfile);
      saveProfile(nextProfile);

      setMessages((prev) => [
        ...prev,
        {
          id: `c_${Date.now()}`,
          role: 'cali',
          text: res.message,
          meta: nextProfile.onboarding_complete ? 'Cali • Executive Director' : `Onboarding ${nextProfile.onboarding_step}/4`,
          ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);

      if (res.agency_command === 'PAUSE_LOOP') orchestratorRef.current?.pause();
      if (res.agency_command === 'RESUME_LOOP' && activeProject) orchestratorRef.current?.runLoop(activeProject);
      if (res.agency_command === 'START_BLUEPRINT' && res.blueprint_idea) {
        await handleLaunchBlueprint(`# Project Blueprint: ${res.blueprint_idea}\n${res.blueprint_idea}`);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: `e_${Date.now()}`, role: 'cali', text: `Error: ${(err as Error).message}`, meta: 'Error', ts: nowTime }
      ]);
    } finally {
      setChatBusy(false);
    }
  };

  const toggleLiveVoice = async () => {
    if (liveStatus === 'connected' || liveStatus === 'speaking' || liveStatus === 'connecting') {
      liveClientRef.current?.disconnect();
      setLiveStatus('closed');
      setLiveDetail('Session ended');
      return;
    }
    const client = new GeminiLiveClient();
    liveClientRef.current = client;
    const sys = `You are Cali, Executive Director of a 13-agent PWA coding agency. Active project: ${
      activeProject ? activeProject.project_name : 'None'
    }. Active phase: ${activeProject?.current_phase_id || 0}. Loop status: ${loopStatus}. Speak concisely in casual JARVIS tone.`;
    await client.connect(sys, {
      onStatus: (st, detail) => {
        setLiveStatus(st);
        if (detail) setLiveDetail(detail);
      },
      onTranscript: (role, txt) => {
        setLiveTranscripts((prev) => [`${role === 'cali' ? 'Cali' : 'You'}: ${txt}`, ...prev.slice(0, 10)]);
      }
    });
  };

  const handleSendPreviewErrorToDebugger = async (errorLog: string) => {
    if (!activeProject) return;
    showToast('Routing runtime error to 09. Debugger...');
    spawnHandoff('cali', 'debugger', 'Runtime Error');
    pushActivity({ agentId: 'debugger', text: `Received Preview error: ${errorLog.slice(0, 90)}`, kind: 'warn' });
    const hasKey = keyPool.getAll().some((k) => k.role === 'worker' && k.apiKey);
    if (hasKey) {
      await orchestratorRef.current?.runDebuggerPatch(
        activeProject,
        {
          task_id: 'DBG-LIVE',
          title: 'Fix Live Preview runtime error',
          assigned_agent: 'debugger',
          target_files: ['index.html', 'app.js'],
          status: 'PENDING',
          retry_count: 0,
          split_depth: 0
        },
        [errorLog]
      );
      showToast('09. Debugger patched workspace!');
    } else {
      showToast('Add K1-K4 keys for live auto-patching');
    }
  };

  const triggerRandomHandoff = () => {
    const pairs: Array<[WorkerAgentId | 'cali', WorkerAgentId | 'cali', string]> = [
      ['ui-designer', 'frontend-developer', 'design-tokens.json'],
      ['frontend-developer', 'code-reviewer', 'AppShell diff'],
      ['code-reviewer', 'debugger', 'Fix SW cache'],
      ['qa-tester', 'master-orchestrator', 'Phase QA Green'],
      ['cali', 'master-orchestrator', 'Priority brief']
    ];
    const [from, to, lbl] = pairs[Math.floor(Math.random() * pairs.length)];
    spawnHandoff(from, to, lbl);
    const ag = agentsRef.current.find((a) => a.id === to);
    if (ag) {
      ag.speech = `Got ${lbl}!`;
      ag.speechUntil = Date.now() + 3200;
    }
    pushActivity({ agentId: from, text: `Handed off ${lbl} -> ${to}`, kind: 'handoff' });
  };

  // FAB Tap (Chat) vs Long Press (Gemini Live)
  const startFabHold = () => {
    longPressFiredRef.current = false;
    holdTimerRef.current = window.setTimeout(() => {
      longPressFiredRef.current = true;
      setVoiceOpen(true);
    }, 450);
  };
  const endFabHold = () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (!longPressFiredRef.current) setChatOpen(true);
  };

  const todayStr = new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  const activePhase = activeProject?.phases.find((p) => p.phase_id === activeProject.current_phase_id) || activeProject?.phases[0];
  const fileCount = activeProject ? Object.keys(activeProject.files).length : 0;

  return (
    <div className="min-h-screen flex justify-center">
      {/* Toast */}
      {toast && (
        <div className="fixed top-16 right-4 z-50 px-4 py-2.5 rounded-2xl border border-white/15 bg-[#16161C]/95 text-zinc-100 text-xs font-medium shadow-2xl max-w-xs">
          {toast}
        </div>
      )}

      <div
        style={{ '--text-accent': accentHex } as React.CSSProperties}
        className={`w-full max-w-2xl h-screen flex flex-col overflow-hidden relative transition-colors duration-300 ${t.shell}`}
      >
        {/* Ambient Glow */}
        <div
          className={`pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[360px] h-[220px] rounded-full blur-3xl opacity-25 transition-colors duration-500 ${t.glow}`}
        />

        {/* 1. FIXED TOP HEADER */}
        <header className="absolute top-0 inset-x-0 z-20 px-4 pt-4 pb-3 flex items-center justify-between gap-2 bg-transparent backdrop-blur-md">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${t.dot}`} />
            <div className="min-w-0 flex items-baseline gap-2">
              <span className="text-[26px] sm:text-3xl font-semibold tracking-tight leading-none">Cali</span>
              <span className="text-[11px] font-medium text-accent truncate">
                {loopStatus === 'RUNNING'
                  ? 'Agency Running'
                  : loopStatus === 'WATCHDOG'
                  ? 'Watchdog Polling'
                  : loopStatus === 'DEMO'
                  ? 'Demo Sprint'
                  : 'Monolith HQ'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <button type="button" title="Pixel Office" onClick={() => setOfficeOpen(true)} className={`p-2 rounded-full cursor-pointer ${t.iconBtn}`}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <rect x="3" y="4" width="18" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="18" x2="12" y2="21" />
              </svg>
            </button>
            <button type="button" title="Workspace & Preview" onClick={() => setWorkspaceOpen(true)} className={`p-2 rounded-full cursor-pointer ${t.iconBtn}`}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
            </button>
            <button type="button" title="Prompt Studio" onClick={() => setPromptsOpen(true)} className={`p-2 rounded-full cursor-pointer ${t.iconBtn}`}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            </button>
            <button type="button" title="Telemetry & 5-Key Health" onClick={() => setTelemetryOpen(true)} className={`p-2 rounded-full cursor-pointer ${t.iconBtn}`}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </button>
            <button type="button" title="What Cali Remembers" onClick={() => setMemoryOpen(true)} className={`p-2 rounded-full cursor-pointer ${t.iconBtn}`}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z" />
                <path d="M9 22h6" />
              </svg>
            </button>
            <button type="button" title="Settings & 5-Key Vault" onClick={() => setSettingsOpen(true)} className={`p-2 rounded-full cursor-pointer ${t.iconBtn}`}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <line x1="4" y1="21" x2="4" y2="14" />
                <line x1="4" y1="10" x2="4" y2="3" />
                <line x1="12" y1="21" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12" y2="3" />
                <line x1="20" y1="21" x2="20" y2="16" />
                <line x1="20" y1="12" x2="20" y2="3" />
                <line x1="1" y1="14" x2="7" y2="14" />
                <line x1="9" y1="8" x2="15" y2="8" />
                <line x1="17" y1="16" x2="23" y2="16" />
              </svg>
            </button>
          </div>
        </header>

        {/* 2. SCROLLABLE MONOLITH HQ FEED */}
        <div className="relative z-10 flex-1 overflow-y-auto px-4 pt-20 pb-28 space-y-4">
          {/* Hero Briefing */}
          <section className="space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xl sm:text-2xl font-semibold tracking-tight leading-tight">{todayStr}</div>
                <div className="text-xs font-medium text-accent mt-0.5">
                  {activeProject ? `${activeProject.project_name} • Phase ${activeProject.current_phase_id}` : 'Standing by for next PWA'}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...profile, language_pref: profile.language_pref === 'en' ? 'taglish' : 'en' } as UserProfile;
                    setProfile(next);
                    saveProfile(next);
                  }}
                  className="text-[11px] font-medium opacity-65 hover:opacity-100 cursor-pointer"
                >
                  {profile.language_pref === 'taglish' ? 'Taglish' : 'English'}
                </button>
                <button
                  type="button"
                  onClick={() => setVoiceOpen(true)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium border cursor-pointer ${t.secondaryBtn}`}
                >
                  <span>Gemini Live</span>
                </button>
              </div>
            </div>
            <p className="text-[15px] leading-relaxed opacity-90">
              {profile.onboarding_complete
                ? activeProject
                  ? `The 13-agent floor is tracking ${activeProject.project_name} (${fileCount} files generated). Tap Expand Full Office to watch live handoffs or preview the build.`
                  : 'All 13 verbatim prompts are loaded. Import a Markdown blueprint, pick a starter template below, or run a zero-quota Demo Sprint.'
                : 'Tap Start Interview below so I can learn your design taste, stack preferences, and approval rules before the team starts shipping.'}
            </p>
          </section>

          {/* Token / RPM / RPD / Context Telemetry Strip */}
          <button
            type="button"
            onClick={() => setTelemetryOpen(true)}
            className={`w-full rounded-2xl border px-3.5 py-2.5 grid grid-cols-4 gap-2 text-left cursor-pointer ${t.surface}`}
          >
            <div>
              <div className="text-[9px] uppercase tracking-wider opacity-55">Tokens</div>
              <div className="text-xs font-mono font-semibold">{telemetry.totalTokens.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider opacity-55">RPM</div>
              <div className="text-xs font-mono font-semibold">{telemetry.activeRpm}/60</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider opacity-55">RPD</div>
              <div className="text-xs font-mono font-semibold">{telemetry.totalRpd}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider opacity-55">Context</div>
              <div className="text-xs font-mono font-semibold text-accent">{telemetry.contextPercent}%</div>
            </div>
          </button>

          {/* Onboarding Progress Card (shown until complete) */}
          {!profile.onboarding_complete && (
            <section className={`rounded-3xl border p-4 space-y-3 ${t.accentCard}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-accent">
                    Executive Onboarding • Step {profile.onboarding_step} of 4
                  </div>
                  <div className="text-xs font-semibold mt-0.5">Brief Cali on your taste &amp; rules</div>
                </div>
                <button
                  type="button"
                  onClick={() => setChatOpen(true)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer ${t.primaryBtn}`}
                >
                  Start Interview
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {['Name & Vibe', 'UI Taste', 'Tech Stack', 'Autonomy'].map((lbl, idx) => (
                  <div key={lbl} className="space-y-1">
                    <div className={`h-1.5 rounded-full ${idx < profile.onboarding_step ? t.dot : 'bg-current/15'}`} />
                    <div className="text-[9px] opacity-70 truncate">{lbl}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Pending Decisions Bar */}
          <button
            type="button"
            onClick={() => decisions.length > 0 && setDecisionsOpen(true)}
            className={`w-full rounded-2xl border px-4 py-3 flex items-center justify-between gap-3 text-left ${
              decisions.length > 0 ? `${t.accentCard} cursor-pointer` : `${t.surface} opacity-80`
            }`}
          >
            <div className="min-w-0">
              <div className="text-xs font-semibold">
                {decisions.length > 0 ? `${decisions.length} Pending Decisions` : 'All Caught Up'}
              </div>
              <div className="text-[11px] opacity-60 truncate">
                {decisions.length > 0 ? decisions[0].title : 'No phase gates or circuit breakers waiting'}
              </div>
            </div>
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${decisions.length > 0 ? t.primaryBtn : t.secondaryBtn}`}>
              {decisions.length}
            </span>
          </button>

          {/* Agency Floor Card + Live 16-Bit Pixel Mini-Office */}
          <section className={`rounded-3xl border p-4 space-y-3 ${t.surface}`}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest opacity-55">Agency Floor</div>
                <div className="text-sm font-semibold">13 Pixel Agents + Cali Suite</div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    orchestratorRef.current?.runDemoSprint(() => showToast('Demo Sprint finished!'));
                    showToast('Zero-Quota Demo Sprint started');
                  }}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-medium border cursor-pointer ${t.secondaryBtn}`}
                >
                  Demo Sprint
                </button>
                <button
                  type="button"
                  onClick={() => setOfficeOpen(true)}
                  className={`px-3.5 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer ${t.primaryBtn}`}
                >
                  Enter Office
                </button>
              </div>
            </div>

            <MiniOfficePreview agentsRef={agentsRef} packetsRef={packetsRef} onOpenFull={() => setOfficeOpen(true)} />

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {keys.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setTelemetryOpen(true)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-mono border shrink-0 cursor-pointer ${t.subtleBadge}`}
                >
                  {k.id === 'KEY_CALI' ? 'CALI' : k.id}: {k.status}
                </button>
              ))}
            </div>
          </section>

          {/* Multi-Project Switcher & Quick-Start Blueprint Launcher */}
          <section className={`rounded-3xl border p-4 space-y-3 ${t.surface}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-widest opacity-55">
                Projects &amp; Blueprints ({projects.length})
              </div>
              <button
                type="button"
                onClick={() => setBlueprintModalOpen(true)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold cursor-pointer ${t.primaryBtn}`}
              >
                + Import .md
              </button>
            </div>

            {projects.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setActiveProjectId(p.id);
                      saveActiveProjectId(p.id);
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border shrink-0 cursor-pointer ${
                      activeProject?.id === p.id ? t.primaryBtn : t.secondaryBtn
                    }`}
                  >
                    {p.project_name}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {STARTER_BLUEPRINTS.map((bp) => (
                <button
                  key={bp.id}
                  type="button"
                  onClick={() => handleLaunchBlueprint(bp.md)}
                  className={`rounded-2xl border p-3 text-left transition cursor-pointer ${t.secondaryBtn}`}
                >
                  <div className="text-xs font-semibold">{bp.name}</div>
                  <div className="text-[10px] opacity-65 mt-0.5">{bp.tagline}</div>
                </button>
              ))}
            </div>

            {activeProject && (
              <div className="flex items-center gap-2 pt-1">
                {loopStatus === 'RUNNING' ? (
                  <button
                    type="button"
                    onClick={() => orchestratorRef.current?.pause()}
                    className={`flex-1 py-2 rounded-full text-xs font-semibold border cursor-pointer ${t.secondaryBtn}`}
                  >
                    Pause Production
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => orchestratorRef.current?.runLoop(activeProject)}
                    className={`flex-1 py-2 rounded-full text-xs font-semibold cursor-pointer ${t.primaryBtn}`}
                  >
                    Start / Resume Production
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setWorkspaceOpen(true)}
                  className={`px-4 py-2 rounded-full text-xs font-medium border cursor-pointer ${t.secondaryBtn}`}
                >
                  Workspace ({fileCount})
                </button>
              </div>
            )}
          </section>

          {/* 4-Tab Agency Hub Card (Feed | Agents | Checklist | Watchdog) */}
          <section className={`rounded-3xl border p-4 space-y-3 ${t.surface}`}>
            <div className={`grid grid-cols-4 gap-1 p-1 rounded-2xl ${t.tabWrap}`}>
              {(
                [
                  ['feed', 'Feed'],
                  ['agents', 'Agents'],
                  ['checklist', 'Checklist'],
                  ['watchdog', 'Watchdog']
                ] as const
              ).map(([id, lbl]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setHubTab(id)}
                  className={`py-1.5 rounded-xl text-[11px] font-medium cursor-pointer ${
                    hubTab === id ? t.tabActive : t.tabIdle
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>

            {hubTab === 'feed' && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {activity.length === 0 ? (
                  <p className="text-xs opacity-60 py-3 text-center">No agent activity yet. Hit Demo Sprint or start a project.</p>
                ) : (
                  activity.slice(0, 12).map((ev) => (
                    <div key={ev.id} className="flex items-start justify-between gap-2 text-xs py-1 border-b border-current/5 last:border-0">
                      <div className="min-w-0">
                        <span className="font-mono text-[10px] text-accent mr-1.5">[{ev.agentId}]</span>
                        <span className="opacity-85">{ev.text}</span>
                      </div>
                      <span className="text-[10px] font-mono opacity-45 shrink-0">{ev.ts}</span>
                    </div>
                  ))
                )}
              </div>
            )}

            {hubTab === 'agents' && (
              <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto">
                {prompts
                  .filter((p) => p.folder !== 'cali' && p.role !== 'system-contract')
                  .map((p) => (
                    <div key={p.id} className={`rounded-xl border p-2.5 flex items-center justify-between gap-2 ${t.secondaryBtn}`}>
                      <span className="text-[11px] font-medium truncate">{p.title}</span>
                      <span className="text-[9px] font-mono uppercase text-accent shrink-0">{p.thinkingLevel}</span>
                    </div>
                  ))}
              </div>
            )}

            {hubTab === 'checklist' && (
              <div className="space-y-2">
                {!activePhase ? (
                  <p className="text-xs opacity-60 py-3 text-center">Select or import a project to view its Phase Gate checklist.</p>
                ) : (
                  activePhase.checklist.map((c) => (
                    <div key={c.id} className="flex items-center gap-2.5 text-xs py-1">
                      <span className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] ${c.verified ? t.primaryBtn : 'border-current/30'}`}>
                        {c.verified ? '✓' : ''}
                      </span>
                      <span className={c.verified ? 'line-through opacity-60' : ''}>{c.description}</span>
                    </div>
                  ))
                )}
              </div>
            )}

            {hubTab === 'watchdog' && (
              <div className="space-y-2">
                {keys.map((k) => (
                  <div key={k.id} className="flex items-center justify-between text-xs py-1 border-b border-current/5 last:border-0">
                    <span className="font-mono font-semibold">{k.id}</span>
                    <span className="text-[11px] opacity-65">
                      {k.rpmTimestamps.length} rpm • {k.rpdCount} rpd
                    </span>
                    <span className="text-[10px] font-mono text-accent">{k.status}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Cali Remembers Card */}
          <section className={`rounded-3xl border p-4 space-y-2 ${t.surface}`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-widest opacity-55">Cali Remembers</span>
              <button type="button" onClick={() => setMemoryOpen(true)} className="text-[11px] font-medium text-accent cursor-pointer">
                Review all ({memories.length})
              </button>
            </div>
            <p className="text-xs leading-relaxed opacity-80">
              {memories.length > 0
                ? memories
                    .slice(0, 2)
                    .map((m) => `${m.key}: ${m.value}`)
                    .join(' • ')
                : 'Complete onboarding so Cali locks in your design taste and preferred stack.'}
            </p>
          </section>
        </div>

        {/* 3. FLOATING CALI ORB (Tap = Chat, Hold = Gemini Live) */}
        <div className="fixed sm:absolute bottom-5 right-5 z-20 select-none">
          <button
            type="button"
            aria-label="Tap to chat with Cali, hold for Gemini Live"
            onMouseDown={startFabHold}
            onMouseUp={endFabHold}
            onTouchStart={(e) => {
              e.preventDefault();
              startFabHold();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              endFabHold();
            }}
            className="relative w-16 h-16 rounded-full flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
          >
            <span className={`absolute inset-0 rounded-full animate-breathe pointer-events-none ${t.fabHalo}`} />
            <div className={`relative w-14 h-14 rounded-full flex items-center justify-center shadow-2xl border ${t.fabCore}`}>
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M12 3l2.15 6.85L21 12l-6.85 2.15L12 21l-2.15-6.85L3 12l6.85-2.15L12 3z" />
                <circle cx="18.75" cy="5.25" r="1.1" fill="currentColor" stroke="none" />
              </svg>
            </div>
          </button>
        </div>

        {/* 4. FULL DRAWERS */}
        <OfficeDrawer
          open={officeOpen}
          onClose={() => setOfficeOpen(false)}
          t={t}
          keys={keys}
          telemetry={telemetry}
          agentsRef={agentsRef}
          packetsRef={packetsRef}
          onTriggerDemoHandoff={triggerRandomHandoff}
          onRunDemoSprint={() => orchestratorRef.current?.runDemoSprint(() => showToast('Demo Sprint complete!'))}
          onOpenTelemetry={() => {
            setOfficeOpen(false);
            setTelemetryOpen(true);
          }}
        />

        <WorkspaceDrawer
          open={workspaceOpen}
          onClose={() => setWorkspaceOpen(false)}
          t={t}
          project={activeProject}
          githubConfig={githubCfg}
          onSendErrorToDebugger={handleSendPreviewErrorToDebugger}
          onToast={showToast}
        />

        <PromptStudioDrawer
          open={promptsOpen}
          onClose={() => setPromptsOpen(false)}
          t={t}
          prompts={prompts}
          onPromptsChange={setPrompts}
          onToast={showToast}
        />

        <TelemetryDrawer
          open={telemetryOpen}
          onClose={() => setTelemetryOpen(false)}
          t={t}
          keys={keys}
          telemetry={telemetry}
          onToast={showToast}
        />

        {/* Chat Sheet */}
        {chatOpen && (
          <div className={`absolute inset-0 z-30 flex flex-col backdrop-blur-2xl ${t.overlay}`}>
            <div className="px-5 py-4 border-b border-current/10 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold leading-none">Cali</h3>
                <p className="text-[11px] opacity-55 mt-1">
                  {profile.onboarding_complete ? 'Executive Project Director' : `Onboarding Interview (${profile.onboarding_step}/4)`}
                </p>
              </div>
              <button type="button" onClick={() => setChatOpen(false)} className="p-2 rounded-full border border-current/15 cursor-pointer">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {messages.map((m) => (
                <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] rounded-3xl border px-4 py-3 text-[13px] leading-relaxed ${m.role === 'user' ? t.userBubble : t.caliBubble}`}>
                    {m.text}
                  </div>
                  {m.meta && <span className="text-[10px] opacity-45 mt-1 px-2">{m.meta}</span>}
                </div>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendChat(chatInput);
              }}
              className="px-4 py-3.5 border-t border-current/10 flex items-center gap-2"
            >
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Talk to Cali..."
                className={`flex-1 px-4 py-2.5 rounded-full text-xs sm:text-sm border focus:outline-none ${t.input}`}
              />
              <button type="submit" disabled={chatBusy} className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 cursor-pointer ${t.primaryBtn}`}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </button>
            </form>
          </div>
        )}

        {/* Gemini Live Voice Overlay */}
        {voiceOpen && (
          <div className={`absolute inset-0 z-30 flex flex-col items-center justify-between p-6 backdrop-blur-2xl text-center ${t.overlay}`}>
            <div className="w-full flex items-center justify-between">
              <span className="text-xs font-medium tracking-wider uppercase opacity-60">Gemini Live • KEY_CALI</span>
              <button
                type="button"
                onClick={() => {
                  liveClientRef.current?.disconnect();
                  setLiveStatus('idle');
                  setVoiceOpen(false);
                }}
                className="p-2 rounded-full border border-current/15 cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="flex flex-col items-center gap-6 my-auto">
              <div className="relative w-32 h-32 flex items-center justify-center">
                <span className={`absolute inset-0 rounded-full animate-breathe ${t.fabHalo}`} />
                <div className={`relative w-20 h-20 rounded-full flex items-center justify-center shadow-2xl border ${t.fabCore}`}>
                  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                  </svg>
                </div>
              </div>
              <div className="space-y-1 max-w-xs">
                <h3 className="text-lg font-semibold">{liveStatus === 'connected' || liveStatus === 'speaking' ? 'Cali is Live' : 'Voice Briefing'}</h3>
                <p className="text-xs opacity-65">{liveDetail}</p>
              </div>
              {liveTranscripts.length > 0 && (
                <div className={`w-full max-w-sm rounded-2xl border p-3 text-left text-[11px] space-y-1 max-h-28 overflow-y-auto ${t.surface}`}>
                  {liveTranscripts.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              )}
            </div>
            <button type="button" onClick={toggleLiveVoice} className={`w-full max-w-xs py-3 rounded-full text-xs font-semibold cursor-pointer ${t.primaryBtn}`}>
              {liveStatus === 'connected' || liveStatus === 'speaking' ? 'End Live Call' : 'Connect Gemini Live'}
            </button>
          </div>
        )}

        {/* Memory Drawer */}
        {memoryOpen && (
          <div className={`absolute inset-0 z-30 flex flex-col backdrop-blur-2xl p-5 ${t.overlay}`}>
            <div className="flex items-center justify-between pb-4 border-b border-current/10">
              <div>
                <h3 className="text-lg font-semibold leading-none">What Cali Remembers</h3>
                <p className="text-[11px] opacity-60 mt-1">Injected into Orchestrator &amp; UI Designer</p>
              </div>
              <button type="button" onClick={() => setMemoryOpen(false)} className="p-2 rounded-full border border-current/15 cursor-pointer">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-4 space-y-2.5">
              {memories.length === 0 ? (
                <p className="text-xs opacity-60 text-center py-8">No saved memories yet.</p>
              ) : (
                memories.map((m) => (
                  <div key={m.id} className={`rounded-2xl border p-3.5 space-y-1.5 ${t.surface}`}>
                    <div className="flex justify-between text-[10px] uppercase">
                      <span className="font-semibold text-accent">{m.key}</span>
                      <span className="opacity-55">{Math.round(m.confidence * 100)}%</span>
                    </div>
                    <p className="text-xs">{m.value}</p>
                    <button
                      type="button"
                      onClick={() => {
                        const next = memories.filter((x) => x.id !== m.id);
                        setMemories(next);
                        saveMemories(next);
                      }}
                      className="text-[11px] underline opacity-70 cursor-pointer"
                    >
                      Forget
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Settings Drawer (5-Key Vault + GitHub Ship PAT + Theme & Accent) */}
        {settingsOpen && (
          <div className={`absolute inset-0 z-30 flex flex-col backdrop-blur-2xl p-5 ${t.overlay}`}>
            <div className="flex items-center justify-between pb-4 border-b border-current/10 shrink-0">
              <div>
                <h3 className="text-lg font-semibold leading-none">5-Key Vault &amp; Appearance</h3>
                <p className="text-[11px] opacity-60 mt-1">Stored locally on-device only</p>
              </div>
              <button type="button" onClick={() => setSettingsOpen(false)} className="p-2 rounded-full border border-current/15 cursor-pointer">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              {/* Theme & Accent Switcher (Works across EVERY drawer!) */}
              <div className={`rounded-3xl border p-4 space-y-3 ${t.surface}`}>
                <div className="text-[11px] font-semibold uppercase tracking-widest opacity-55">1. Theme &amp; Text Accent</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['monolith', 'nocturne', 'alabaster'] as ThemeId[]).map((th) => (
                    <button
                      key={th}
                      type="button"
                      onClick={() => setTheme(th)}
                      className={`py-2 rounded-2xl text-xs font-medium capitalize border cursor-pointer ${
                        theme === th ? t.primaryBtn : t.secondaryBtn
                      }`}
                    >
                      {th}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(TEXT_ACCENTS) as AccentId[]).map((ac) => (
                    <button
                      key={ac}
                      type="button"
                      onClick={() => setAccent(ac)}
                      className={`py-1.5 rounded-2xl text-[11px] font-medium border cursor-pointer ${
                        accent === ac ? t.primaryBtn : t.secondaryBtn
                      }`}
                    >
                      {TEXT_ACCENTS[ac].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 5 Gemini API Keys */}
              <div className={`rounded-3xl border p-4 space-y-3 ${t.surface}`}>
                <div className="text-[11px] font-semibold uppercase tracking-widest opacity-55">2. 5 Gemini API Keys</div>
                {keys.map((k) => (
                  <div key={k.id} className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="font-mono font-semibold">{k.id}</span>
                      <span className="opacity-60">{k.label}</span>
                    </div>
                    <input
                      type="password"
                      value={k.apiKey}
                      onChange={(e) => keyPool.setKey(k.id as KeySlotId, e.target.value)}
                      placeholder={`Paste ${k.id} (separate GCP project)`}
                      className={`w-full px-3.5 py-2 rounded-2xl text-xs border focus:outline-none ${t.input}`}
                    />
                  </div>
                ))}
              </div>

              {/* Optional 1-Tap GitHub Ship PAT */}
              <div className={`rounded-3xl border p-4 space-y-2.5 ${t.surface}`}>
                <div className="text-[11px] font-semibold uppercase tracking-widest opacity-55">3. 1-Tap Ship to GitHub (Optional)</div>
                <input
                  type="password"
                  value={githubCfg.token}
                  onChange={(e) => {
                    const next = { ...githubCfg, token: e.target.value };
                    setGithubCfg(next);
                    saveGitHubConfig(next);
                  }}
                  placeholder="GitHub PAT (repo scope)"
                  className={`w-full px-3.5 py-2 rounded-2xl text-xs border focus:outline-none ${t.input}`}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={githubCfg.owner}
                    onChange={(e) => {
                      const next = { ...githubCfg, owner: e.target.value };
                      setGithubCfg(next);
                      saveGitHubConfig(next);
                    }}
                    placeholder="GitHub Username"
                    className={`w-full px-3 py-2 rounded-2xl text-xs border focus:outline-none ${t.input}`}
                  />
                  <input
                    value={githubCfg.repo}
                    onChange={(e) => {
                      const next = { ...githubCfg, repo: e.target.value };
                      setGithubCfg(next);
                      saveGitHubConfig(next);
                    }}
                    placeholder="Target Repo Name"
                    className={`w-full px-3 py-2 rounded-2xl text-xs border focus:outline-none ${t.input}`}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pending Decisions Modal */}
        {decisionsOpen && (
          <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <div className={`w-full max-w-md rounded-3xl border p-5 space-y-4 shadow-2xl max-h-[80%] flex flex-col border-current/15 ${t.overlay}`}>
              <div className="flex items-center justify-between pb-3 border-b border-current/10">
                <h3 className="text-base font-semibold">Pending Decisions</h3>
                <button type="button" onClick={() => setDecisionsOpen(false)} className="p-2 rounded-full border border-current/15 cursor-pointer">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3">
                {decisions.map((d) => (
                  <div key={d.id} className={`rounded-2xl border p-4 space-y-3 ${t.accentCard}`}>
                    <div className="text-xs font-semibold">{d.title}</div>
                    <p className="text-xs opacity-80">{d.detail}</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDecisions((prev) => prev.filter((x) => x.id !== d.id));
                          if (decisions.length <= 1) setDecisionsOpen(false);
                          showToast('Approved');
                        }}
                        className={`flex-1 py-2 rounded-full text-xs font-semibold cursor-pointer ${t.primaryBtn}`}
                      >
                        {d.approveLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDecisions((prev) => prev.filter((x) => x.id !== d.id));
                          if (decisions.length <= 1) setDecisionsOpen(false);
                          showToast('Declined');
                        }}
                        className={`px-4 py-2 rounded-full text-xs border cursor-pointer ${t.secondaryBtn}`}
                      >
                        {d.declineLabel}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Blueprint Importer Modal */}
        {blueprintModalOpen && (
          <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <div className={`w-full max-w-md rounded-3xl border p-5 space-y-3.5 shadow-2xl border-current/15 ${t.overlay}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">Import .md Blueprint</h3>
                <button type="button" onClick={() => setBlueprintModalOpen(false)} className="p-2 rounded-full border border-current/15 cursor-pointer">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <textarea
                rows={8}
                value={blueprintDraft}
                onChange={(e) => setBlueprintDraft(e.target.value)}
                placeholder="# Project Blueprint: My PWA..."
                className={`w-full rounded-2xl border p-3 text-xs font-mono focus:outline-none ${t.input}`}
              />
              <button
                type="button"
                onClick={() => handleLaunchBlueprint(blueprintDraft)}
                className={`w-full py-2.5 rounded-full text-xs font-semibold cursor-pointer ${t.primaryBtn}`}
              >
                Run Master Orchestrator INTAKE
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
