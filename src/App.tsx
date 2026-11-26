import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AccentId,
  ActivityEvent,
  ChatMessage,
  KeySlotId,
  KeySlotState,
  MemoryItem,
  PendingDecision,
  PhaseSnapshot,
  ProjectState,
  PromptEntry,
  TelemetrySummary,
  ThemeId,
  UserProfile,
  WorkerAgentId
} from './types/agency';
import { APP_VERSION_TAG } from './version';
import { TEXT_ACCENTS, THEMES } from './theme/themes';
import { DEFAULT_GEMINI_MODEL, keyPool } from './engine/keyPool';
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
import { loadPrompts } from './prompts/agencyPrompts';
import { getOnboardingPrompt, runCaliTurn } from './engine/caliDirector';
import { GeminiLiveClient } from './engine/geminiLive';
import { AgencyOrchestratorLoop } from './engine/orchestratorLoop';
import { createInitialAgents, type PacketFlight, type PixelSpriteAgent } from './components/office/pixelOffice';
import { MiniOfficePreview, OfficeDrawer } from './components/office/OfficeDrawer';
import { WorkspaceDrawer } from './components/workspace/WorkspaceDrawer';
import { PromptStudioDrawer } from './components/prompts/PromptStudioDrawer';
import { TelemetryDrawer } from './components/telemetry/TelemetryDrawer';
import { ChangelogDrawer } from './components/changelog/ChangelogDrawer';
import { ConfirmModal, type ConfirmState } from './components/common/ConfirmModal';

type DrawerId = 'none' | 'office' | 'workspace' | 'prompts' | 'telemetry' | 'memory' | 'settings' | 'changelog';

interface SettingsKeyDraft {
  apiKey: string;
  selectedModel: string;
  availableModels: string[];
  detecting?: boolean;
}

export default function App() {
  // Saved Theme & Accent
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

  // Settings Draft Buffer (Explicit Save Button!)
  const [draftTheme, setDraftTheme] = useState<ThemeId>(theme);
  const [draftAccent, setDraftAccent] = useState<AccentId>(accent);
  const [draftGithub, setDraftGithub] = useState<GitHubConfig>(githubCfg);
  const [draftKeys, setDraftKeys] = useState<Record<KeySlotId, SettingsKeyDraft>>(() => {
    const out = {} as Record<KeySlotId, SettingsKeyDraft>;
    for (const k of keyPool.getAll()) {
      out[k.id] = {
        apiKey: k.apiKey,
        selectedModel: k.selectedModel || DEFAULT_GEMINI_MODEL,
        availableModels: k.availableModels.length ? k.availableModels : [DEFAULT_GEMINI_MODEL]
      };
    }
    return out;
  });

  // Agency Loop State
  const [loopStatus, setLoopStatus] = useState<'IDLE' | 'RUNNING' | 'PAUSED' | 'WATCHDOG' | 'DEMO'>('IDLE');
  const [hubTab, setHubTab] = useState<'feed' | 'agents' | 'checklist' | 'watchdog'>('feed');
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [decisions, setDecisions] = useState<PendingDecision[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  // Active Drawer + Modals
  const [activeDrawer, setActiveDrawer] = useState<DrawerId>('none');
  const [decisionsOpen, setDecisionsOpen] = useState(false);
  const [blueprintModalOpen, setBlueprintModalOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  // Blueprint Importer
  const [blueprintDraft, setBlueprintDraft] = useState('');

  // Chat & Live Voice (with Tap-to-Speak / Mute)
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      role: 'cali',
      text: profile.onboarding_complete
        ? `Welcome back${profile.preferred_name ? `, ${profile.preferred_name}` : ''}. The 13-agent floor is standing by—import a blueprint or tell me what we're building next.`
        : getOnboardingPrompt(profile.onboarding_step),
      meta: profile.onboarding_complete ? 'Cali • Executive Director' : `Onboarding ${profile.onboarding_step}/4`,
      ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [liveStatus, setLiveStatus] = useState<'idle' | 'connecting' | 'connected' | 'speaking' | 'closed' | 'error'>('idle');
  const [liveDetail, setLiveDetail] = useState('Tap Connect to start Gemini Live voice');
  const [liveMuted, setLiveMuted] = useState(false);
  const [liveTranscripts, setLiveTranscripts] = useState<string[]>([]);
  const liveClientRef = useRef<GeminiLiveClient | null>(null);

  // Pixel Office Shared Refs
  const agentsRef = useRef<PixelSpriteAgent[]>(createInitialAgents());
  const packetsRef = useRef<PacketFlight[]>([]);

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

  const handleDeleteProject = (projectId: string) => {
    setProjects((prev) => {
      const next = prev.filter((p) => p.id !== projectId);
      saveProjects(next);
      const nextActive = next[0]?.id || null;
      setActiveProjectId(nextActive);
      saveActiveProjectId(nextActive);
      return next;
    });
    showToast('Project deleted');
  };

  const handleRollbackSnapshot = (snap: PhaseSnapshot) => {
    if (!activeProject) return;
    const restored: ProjectState = {
      ...activeProject,
      files: { ...snap.files },
      file_manifest: { ...snap.file_manifest },
      updated_at: new Date().toISOString()
    };
    upsertProject(restored);
    pushActivity({
      agentId: 'cali',
      text: `Rolled back "${activeProject.project_name}" to Phase ${snap.phase_id} snapshot (${snap.file_count} files).`,
      kind: 'warn'
    });
    showToast(`Rolled back to Phase ${snap.phase_id}`);
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

  const openSettingsDrawer = () => {
    setDraftTheme(theme);
    setDraftAccent(accent);
    setDraftGithub(githubCfg);
    const nextDraft = {} as Record<KeySlotId, SettingsKeyDraft>;
    for (const k of keyPool.getAll()) {
      nextDraft[k.id] = {
        apiKey: k.apiKey,
        selectedModel: k.selectedModel || DEFAULT_GEMINI_MODEL,
        availableModels: k.availableModels.length ? k.availableModels : [DEFAULT_GEMINI_MODEL]
      };
    }
    setDraftKeys(nextDraft);
    setActiveDrawer('settings');
  };

  const handleDetectModelsForDraftKey = async (id: KeySlotId) => {
    const rawKey = draftKeys[id]?.apiKey || '';
    if (!rawKey.trim()) {
      showToast(`Paste an API key for ${id} first`);
      return;
    }
    setDraftKeys((prev) => ({ ...prev, [id]: { ...prev[id], detecting: true } }));
    const res = await keyPool.detectModelsForRawKey(rawKey);
    setDraftKeys((prev) => {
      const cur = prev[id];
      const nextModels = res.ok && res.models.length > 0 ? res.models : cur.availableModels;
      const nextSelected = nextModels.includes(cur.selectedModel) ? cur.selectedModel : nextModels[0] || DEFAULT_GEMINI_MODEL;
      return {
        ...prev,
        [id]: {
          ...cur,
          detecting: false,
          availableModels: nextModels,
          selectedModel: nextSelected
        }
      };
    });
    showToast(res.ok ? `${id}: ${res.detail}` : `${id}: ${res.detail}`);
  };

  const handleSaveSettings = () => {
    setTheme(draftTheme);
    setAccent(draftAccent);
    setGithubCfg(draftGithub);
    saveGitHubConfig(draftGithub);
    (Object.keys(draftKeys) as KeySlotId[]).forEach((id) => {
      const d = draftKeys[id];
      keyPool.setKeyConfig(id, d.apiKey, d.selectedModel, d.availableModels);
    });
    showToast('Settings & 5-Key Vault saved');
  };

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
        if (nextProfile.onboarding_step >= 4) nextProfile.onboarding_complete = true;
        else nextProfile.onboarding_step += 1;
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
    await client.connect(
      sys,
      {
        onStatus: (st, detail) => {
          setLiveStatus(st);
          if (detail) setLiveDetail(detail);
        },
        onTranscript: (role, txt) => {
          setLiveTranscripts((prev) => [`${role === 'cali' ? 'Cali' : 'You'}: ${txt}`, ...prev.slice(0, 10)]);
        }
      },
      liveMuted
    );
  };

  const toggleLiveMute = () => {
    const nextMuted = !liveMuted;
    setLiveMuted(nextMuted);
    liveClientRef.current?.setMuted(nextMuted);
    if (liveStatus === 'connected' || liveStatus === 'speaking') {
      setLiveDetail(nextMuted ? 'Mic Muted — Tap to Speak' : 'Mic Open — Listening...');
    }
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
      showToast('Configure K1-K4 keys & tap Save Settings for live patching');
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

  const todayStr = new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  const activePhase = activeProject?.phases.find((p) => p.phase_id === activeProject.current_phase_id) || activeProject?.phases[0];
  const fileCount = activeProject ? Object.keys(activeProject.files).length : 0;

  return (
    <div className="min-h-screen flex justify-center">
      {toast && (
        <div className="fixed top-16 right-4 z-50 px-4 py-2.5 rounded-2xl border border-white/15 bg-[#16161C]/95 text-zinc-100 text-xs font-medium shadow-2xl max-w-xs">
          {toast}
        </div>
      )}

      <div
        style={{ '--text-accent': accentHex } as React.CSSProperties}
        className={`w-full max-w-2xl h-screen flex flex-col overflow-hidden relative transition-colors duration-300 ${t.shell}`}
      >
        <div
          className={`pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[360px] h-[220px] rounded-full blur-3xl opacity-25 transition-colors duration-500 ${t.glow}`}
        />

        {/* 1. CLEAN MINIMAL TOP HEADER (Nav icons moved to floating bottom dock!) */}
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
                  : 'Monolith HQ'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveDrawer('changelog')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-mono border cursor-pointer shrink-0 ${t.subtleBadge}`}
            title="View Changelog & Versioning"
          >
            {APP_VERSION_TAG}
          </button>
        </header>

        {/* 2. SCROLLABLE MONOLITH HQ FEED */}
        <div className="relative z-10 flex-1 overflow-y-auto px-4 pt-20 pb-28 space-y-4">
          {/* Hero Briefing */}
          <section className="space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xl sm:text-2xl font-semibold tracking-tight leading-tight">{todayStr}</div>
                <div className="text-xs font-medium text-accent mt-0.5">
                  {activeProject ? `${activeProject.project_name} • Phase ${activeProject.current_phase_id}` : 'Standing by for next blueprint'}
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
                  ? `Tracking ${activeProject.project_name} (${fileCount} files). Static Pre-Check, Context Compactor, and Phase Snapshots are armed.`
                  : 'All 13 verbatim agent prompts are loaded. Import your Markdown blueprint below or chat with Cali to start building.'
                : 'Tap Start Interview below so I can learn your design taste, stack preferences, and approval rules before we start shipping.'}
            </p>
          </section>

          {/* Token / RPM / RPD / Context Telemetry Strip */}
          <button
            type="button"
            onClick={() => setActiveDrawer('telemetry')}
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

          {/* Onboarding Progress Card */}
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

          {/* Agency Floor Card + TALLER 16-Bit Pixel Virtual Office */}
          <section className={`rounded-3xl border p-4 space-y-3 ${t.surface}`}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest opacity-55">Agency Floor</div>
                <div className="text-sm font-semibold">13 Pixel Agents + Cali Suite</div>
              </div>
              <button
                type="button"
                onClick={() => setActiveDrawer('office')}
                className={`px-3.5 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer ${t.primaryBtn}`}
              >
                Enter Office
              </button>
            </div>

            <MiniOfficePreview agentsRef={agentsRef} packetsRef={packetsRef} onOpenFull={() => setActiveDrawer('office')} />

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {keys.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setActiveDrawer('telemetry')}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-mono border shrink-0 cursor-pointer ${t.subtleBadge}`}
                >
                  {k.id === 'KEY_CALI' ? 'CALI' : k.id}: {k.status}
                </button>
              ))}
            </div>
          </section>

          {/* Real Projects & Blueprint Importer (NO mock starter plans!) */}
          <section className={`rounded-3xl border p-4 space-y-3 ${t.surface}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-widest opacity-55">
                Your Projects ({projects.length})
              </div>
              <button
                type="button"
                onClick={() => setBlueprintModalOpen(true)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold cursor-pointer ${t.primaryBtn}`}
              >
                + Import .md Blueprint
              </button>
            </div>

            {projects.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-current/15 p-4 text-center space-y-2">
                <p className="text-xs opacity-70">No projects yet. Import a Markdown blueprint or chat with Cali to generate one.</p>
                <button
                  type="button"
                  onClick={() => setChatOpen(true)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium border cursor-pointer ${t.secondaryBtn}`}
                >
                  Plan with Cali
                </button>
              </div>
            ) : (
              <>
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
                      onClick={() => setActiveDrawer('workspace')}
                      className={`px-4 py-2 rounded-full text-xs font-medium border cursor-pointer ${t.secondaryBtn}`}
                    >
                      Workspace ({fileCount})
                    </button>
                  </div>
                )}
              </>
            )}
          </section>

          {/* 4-Tab Agency Hub Card */}
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
                  <p className="text-xs opacity-60 py-3 text-center">No agent activity yet. Import a blueprint to begin.</p>
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
                  <p className="text-xs opacity-60 py-3 text-center">Import a project to view its Phase Gate checklist.</p>
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
                    <span className="text-[10px] opacity-65 truncate max-w-[130px]">{k.selectedModel}</span>
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
              <button type="button" onClick={() => setActiveDrawer('memory')} className="text-[11px] font-medium text-accent cursor-pointer">
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

        {/* 3. FLOATING BOTTOM MENU BAR (Easy thumb navigation on phones!) */}
        <nav
          aria-label="Primary navigation"
          className="absolute bottom-4 inset-x-3 z-20 flex items-center justify-center pointer-events-none"
        >
          <div className={`pointer-events-auto flex items-center gap-1 px-2 py-1.5 rounded-full border backdrop-blur-xl ${t.dockBg}`}>
            {(
              [
                ['none', 'Home', <path key="h" d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9.5z" />],
                ['office', 'Office', <><rect key="o1" x="3" y="4" width="18" height="14" rx="2" /><line key="o2" x1="8" y1="21" x2="16" y2="21" /><line key="o3" x1="12" y1="18" x2="12" y2="21" /></>],
                ['workspace', 'Files', <path key="w" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />],
                ['prompts', 'Prompts', <><polyline key="p1" points="16 18 22 12 16 6" /><polyline key="p2" points="8 6 2 12 8 18" /></>],
                ['telemetry', 'API', <polyline key="t1" points="22 12 18 12 15 21 9 3 6 12 2 12" />],
                ['memory', 'Memory', <><path key="m1" d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z" /><path key="m2" d="M9 22h6" /></>],
                ['settings', 'Settings', <><line key="s1" x1="4" y1="21" x2="4" y2="14" /><line key="s2" x1="4" y1="10" x2="4" y2="3" /><line key="s3" x1="12" y1="21" x2="12" y2="12" /><line key="s4" x1="12" y1="8" x2="12" y2="3" /><line key="s5" x1="20" y1="21" x2="20" y2="16" /><line key="s6" x1="20" y1="12" x2="20" y2="3" /><line key="s7" x1="1" y1="14" x2="7" y2="14" /><line key="s8" x1="9" y1="8" x2="15" y2="8" /><line key="s9" x1="17" y1="16" x2="23" y2="16" /></>]
              ] as Array<[DrawerId, string, React.ReactNode]>
            ).map(([id, label, icon]) => {
              const isActive = activeDrawer === id;
              return (
                <button
                  key={id}
                  type="button"
                  title={label}
                  onClick={() => (id === 'settings' ? openSettingsDrawer() : setActiveDrawer(id))}
                  className={`p-2.5 rounded-full transition cursor-pointer ${isActive ? t.iconBtnActive : t.iconBtn}`}
                >
                  <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    {icon}
                  </svg>
                </button>
              );
            })}

            {/* Cali Quick Chat Orb integrated cleanly into right end of Floating Bottom Dock */}
            <button
              type="button"
              title="Chat with Cali"
              onClick={() => setChatOpen(true)}
              className={`ml-1 w-10 h-10 rounded-full flex items-center justify-center shadow-lg border cursor-pointer active:scale-95 transition-transform ${t.fabCore}`}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 3l2.15 6.85L21 12l-6.85 2.15L12 21l-2.15-6.85L3 12l6.85-2.15L12 3z" />
                <circle cx="18.75" cy="5.25" r="1.1" fill="currentColor" stroke="none" />
              </svg>
            </button>
          </div>
        </nav>

        {/* 4. FULL DRAWERS */}
        <OfficeDrawer
          open={activeDrawer === 'office'}
          onClose={() => setActiveDrawer('none')}
          t={t}
          keys={keys}
          telemetry={telemetry}
          agentsRef={agentsRef}
          packetsRef={packetsRef}
          onTriggerDemoHandoff={triggerRandomHandoff}
          onOpenTelemetry={() => setActiveDrawer('telemetry')}
        />

        <WorkspaceDrawer
          open={activeDrawer === 'workspace'}
          onClose={() => setActiveDrawer('none')}
          t={t}
          project={activeProject}
          githubConfig={githubCfg}
          onSendErrorToDebugger={handleSendPreviewErrorToDebugger}
          onRollbackSnapshot={handleRollbackSnapshot}
          onDeleteProject={handleDeleteProject}
          onRequestConfirm={setConfirmState}
          onToast={showToast}
        />

        <PromptStudioDrawer
          open={activeDrawer === 'prompts'}
          onClose={() => setActiveDrawer('none')}
          t={t}
          prompts={prompts}
          onPromptsChange={setPrompts}
          onRequestConfirm={setConfirmState}
          onToast={showToast}
        />

        <TelemetryDrawer
          open={activeDrawer === 'telemetry'}
          onClose={() => setActiveDrawer('none')}
          t={t}
          keys={keys}
          telemetry={telemetry}
          onToast={showToast}
        />

        <ChangelogDrawer
          open={activeDrawer === 'changelog'}
          onClose={() => setActiveDrawer('none')}
          t={t}
        />

        {/* Chat Sheet */}
        {chatOpen && (
          <div className={`absolute inset-0 z-40 flex flex-col backdrop-blur-2xl ${t.overlay}`}>
            <div className="px-5 py-4 border-b border-current/10 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold leading-none">Cali</h3>
                <p className="text-[11px] opacity-55 mt-1">
                  {profile.onboarding_complete ? 'Executive Project Director' : `Onboarding Interview (${profile.onboarding_step}/4)`}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setChatOpen(false);
                    setVoiceOpen(true);
                  }}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-medium border cursor-pointer ${t.secondaryBtn}`}
                >
                  Voice Mode
                </button>
                <button type="button" onClick={() => setChatOpen(false)} className="p-2 rounded-full border border-current/15 cursor-pointer">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
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

        {/* Gemini Live Voice Overlay (With Tap-to-Speak / Mute Toggle!) */}
        {voiceOpen && (
          <div className={`absolute inset-0 z-40 flex flex-col items-center justify-between p-6 backdrop-blur-2xl text-center ${t.overlay}`}>
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
              {/* Interactive Tap-to-Speak / Mute Mic Orb */}
              <button
                type="button"
                onClick={toggleLiveMute}
                aria-label={liveMuted ? 'Tap to Speak' : 'Tap to Mute'}
                className="relative w-36 h-36 flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
              >
                {!liveMuted && (liveStatus === 'connected' || liveStatus === 'speaking') && (
                  <span className={`absolute inset-0 rounded-full animate-breathe ${t.fabHalo}`} />
                )}
                <div
                  className={`relative w-24 h-24 rounded-full flex items-center justify-center shadow-2xl border transition-colors ${
                    liveMuted ? 'bg-rose-600 text-white border-rose-400/50' : t.fabCore
                  }`}
                >
                  {liveMuted ? (
                    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <line x1="1" y1="1" x2="23" y2="23" />
                      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                    </svg>
                  ) : (
                    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                    </svg>
                  )}
                </div>
              </button>

              <div className="space-y-1.5 max-w-xs">
                <h3 className="text-lg font-semibold">
                  {liveMuted ? 'Mic Muted — Tap Orb to Speak' : liveStatus === 'connected' || liveStatus === 'speaking' ? 'Mic Open — Listening' : 'Voice Briefing'}
                </h3>
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

            <div className="w-full max-w-xs flex items-center gap-2">
              <button
                type="button"
                onClick={toggleLiveMute}
                className={`flex-1 py-3 rounded-full text-xs font-semibold border cursor-pointer ${
                  liveMuted ? 'bg-rose-600/20 text-rose-400 border-rose-500/40' : t.secondaryBtn
                }`}
              >
                {liveMuted ? 'Unmute Mic' : 'Mute Mic'}
              </button>
              <button
                type="button"
                onClick={toggleLiveVoice}
                className={`flex-1 py-3 rounded-full text-xs font-semibold cursor-pointer ${t.primaryBtn}`}
              >
                {liveStatus === 'connected' || liveStatus === 'speaking' ? 'End Call' : 'Connect Live'}
              </button>
            </div>
          </div>
        )}

        {/* Memory Drawer (Red Danger Forget with Confirmation Modal) */}
        {activeDrawer === 'memory' && (
          <div className={`absolute inset-0 z-30 flex flex-col backdrop-blur-2xl p-5 ${t.overlay}`}>
            <div className="flex items-center justify-between pb-4 border-b border-current/10">
              <div>
                <h3 className="text-lg font-semibold leading-none">What Cali Remembers</h3>
                <p className="text-[11px] opacity-60 mt-1">Injected into Orchestrator &amp; UI Designer</p>
              </div>
              <button type="button" onClick={() => setActiveDrawer('none')} className="p-2 rounded-full border border-current/15 cursor-pointer">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-4 pb-24 space-y-2.5">
              {memories.length === 0 ? (
                <p className="text-xs opacity-60 text-center py-8">No saved memories yet.</p>
              ) : (
                memories.map((m) => (
                  <div key={m.id} className={`rounded-2xl border p-3.5 space-y-2 ${t.surface}`}>
                    <div className="flex justify-between text-[10px] uppercase">
                      <span className="font-semibold text-accent">{m.key}</span>
                      <span className="opacity-55">{Math.round(m.confidence * 100)}%</span>
                    </div>
                    <p className="text-xs">{m.value}</p>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmState({
                          title: `Forget "${m.key}"?`,
                          message: 'Cali will permanently erase this learned preference from local memory.',
                          confirmLabel: 'Forget Memory',
                          onConfirm: () => {
                            const next = memories.filter((x) => x.id !== m.id);
                            setMemories(next);
                            saveMemories(next);
                            showToast('Memory forgotten');
                          }
                        })
                      }
                      className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-rose-600/20 text-rose-400 border border-rose-500/40 hover:bg-rose-600 hover:text-white cursor-pointer"
                    >
                      Delete Memory
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Settings Drawer (Explicit Save Settings Button + Auto-Detect Model Selector per Key + Changelog + Red Danger Zone) */}
        {activeDrawer === 'settings' && (
          <div className={`absolute inset-0 z-30 flex flex-col backdrop-blur-2xl p-5 ${t.overlay}`}>
            <div className="flex items-center justify-between pb-3.5 border-b border-current/10 shrink-0">
              <div>
                <h3 className="text-lg font-semibold leading-none">Settings &amp; 5-Key Vault</h3>
                <p className="text-[11px] opacity-60 mt-1">Changes apply when you tap Save Settings</p>
              </div>
              <button type="button" onClick={() => setActiveDrawer('none')} className="p-2 rounded-full border border-current/15 cursor-pointer">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 pb-28 space-y-4">
              {/* 1. Theme & Accent */}
              <div className={`rounded-3xl border p-4 space-y-3 ${t.surface}`}>
                <div className="text-[11px] font-semibold uppercase tracking-widest opacity-55">1. Theme &amp; Text Accent</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['monolith', 'nocturne', 'alabaster'] as ThemeId[]).map((th) => (
                    <button
                      key={th}
                      type="button"
                      onClick={() => setDraftTheme(th)}
                      className={`py-2 rounded-2xl text-xs font-medium capitalize border cursor-pointer ${
                        draftTheme === th ? t.primaryBtn : t.secondaryBtn
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
                      onClick={() => setDraftAccent(ac)}
                      className={`py-1.5 rounded-2xl text-[11px] font-medium border cursor-pointer ${
                        draftAccent === ac ? t.primaryBtn : t.secondaryBtn
                      }`}
                    >
                      {TEXT_ACCENTS[ac].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. 5 Gemini API Keys (AQ.xxxx Native Support + Auto-Detected Model Selector) */}
              <div className={`rounded-3xl border p-4 space-y-3.5 ${t.surface}`}>
                <div className="text-[11px] font-semibold uppercase tracking-widest opacity-55">
                  2. 5 Gemini API Keys (AQ.xxxx &amp; AIza Ready)
                </div>
                {(['KEY_CALI', 'K1', 'K2', 'K3', 'K4'] as KeySlotId[]).map((id) => {
                  const d = draftKeys[id];
                  return (
                    <div key={id} className="space-y-1.5 pb-2.5 border-b border-current/10 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono font-semibold">{id}</span>
                        <button
                          type="button"
                          disabled={d.detecting}
                          onClick={() => handleDetectModelsForDraftKey(id)}
                          className="text-[10px] font-semibold text-accent hover:underline cursor-pointer disabled:opacity-45"
                        >
                          {d.detecting ? 'Detecting…' : 'Detect Models'}
                        </button>
                      </div>
                      <input
                        type="password"
                        value={d.apiKey}
                        onChange={(e) =>
                          setDraftKeys((prev) => ({ ...prev, [id]: { ...prev[id], apiKey: e.target.value } }))
                        }
                        placeholder={`Paste ${id} (AQ.xxxx or AIza...)`}
                        className={`w-full px-3.5 py-2 rounded-2xl text-xs border focus:outline-none ${t.input}`}
                      />
                      <select
                        value={d.selectedModel}
                        onChange={(e) =>
                          setDraftKeys((prev) => ({ ...prev, [id]: { ...prev[id], selectedModel: e.target.value } }))
                        }
                        className={`w-full px-3 py-1.5 rounded-xl text-[11px] font-mono border focus:outline-none ${t.input}`}
                      >
                        {d.availableModels.map((m) => (
                          <option key={m} value={m} className="bg-[#18181D] text-zinc-100">
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              {/* 3. Optional GitHub Ship PAT */}
              <div className={`rounded-3xl border p-4 space-y-2.5 ${t.surface}`}>
                <div className="text-[11px] font-semibold uppercase tracking-widest opacity-55">3. 1-Tap Ship to GitHub (Optional)</div>
                <input
                  type="password"
                  value={draftGithub.token}
                  onChange={(e) => setDraftGithub((prev) => ({ ...prev, token: e.target.value }))}
                  placeholder="GitHub PAT (repo scope)"
                  className={`w-full px-3.5 py-2 rounded-2xl text-xs border focus:outline-none ${t.input}`}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={draftGithub.owner}
                    onChange={(e) => setDraftGithub((prev) => ({ ...prev, owner: e.target.value }))}
                    placeholder="GitHub Username"
                    className={`w-full px-3.5 py-2 rounded-2xl text-xs border focus:outline-none ${t.input}`}
                  />
                  <input
                    value={draftGithub.repo}
                    onChange={(e) => setDraftGithub((prev) => ({ ...prev, repo: e.target.value }))}
                    placeholder="Target Repo Name"
                    className={`w-full px-3.5 py-2 rounded-2xl text-xs border focus:outline-none ${t.input}`}
                  />
                </div>
              </div>

              {/* Explicit SAVE SETTINGS Button */}
              <button
                type="button"
                onClick={handleSaveSettings}
                className={`w-full py-3 rounded-full text-xs font-semibold shadow-lg cursor-pointer ${t.primaryBtn}`}
              >
                Save Settings
              </button>

              {/* Version & Changelog Link */}
              <button
                type="button"
                onClick={() => setActiveDrawer('changelog')}
                className={`w-full py-2.5 rounded-full text-xs font-medium border cursor-pointer ${t.secondaryBtn}`}
              >
                View Changelog ({APP_VERSION_TAG})
              </button>

              {/* RED DANGER ZONE */}
              <div className="rounded-3xl border border-rose-500/40 bg-rose-950/20 p-4 space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-rose-400">Danger Zone</div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmState({
                        title: 'Clear All 5 API Keys?',
                        message: 'All saved Gemini API keys and model selections will be wiped from this device.',
                        confirmLabel: 'Clear All Keys',
                        onConfirm: () => {
                          keyPool.clearAllKeys();
                          openSettingsDrawer();
                          showToast('All 5 API keys cleared');
                        }
                      })
                    }
                    className="flex-1 py-2.5 rounded-full text-xs font-semibold bg-rose-600/25 text-rose-300 border border-rose-500/40 hover:bg-rose-600 hover:text-white cursor-pointer"
                  >
                    Clear 5-Key Vault
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmState({
                        title: 'Reset Onboarding & Memories?',
                        message: 'Cali will forget your saved preferences and restart the 4-step Executive Onboarding interview.',
                        confirmLabel: 'Reset Cali Memory',
                        onConfirm: () => {
                          saveMemories([]);
                          setMemories([]);
                          const fresh: UserProfile = {
                            preferred_name: null,
                            honorific: null,
                            language_pref: 'en',
                            onboarding_step: 1,
                            onboarding_complete: false
                          };
                          saveProfile(fresh);
                          setProfile(fresh);
                          showToast('Cali memory & onboarding reset');
                        }
                      })
                    }
                    className="flex-1 py-2.5 rounded-full text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
                  >
                    Reset Cali Memory
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pending Decisions Modal */}
        {decisionsOpen && (
          <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
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
          <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
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

        {/* Global Red Danger Zone Confirmation Modal */}
        <ConfirmModal state={confirmState} onCancel={() => setConfirmState(null)} t={t} />
      </div>
    </div>
  );
}
