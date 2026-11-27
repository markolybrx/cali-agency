import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AccentId,
  ActivityEvent,
  AgencyReport,
  AgentMetric,
  ChatMessage,
  KeySlotId,
  KeySlotState,
  MemoryItem,
  PendingDecision,
  PhaseSnapshot,
  ProjectState,
  ProjectTarget,
  PromptEntry,
  StudioPace,
  TelemetrySummary,
  ThemeId,
  UserProfile,
  WorkerAgentId
} from './types/agency';
import { APP_VERSION_TAG } from './version';
import { normalizeThemeId, TEXT_ACCENTS, THEMES } from './theme/themes';
import { DEFAULT_GEMINI_MODEL, keyPool } from './engine/keyPool';
import {
  createFreshProfile,
  type GitHubConfig,
  loadActiveProjectId,
  loadAgentMetrics,
  loadGitHubConfig,
  loadMemories,
  loadProfile,
  loadProjects,
  saveActiveProjectId,
  saveAgentMetrics,
  saveGitHubConfig,
  saveMemories,
  saveProfile,
  saveProjects,
  upsertMemory
} from './engine/storage';
import { idbDeleteProject, idbGetAllProjects, idbGetAllReports, idbPutProject, idbPutReport } from './engine/indexedDb';
import { exportFullStateBackup, getLocalSaveFolder, parseFullStateBackup, setLocalSaveFolder, writeReportToLocalFolder } from './engine/localSave';
import { loadPrompts, savePromptOverride } from './prompts/agencyPrompts';
import { runCaliTurn } from './engine/caliDirector';
import { GeminiLiveClient } from './engine/geminiLive';
import { AgencyOrchestratorLoop } from './engine/orchestratorLoop';
import {
  type CaliBrainCache,
  flushOfflineSyncQueue,
  loadBrainCache,
  pushPrivateMemoryToCloud,
  pushProfileToCloud,
  reviewSharedBrainCandidate,
  submitSharedBrainCandidate,
  syncBrainFromCloud
} from './engine/caliBrain';
import { createInitialAgents, type PacketFlight, type PixelSpriteAgent } from './components/office/pixelOffice';
import { MiniOfficePreview, OfficeDrawer } from './components/office/OfficeDrawer';
import { WorkspaceDrawer } from './components/workspace/WorkspaceDrawer';
import { PromptStudioDrawer } from './components/prompts/PromptStudioDrawer';
import { TelemetryDrawer } from './components/telemetry/TelemetryDrawer';
import { ChangelogDrawer } from './components/changelog/ChangelogDrawer';
import { ConfirmModal, type ConfirmState } from './components/common/ConfirmModal';
import { ModelPickerModal } from './components/common/ModelPickerModal';
import { ArtifactCanvasModal, type CanvasDocument } from './components/common/ArtifactCanvasModal';
import { OnboardingGate } from './components/onboarding/OnboardingGate';
import { CaliSignInModal } from './components/auth/CaliSignInModal';
import { LoginGate } from './components/auth/LoginGate';
import { ProjectHub } from './components/hub/ProjectHub';
import { ReportsDrawer } from './components/reports/ReportsDrawer';
import { SuggestionBoardModal } from './components/culture/SuggestionBoardModal';
import { CoachingLogsModal } from './components/culture/CoachingLogsModal';
import { OrgChartModal } from './components/culture/OrgChartModal';
import {
  type CoachingSession,
  createCoachingRecord,
  createEscalatedSuggestion,
  loadCoachingSessions,
  loadSuggestions,
  saveCoachingSessions,
  saveSuggestions,
  type TeamSuggestion
} from './engine/workplaceCulture';

type EntryStage = 'login' | 'hub' | 'app';
type TabId = 'office' | 'workspace' | 'reports' | 'home' | 'prompts' | 'memory' | 'settings' | 'telemetry';

interface SettingsKeyDraft {
  apiKey: string;
  selectedModel: string;
  availableModels: string[];
  detecting?: boolean;
}

const ACCESS_MODE_KEY = 'cali_access_mode_v080';

export default function App() {
  const [theme, setTheme] = useState<ThemeId>(() => normalizeThemeId(localStorage.getItem('cali_theme')));
  const [accent, setAccent] = useState<AccentId>(() => (localStorage.getItem('cali_accent') as AccentId) || 'marigold');
  const t = THEMES[theme] || THEMES.monolith;
  const accentHex = t.isLight ? TEXT_ACCENTS[accent].light : TEXT_ACCENTS[accent].dark;

  const [accessMode, setAccessMode] = useState<'google' | 'local' | null>(() => {
    const saved = localStorage.getItem(ACCESS_MODE_KEY);
    return saved === 'google' || saved === 'local' ? saved : null;
  });
  const [stage, setStage] = useState<EntryStage>(() => (localStorage.getItem(ACCESS_MODE_KEY) ? 'hub' : 'login'));
  const [chatScope, setChatScope] = useState<'project' | 'planning' | 'general'>('project');

  const [profile, setProfile] = useState<UserProfile>(() => loadProfile());
  const [memories, setMemories] = useState<MemoryItem[]>(() => loadMemories());
  const [projects, setProjects] = useState<ProjectState[]>(() => loadProjects());
  const [reports, setReports] = useState<AgencyReport[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => loadActiveProjectId());
  const [prompts, setPrompts] = useState<PromptEntry[]>(() => loadPrompts());
  const [githubCfg, setGithubCfg] = useState<GitHubConfig>(() => loadGitHubConfig());
  const [agentMetrics, setAgentMetrics] = useState<Record<string, AgentMetric>>(() => loadAgentMetrics());

  const [keys, setKeys] = useState<KeySlotState[]>(() => keyPool.getAll());
  const [telemetry, setTelemetry] = useState<TelemetrySummary>(() => keyPool.getTelemetry());
  const [brainCache, setBrainCache] = useState<CaliBrainCache>(() => loadBrainCache());

  const [pace, setPace] = useState<StudioPace>('studio');
  const [sitrepMinutes, setSitrepMinutes] = useState<number>(15);
  const [localFolder, setLocalFolder] = useState<string>(() => getLocalSaveFolder());
  const [targetPlatform, setTargetPlatform] = useState<ProjectTarget>('pwa');

  // Settings Draft Buffer
  const [draftTheme, setDraftTheme] = useState<ThemeId>(theme);
  const [draftAccent, setDraftAccent] = useState<AccentId>(accent);
  const [draftGithub, setDraftGithub] = useState<GitHubConfig>(githubCfg);
  const [draftFolder, setDraftFolder] = useState<string>(localFolder);
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

  const [modelPickerKeyId, setModelPickerKeyId] = useState<KeySlotId | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [decisionsOpen, setDecisionsOpen] = useState(false);
  const [blueprintModalOpen, setBlueprintModalOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [canvasDoc, setCanvasDoc] = useState<CanvasDocument | null>(null);
  const [suggestions, setSuggestions] = useState<TeamSuggestion[]>(() => loadSuggestions());
  const [coachingLogs, setCoachingLogs] = useState<CoachingSession[]>(() => loadCoachingSessions());
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [coachingOpen, setCoachingOpen] = useState(false);
  const [orgChartOpen, setOrgChartOpen] = useState(false);
  const [planningGate, setPlanningGate] = useState<1 | 2 | 3 | 4>(1);

  const [loopStatus, setLoopStatus] = useState<'IDLE' | 'RUNNING' | 'PAUSED' | 'WATCHDOG' | 'DEMO'>('IDLE');
  const [hubTab, setHubTab] = useState<'feed' | 'agents' | 'checklist' | 'watchdog'>('feed');
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [decisions, setDecisions] = useState<PendingDecision[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [blueprintDraft, setBlueprintDraft] = useState('');

  // Chat & Live Voice
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      role: 'cali',
      text: profile.onboarding_complete
        ? `Welcome back${profile.preferred_name ? `, ${profile.preferred_name}` : ''}. Pitch a new idea or review your active sprint below.`
        : "Hey—I'm Cali, your COO. Before we open the Project Hub, let's do a quick chat so I build things your way. What should I call you, and do you prefer English or natural Taglish?",
      meta: profile.onboarding_complete ? 'Cali / COO' : 'Cali / Onboarding',
      ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const [liveStatus, setLiveStatus] = useState<'idle' | 'connecting' | 'connected' | 'speaking' | 'closed' | 'error'>('idle');
  const [liveDetail, setLiveDetail] = useState('Tap Connect to start Gemini Live voice');
  const [liveMuted, setLiveMuted] = useState(false);
  const [liveTranscripts, setLiveTranscripts] = useState<string[]>([]);
  const [liveToolLogs, setLiveToolLogs] = useState<string[]>([]);
  const liveClientRef = useRef<GeminiLiveClient | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const agentsRef = useRef<PixelSpriteAgent[]>(createInitialAgents());
  const packetsRef = useRef<PacketFlight[]>([]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) || projects[0] || null,
    [projects, activeProjectId]
  );

  const liveStateRef = useRef({
    activeProject: null as ProjectState | null,
    decisions: [] as PendingDecision[],
    loopStatus: 'IDLE',
    agentMetrics: {} as Record<string, AgentMetric>
  });
  liveStateRef.current = { activeProject, decisions, loopStatus, agentMetrics };

  // Hydrate durable IndexedDB on boot + migrate any legacy localStorage projects
  useEffect(() => {
    void (async () => {
      const idbProjects = await idbGetAllProjects();
      if (idbProjects.length > 0) {
        setProjects(idbProjects);
      } else {
        const legacy = loadProjects();
        for (const p of legacy) await idbPutProject(p);
      }
      const idbReports = await idbGetAllReports();
      setReports(idbReports);
    })();
  }, []);

  useEffect(() => {
    document.body.style.backgroundColor = t.bodyBg;
    localStorage.setItem('cali_theme', theme);
    localStorage.setItem('cali_accent', accent);
  }, [theme, accent, t.bodyBg]);

  useEffect(() => {
    return keyPool.subscribe(() => {
      setKeys(keyPool.getAll());
      setTelemetry(keyPool.getTelemetry());
    });
  }, []);

  useEffect(() => {
    if (chatOpen) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages.length, chatOpen, chatBusy]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2800);
  };

  const handleSyncBrain = async () => {
    const res = await syncBrainFromCloud(loadProfile(), loadMemories());
    setBrainCache(res.cache);
    if (res.synced) {
      setProfile(res.mergedProfile);
      saveProfile(res.mergedProfile);
      setMemories(res.mergedMemories);
      saveMemories(res.mergedMemories);
    }
  };

  useEffect(() => {
    void handleSyncBrain();
    const onOnline = async () => {
      const n = await flushOfflineSyncQueue();
      await handleSyncBrain();
      if (n > 0) showToast(`Back online — synced ${n} brain update(s)`);
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  // Periodic Cali Sitrep generator during active production
  useEffect(() => {
    if (loopStatus !== 'RUNNING' || sitrepMinutes <= 0) return;
    const timer = window.setInterval(() => {
      createPeriodicSitrep(false);
    }, sitrepMinutes * 60_000);
    return () => clearInterval(timer);
  }, [loopStatus, sitrepMinutes, activeProject?.id]);

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

  const saveReportRecord = (report: AgencyReport) => {
    setReports((prev) => [report, ...prev]);
    void idbPutReport(report);
  };

  const openReportInCanvas = (rep: AgencyReport) => {
    setCanvasDoc({
      category: rep.badge,
      title: rep.title,
      subtitle: `Prepared by ${rep.author} / ${new Date(rep.createdAt).toLocaleString()}`,
      content: rep.markdown,
      mode: 'editorial',
      filename: `${rep.id}.md`,
      metrics: rep.metrics
    });
  };

  const createPeriodicSitrep = (openImmediately = true) => {
    const proj = activeProject;
    const fileCount = proj ? Object.keys(proj.files).length : 0;
    const activeKeys = keyPool.getAll().filter((k) => k.role === 'worker' && k.status === 'READY').length;
    const rep: AgencyReport = {
      id: `rep_sitrep_${Date.now().toString(36)}`,
      projectId: proj?.id || null,
      projectName: proj?.project_name || 'Cali Agency HQ',
      category: 'cali',
      badge: 'CALI EXECUTIVE SITREP',
      title: proj
        ? `Progress Sitrep: ${proj.project_name} (Phase ${proj.current_phase_id})`
        : 'Studio Status Sitrep: Standing By',
      author: 'Cali (COO)',
      summary: `${fileCount} files synced locally. ${activeKeys}/4 worker keys READY. Loop state: ${loopStatus}.`,
      markdown: [
        '## Executive Status',
        proj
          ? `Currently tracking **${proj.project_name}** on **Phase ${proj.current_phase_id}** in **${pace.toUpperCase()}** pacing mode.`
          : 'No active project is currently running. Select or create a project from the Project Selection Hub.',
        '',
        '## Telemetry & 5-Key Pool',
        `- **Total Tokens Used:** ${telemetry.totalTokens.toLocaleString()}`,
        `- **Rolling RPM / Daily RPD:** ${telemetry.activeRpm} RPM / ${telemetry.totalRpd} RPD`,
        `- **Context Window Utilization:** ${telemetry.contextPercent}%`,
        `- **Local Storage Folder:** Documents/${localFolder}/`,
        '',
        '## Recent Activity',
        ...(activity.slice(0, 5).map((a) => `- [${a.ts}] **${a.agentId}:** ${a.text}`) || ['- Studio ready.'])
      ].join('\n'),
      metrics: [
        { label: 'Files', value: String(fileCount) },
        { label: 'Keys Ready', value: `${activeKeys}/4` },
        { label: 'Pace', value: pace.toUpperCase() }
      ],
      createdAt: new Date().toISOString()
    };
    saveReportRecord(rep);
    if (proj) void writeReportToLocalFolder(proj.project_name, rep);
    showToast('Cali Executive Sitrep generated');
    if (openImmediately) openReportInCanvas(rep);
  };

  const upsertProject = (proj: ProjectState) => {
    setProjects((prev) => {
      const idx = prev.findIndex((p) => p.id === proj.id);
      const next = idx >= 0 ? prev.map((p, i) => (i === idx ? proj : p)) : [proj, ...prev];
      saveProjects(next);
      return next;
    });
    void idbPutProject(proj);
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
    void idbDeleteProject(projectId);
    showToast('Project deleted');
  };

  const handleAddGeneratedAssets = (newFiles: Record<string, string>) => {
    if (!activeProject) return;
    const updated: ProjectState = {
      ...activeProject,
      files: { ...activeProject.files, ...newFiles },
      file_manifest: {
        ...activeProject.file_manifest,
        'icons/icon-192.svg': 'Auto-generated 192px SVG app icon',
        'icons/icon-512.svg': 'Auto-generated 512px SVG app icon',
        'manifest.webmanifest': 'Standalone PWA Web App Manifest'
      },
      updated_at: new Date().toISOString()
    };
    upsertProject(updated);
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
      onReportCreated: (rep) => saveReportRecord(rep),
      onSuggestionRaised: (specialistId, title, rationale, impact) => {
        const sug = createEscalatedSuggestion({
          projectId: liveStateRef.current.activeProject?.id || null,
          specialistId,
          title,
          rationale,
          impact
        });
        setSuggestions((prev) => {
          const next = [sug, ...prev];
          saveSuggestions(next);
          return next;
        });
        showToast(`Escalated Suggestion: ${sug.title.slice(0, 42)}`);
      },
      onCoachingTriggered: (kind, proj, specialistId, taskId, reason, takeaway) => {
        const { session, report } = createCoachingRecord({
          kind,
          projectId: proj.id,
          projectName: proj.project_name,
          specialistId,
          taskId,
          triggerReason: reason,
          takeaway
        });
        setCoachingLogs((prev) => {
          const next = [session, ...prev];
          saveCoachingSessions(next);
          return next;
        });
        saveReportRecord(report);
        void writeReportToLocalFolder(proj.project_name, report);
      },
      onPhaseGateReady: (proj, completedPhaseId, report) => {
        const nextPhaseId = completedPhaseId + 1;
        setMessages((prev) => [
          ...prev,
          {
            id: `gate_${Date.now()}`,
            role: 'cali',
            text: `Phase ${completedPhaseId} is complete for ${proj.project_name}. Tap the report card below to review the full Accomplishment Report, or approve Phase ${nextPhaseId} to continue production.`,
            meta: 'Cali / Phase Gate',
            ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            reportId: report.id,
            canvasTitle: report.title,
            canvasSubtitle: report.summary,
            canvasContent: report.markdown,
            actionBox: {
              id: `act_gate_${Date.now()}`,
              kind: 'PHASE_GATE',
              title: `Advance ${proj.project_name} to Phase ${nextPhaseId}?`,
              detail: `Phase ${completedPhaseId} snapshot saved & files synced locally.`,
              approveLabel: `Approve & Start Phase ${nextPhaseId}`,
              declineLabel: 'Hold for Review',
              status: 'pending',
              payload: { projectId: proj.id, nextPhaseId }
            }
          }
        ]);
      },
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
      onAgentMetric: (agentId, latencyMs, tokens, taskLabel, isRetry) => {
        setAgentMetrics((prev) => {
          const cur = prev[agentId];
          const calls = (cur?.calls || 0) + 1;
          const avgLatencyMs = cur ? Math.round((cur.avgLatencyMs * cur.calls + latencyMs) / calls) : latencyMs;
          const next: Record<string, AgentMetric> = {
            ...prev,
            [agentId]: {
              agentId,
              calls,
              lastLatencyMs: latencyMs,
              avgLatencyMs,
              totalTokens: (cur?.totalTokens || 0) + tokens,
              retries: (cur?.retries || 0) + (isRetry ? 1 : 0),
              lastTask: taskLabel,
              updatedAt: new Date().toISOString()
            }
          };
          saveAgentMetrics(next);
          return next;
        });
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

  // Atomic Phase 1 -> Phase 2 handler (also greys out Chat CTA permanently)
  const handleResolveChatAction = (msgId: string, decision: 'approved' | 'declined') => {
    const targetMsg = messages.find((m) => m.id === msgId);
    const box = targetMsg?.actionBox;
    if (!box || box.status !== 'pending') return;

    const resolvedLabel =
      decision === 'approved'
        ? box.kind === 'PHASE_GATE'
          ? `Approved — Phase ${box.payload?.nextPhaseId || ''} Started`
          : 'Approved & Launched'
        : 'Held by Founder';

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.actionBox
          ? { ...m, actionBox: { ...m.actionBox, status: decision, resolvedLabel } }
          : m
      )
    );

    if (decision === 'approved' && box.kind === 'PHASE_GATE' && activeProject) {
      const advanced = orchestratorRef.current!.advanceToNextPhase(activeProject);
      setDecisions((prev) => prev.filter((d) => d.kind !== 'PHASE_GATE'));
      showToast(`Phase ${advanced.current_phase_id} started`);
      void orchestratorRef.current!.runLoop(advanced);
    } else if (decision === 'approved' && box.kind === 'LAUNCH_BLUEPRINT' && targetMsg?.blueprintDraft) {
      void handleLaunchBlueprint(targetMsg.blueprintDraft);
    } else {
      showToast('Action held');
    }
  };

  const handleApprovePendingDecision = (dec: PendingDecision, approved: boolean) => {
    setDecisions((prev) => prev.filter((x) => x.id !== dec.id));
    if (decisions.length <= 1) setDecisionsOpen(false);
    if (approved && dec.kind === 'PHASE_GATE' && activeProject) {
      const advanced = orchestratorRef.current!.advanceToNextPhase(activeProject);
      // Also grey out matching chat CTA if present
      setMessages((prev) =>
        prev.map((m) =>
          m.actionBox && m.actionBox.status === 'pending' && m.actionBox.kind === 'PHASE_GATE'
            ? {
                ...m,
                actionBox: {
                  ...m.actionBox,
                  status: 'approved',
                  resolvedLabel: `Approved — Phase ${advanced.current_phase_id} Started`
                }
              }
            : m
        )
      );
      showToast(`Advancing to Phase ${advanced.current_phase_id}`);
      void orchestratorRef.current!.runLoop(advanced);
    } else {
      showToast(approved ? 'Approved' : 'Declined');
    }
  };

  const switchToTab = (tab: TabId) => {
    if (tab === 'settings') {
      setDraftTheme(theme);
      setDraftAccent(accent);
      setDraftGithub(githubCfg);
      setDraftFolder(localFolder);
      const nextDraft = {} as Record<KeySlotId, SettingsKeyDraft>;
      for (const k of keyPool.getAll()) {
        nextDraft[k.id] = {
          apiKey: k.apiKey,
          selectedModel: k.selectedModel || DEFAULT_GEMINI_MODEL,
          availableModels: k.availableModels.length ? k.availableModels : [DEFAULT_GEMINI_MODEL]
        };
      }
      setDraftKeys(nextDraft);
    }
    setActiveTab(tab);
  };

  const handleSetPace = (nextPace: StudioPace) => {
    setPace(nextPace);
    orchestratorRef.current?.setPace(nextPace);
    showToast(`Studio speed set to ${nextPace.toUpperCase()}`);
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
        [id]: { ...cur, detecting: false, availableModels: nextModels, selectedModel: nextSelected }
      };
    });
    showToast(`${id}: ${res.detail}`);
  };

  const handleSaveSettings = () => {
    setTheme(draftTheme);
    setAccent(draftAccent);
    setGithubCfg(draftGithub);
    saveGitHubConfig(draftGithub);
    const savedFolder = setLocalSaveFolder(draftFolder);
    setLocalFolder(savedFolder);
    (Object.keys(draftKeys) as KeySlotId[]).forEach((id) => {
      const d = draftKeys[id];
      keyPool.setKeyConfig(id, d.apiKey, d.selectedModel, d.availableModels);
    });
    showToast('Settings & 5-Key Vault saved');
  };

  const handleExportBackup = async () => {
    const msg = await exportFullStateBackup({ profile, memories, projects, prompts });
    showToast(msg);
  };

  const restoreFromBackupFile = async (file: File) => {
    try {
      const text = await file.text();
      const backup = parseFullStateBackup(text);
      setProfile(backup.profile);
      saveProfile(backup.profile);
      setMemories(backup.memories);
      saveMemories(backup.memories);
      setProjects(backup.projects);
      saveProjects(backup.projects);
      for (const p of backup.projects) await idbPutProject(p);
      if (backup.projects[0]) {
        setActiveProjectId(backup.projects[0].id);
        saveActiveProjectId(backup.projects[0].id);
      }
      if (Array.isArray(backup.prompts)) {
        for (const p of backup.prompts) savePromptOverride(p.id, p.content, p.thinkingLevel);
        setPrompts(loadPrompts());
      }
      localStorage.setItem(ACCESS_MODE_KEY, 'local');
      setAccessMode('local');
      setStage('hub');
      showToast(`Restored ${backup.projects.length} project(s) & ${backup.memories.length} memories`);
    } catch (err) {
      showToast((err as Error).message);
    }
  };

  const handleForceCompleteOnboarding = () => {
    const completedProfile: UserProfile = {
      ...profile,
      onboarding_topics: { name_vibe: true, design_taste: true, tech_stack: true, autonomy: true },
      onboarding_complete: true
    };
    setProfile(completedProfile);
    saveProfile(completedProfile);
    void pushProfileToCloud(completedProfile);
    setStage('hub');
    showToast('Onboarding complete — welcome to Project Hub');
  };

  const handleLaunchBlueprint = async (md: string) => {
    if (!md.trim()) return;
    setBlueprintModalOpen(false);
    setChatOpen(false);
    setBlueprintDraft('');
    setStage('app');
    setActiveTab('home');
    setChatScope('project');
    showToast('Orchestrator running INTAKE...');
    try {
      const proj = await orchestratorRef.current!.intakeBlueprint(md, memories, targetPlatform);
      showToast(`Project "${proj.project_name}" ready`);
      const hasWorkerKey = keyPool.getAll().some((k) => k.role === 'worker' && k.apiKey);
      if (hasWorkerKey) {
        void orchestratorRef.current!.runLoop(proj);
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
    const nextHistory = [...messages, { id: `u_${Date.now()}`, role: 'user' as const, text, ts: nowTime }];
    setMessages(nextHistory);

    try {
      const res = await runCaliTurn({
        userMessage: text,
        history: nextHistory.map((m) => ({ role: m.role, text: m.text })),
        profile,
        memories,
        sharedMemories: brainCache.sharedMemories,
        clearance: brainCache.clearance,
        chatScope,
        currentPlanningGate: planningGate,
        activeProject: chatScope === 'project' ? activeProject : null,
        pendingDecisions: decisions
      });

      let nextMems = memories;
      const nextTopics = { ...profile.onboarding_topics };
      for (const tp of res.completed_topics) {
        if (tp in nextTopics) nextTopics[tp] = true;
      }

      const nextProfile: UserProfile = {
        ...profile,
        onboarding_topics: nextTopics,
        onboarding_complete:
          profile.onboarding_complete ||
          (nextTopics.name_vibe && nextTopics.design_taste && nextTopics.tech_stack && nextTopics.autonomy)
      };

      const answeredTurns = nextHistory.filter((m) => m.role === 'user').length;
      if (!nextProfile.onboarding_complete && answeredTurns >= 4) {
        nextProfile.onboarding_topics = { name_vibe: true, design_taste: true, tech_stack: true, autonomy: true };
        nextProfile.onboarding_complete = true;
      }

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
        }
      }

      setMemories(nextMems);
      setProfile(nextProfile);
      saveProfile(nextProfile);
      void pushProfileToCloud(nextProfile);
      for (const m of nextMems.slice(0, res.memory_ops.length)) {
        void pushPrivateMemoryToCloud(m);
      }
      if (res.shared_candidates?.length) {
        for (const sc of res.shared_candidates) {
          void submitSharedBrainCandidate(sc.topic, sc.category, sc.value);
        }
      }

      if (chatScope === 'planning' && res.planning_gate) {
        setPlanningGate(res.planning_gate);
      }
      const hasDraft = res.agency_command === 'DRAFT_BLUEPRINT' && Boolean(res.blueprint_markdown);

      setMessages((prev) => [
        ...prev,
        {
          id: `c_${Date.now()}`,
          role: 'cali',
          text: res.message,
          meta: nextProfile.onboarding_complete ? 'Cali / COO' : 'Cali / Onboarding',
          ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          blueprintDraft: hasDraft ? res.blueprint_markdown : undefined,
          canvasTitle: hasDraft ? 'Project Blueprint Draft.md' : undefined,
          canvasSubtitle: hasDraft ? 'Tap to inspect full blueprint in Canvas View' : undefined,
          canvasContent: hasDraft ? res.blueprint_markdown : undefined,
          actionBox: hasDraft
            ? {
                id: `act_bp_${Date.now()}`,
                kind: 'LAUNCH_BLUEPRINT',
                title: 'Approve & Launch Project Floor?',
                detail: 'Locks tech stack and dispatches Phase 1 tasks.',
                approveLabel: 'Approve & Launch Floor',
                declineLabel: 'Keep Refining',
                status: 'pending'
              }
            : undefined
        }
      ]);

      if (res.agency_command === 'PAUSE_LOOP') orchestratorRef.current?.pause();
      if (res.agency_command === 'RESUME_LOOP' && activeProject) void orchestratorRef.current?.runLoop(activeProject);
      if (res.agency_command === 'START_BLUEPRINT' && res.blueprint_markdown) {
        await handleLaunchBlueprint(res.blueprint_markdown);
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
    const sys = `You are Cali, COO of a 24-person AI software house. Active project: ${
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
        },
        onToolExecuted: (name, summary) => {
          setLiveToolLogs((prev) => [`${name}: ${summary}`, ...prev.slice(0, 5)]);
        },
        onToolCall: async (name, args) => {
          const snap = liveStateRef.current;
          if (name === 'get_agency_status') {
            return {
              summary: snap.activeProject
                ? `${snap.activeProject.project_name} Phase ${snap.activeProject.current_phase_id} (${snap.loopStatus})`
                : `No active project (${snap.loopStatus})`,
              project: snap.activeProject?.project_name || null,
              phase: snap.activeProject?.current_phase_id || 0,
              loop_status: snap.loopStatus,
              pending_decisions: snap.decisions.length
            };
          }
          if (name === 'get_agent_report') {
            const aid = String(args.agent_id || '');
            const m = snap.agentMetrics[aid];
            return { summary: m ? `${aid}: ${m.calls} calls` : `${aid}: idle`, metric: m || null };
          }
          if (name === 'control_loop') {
            const action = String(args.action || '').toLowerCase();
            if (action === 'pause') {
              orchestratorRef.current?.pause();
              return { ok: true, summary: 'Production paused' };
            }
            if (action === 'resume' && snap.activeProject) {
              void orchestratorRef.current?.runLoop(snap.activeProject);
              return { ok: true, summary: 'Production resumed' };
            }
            return { ok: false, summary: 'No active project' };
          }
          if (name === 'resolve_approval') {
            const top = snap.decisions[0];
            if (!top) return { ok: false, summary: 'No pending decisions' };
            handleApprovePendingDecision(top, Boolean(args.approved));
            return { ok: true, summary: Boolean(args.approved) ? 'Approved' : 'Declined' };
          }
          return { ok: false, summary: 'Unknown tool' };
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
    showToast('Routing runtime error to Debugger...');
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
      showToast('Debugger patched workspace');
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
      ag.speech = `Got ${lbl}`;
      ag.speechUntil = Date.now() + 3200;
    }
    pushActivity({ agentId: from, text: `Handed off ${lbl} -> ${to}`, kind: 'handoff' });
  };

  const latestReport = reports[0] || null;
  const activePhase = activeProject?.phases.find((p) => p.phase_id === activeProject.current_phase_id) || activeProject?.phases[0];
  const fileCount = activeProject ? Object.keys(activeProject.files).length : 0;
  const authBadge = brainCache.signedIn ? `${brainCache.clearance} / SYNCED` : 'LOCAL / OFFLINE';

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
        {/* STAGE 1: LOGIN / ACCESS GATE */}
        {stage === 'login' ? (
          <>
            <LoginGate
              onContinueGoogle={() => {
                localStorage.setItem(ACCESS_MODE_KEY, 'google');
                setAccessMode('google');
                setAuthModalOpen(true);
                setStage('hub');
              }}
              onContinueLocal={() => {
                localStorage.setItem(ACCESS_MODE_KEY, 'local');
                setAccessMode('local');
                setStage('hub');
                showToast('Offline Local Mode active');
              }}
              onRestoreBackupFile={(f) => void restoreFromBackupFile(f)}
              t={t}
            />
            <CaliSignInModal
              open={authModalOpen}
              onClose={() => setAuthModalOpen(false)}
              brain={brainCache}
              onSyncNow={handleSyncBrain}
              onToast={showToast}
              t={t}
            />
          </>
        ) : !profile.onboarding_complete ? (
          /* STAGE 1.5: FIRST-TIME CONVERSATIONAL ONBOARDING */
          <>
            <OnboardingGate
              profile={profile}
              messages={messages}
              busy={chatBusy}
              onSend={handleSendChat}
              onToast={showToast}
              onOpenSignIn={() => setAuthModalOpen(true)}
              onRestoreBackupFile={(f) => void restoreFromBackupFile(f)}
              onFinishOnboarding={handleForceCompleteOnboarding}
              t={t}
            />
            <CaliSignInModal
              open={authModalOpen}
              onClose={() => setAuthModalOpen(false)}
              brain={brainCache}
              onSyncNow={handleSyncBrain}
              onToast={showToast}
              t={t}
            />
          </>
        ) : stage === 'hub' ? (
          /* STAGE 2: PROJECT SELECTION HUB */
          <>
            <ProjectHub
              userName={profile.preferred_name}
              authBadge={authBadge}
              projects={projects}
              reports={reports}
              onSelectProject={(id) => {
                setActiveProjectId(id);
                saveActiveProjectId(id);
                setChatScope('project');
                setStage('app');
                setActiveTab('home');
              }}
              onNewProject={() => {
                setChatScope('planning');
                setPlanningGate(1);
                setStage('app');
                setActiveTab('home');
                setChatOpen(true);
                showToast('New Project Planning mode active');
              }}
              onOpenReports={() => {
                setStage('app');
                setActiveTab('reports');
              }}
              onGeneralChat={() => {
                setChatScope('general');
                setStage('app');
                setActiveTab('home');
                setChatOpen(true);
              }}
              onOpenSettings={() => {
                setStage('app');
                switchToTab('settings');
              }}
              t={t}
            />
            <CaliSignInModal
              open={authModalOpen}
              onClose={() => setAuthModalOpen(false)}
              brain={brainCache}
              onSyncNow={handleSyncBrain}
              onToast={showToast}
              t={t}
            />
          </>
        ) : (
          /* STAGE 3: SCOPED PROJECT APP */
          <>
            <div
              className={`pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[360px] h-[220px] rounded-full blur-3xl opacity-20 transition-colors duration-500 ${t.glow}`}
            />

            {/* TOP HEADER (Home view) */}
            {activeTab === 'home' && (
              <header className="absolute top-0 inset-x-0 z-10 px-4 pt-4 pb-3 flex items-center justify-between gap-2 bg-transparent backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setStage('hub')}
                  className={`flex items-center gap-2 min-w-0 px-3 py-1.5 rounded-full border cursor-pointer ${t.surface}`}
                  title="Switch Project"
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${t.dot}`} />
                  <span className="text-xs font-semibold truncate">
                    {activeProject ? activeProject.project_name : 'Project Hub'}
                  </span>
                  <svg className="w-3 h-3 opacity-55 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => switchToTab('telemetry')}
                    className={`px-2.5 py-1.5 rounded-full text-[10px] font-mono font-semibold border cursor-pointer ${t.subtleBadge}`}
                  >
                    5 Keys
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme(theme === 'monolith' ? 'light' : 'monolith')}
                    className={`px-2.5 py-1.5 rounded-full text-[10px] font-semibold border cursor-pointer ${t.secondaryBtn}`}
                  >
                    {theme === 'monolith' ? 'Light' : 'Dark'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setChangelogOpen(true)}
                    className={`px-2.5 py-1.5 rounded-full text-[10px] font-mono border cursor-pointer ${t.subtleBadge}`}
                  >
                    {APP_VERSION_TAG}
                  </button>
                </div>
              </header>
            )}

            {/* HOME DASHBOARD */}
            {activeTab === 'home' && (
              <div className="relative z-10 flex-1 overflow-y-auto px-4 pt-20 pb-36 space-y-4">
                <section className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-mono uppercase tracking-wider text-accent font-semibold">
                        {activeProject ? `Phase ${activeProject.current_phase_id} / ${loopStatus}` : 'Ready'}
                      </div>
                      <h2 className="text-xl font-bold tracking-tight mt-0.5">Cali's Executive Pulse</h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setVoiceOpen(true)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border cursor-pointer ${t.secondaryBtn}`}
                    >
                      Voice Live
                    </button>
                  </div>
                  <p className="text-xs opacity-75 leading-relaxed">
                    {activeProject
                      ? `Tracking ${activeProject.project_name} (${fileCount} files synced to Documents/${localFolder}/).`
                      : 'Open a project from the Project Hub or tap Chat Cali below to plan a new build.'}
                  </p>
                </section>

                {/* Telemetry Strip */}
                <button
                  type="button"
                  onClick={() => switchToTab('telemetry')}
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

                {/* Easy-Access Latest Accomplishment Report Card */}
                {latestReport ? (
                  <button
                    type="button"
                    onClick={() => openReportInCanvas(latestReport)}
                    className={`w-full rounded-3xl border border-l-4 border-l-[#8B5CF6] p-4 text-left space-y-2 cursor-pointer ${t.surface}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-semibold border ${t.subtleBadge}`}>
                        {latestReport.badge}
                      </span>
                      <span className="text-[10px] font-mono opacity-55">
                        {new Date(latestReport.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="text-sm font-bold leading-snug">{latestReport.title}</div>
                    <p className="text-xs opacity-70 line-clamp-2">{latestReport.summary}</p>
                    <div className="text-xs font-semibold text-accent pt-0.5">Read Full Editorial Report</div>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => createPeriodicSitrep(true)}
                    className={`w-full rounded-3xl border p-4 text-left flex items-center justify-between gap-3 cursor-pointer ${t.surface}`}
                  >
                    <div>
                      <div className="text-xs font-semibold">Generate Cali Executive Sitrep</div>
                      <div className="text-[11px] opacity-65">Instant editorial progress report saved to Reports Hub</div>
                    </div>
                    <span className={`px-3 py-1.5 rounded-full text-[11px] font-semibold ${t.primaryBtn}`}>Generate</span>
                  </button>
                )}

                {/* Company Culture Strip: Suggestions, Coaching Pods & 24-Person Org */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSuggestionsOpen(true)}
                    className={`relative rounded-2xl border p-3 text-left space-y-1 cursor-pointer ${t.surface}`}
                  >
                    {suggestions.some((s) => s.status === 'escalated') && (
                      <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-[#FFB732]" />
                    )}
                    <div className="text-[10px] font-mono uppercase text-accent font-semibold">Board</div>
                    <div className="text-xs font-bold">Suggestions</div>
                    <div className="text-[10px] opacity-60">
                      {suggestions.filter((s) => s.status === 'escalated').length} Escalated
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCoachingOpen(true)}
                    className={`rounded-2xl border p-3 text-left space-y-1 cursor-pointer ${t.surface}`}
                  >
                    <div className="text-[10px] font-mono uppercase text-accent font-semibold">Pods</div>
                    <div className="text-xs font-bold">Coaching</div>
                    <div className="text-[10px] opacity-60">{coachingLogs.length} Sessions</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOrgChartOpen(true)}
                    className={`rounded-2xl border p-3 text-left space-y-1 cursor-pointer ${t.surface}`}
                  >
                    <div className="text-[10px] font-mono uppercase text-accent font-semibold">4 Tiers</div>
                    <div className="text-xs font-bold">24 Staff Org</div>
                    <div className="text-[10px] opacity-60">View Chart</div>
                  </button>
                </div>

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

                {/* Studio Floor + Studio Pacing Controls */}
                <section className={`rounded-3xl border p-4 space-y-3 ${t.surface}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-widest opacity-55">Agency Floor</div>
                      <div className="text-sm font-semibold">3D &amp; 16-Bit Studio + Pacing</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => switchToTab('office')}
                      className={`px-3.5 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer ${t.primaryBtn}`}
                    >
                      Enter 3D Office
                    </button>
                  </div>
                  <MiniOfficePreview agentsRef={agentsRef} packetsRef={packetsRef} onOpenFull={() => switchToTab('office')} />
                  <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                    {(['studio', 'brisk', 'turbo'] as StudioPace[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => handleSetPace(p)}
                        className={`py-1.5 rounded-xl font-semibold capitalize border cursor-pointer ${pace === p ? t.primaryBtn : t.secondaryBtn}`}
                      >
                        {p === 'studio' ? 'Studio Pace' : p}
                      </button>
                    ))}
                  </div>
                </section>

                {/* Active Project Production Controls */}
                <section className={`rounded-3xl border p-4 space-y-3 ${t.surface}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] font-semibold uppercase tracking-widest opacity-55">
                      Production Control
                    </div>
                    <button
                      type="button"
                      onClick={() => setBlueprintModalOpen(true)}
                      className={`px-3 py-1 rounded-full text-[11px] font-semibold cursor-pointer ${t.primaryBtn}`}
                    >
                      + Import .md
                    </button>
                  </div>
                  {activeProject ? (
                    <div className="flex items-center gap-2">
                      {loopStatus === 'RUNNING' ? (
                        <button
                          type="button"
                          onClick={() => orchestratorRef.current?.pause()}
                          className={`flex-1 py-2.5 rounded-full text-xs font-semibold border cursor-pointer ${t.secondaryBtn}`}
                        >
                          Pause Production
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void orchestratorRef.current?.runLoop(activeProject)}
                          className={`flex-1 py-2.5 rounded-full text-xs font-semibold cursor-pointer ${t.primaryBtn}`}
                        >
                          Start / Resume Phase {activeProject.current_phase_id}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => switchToTab('workspace')}
                        className={`px-4 py-2.5 rounded-full text-xs font-medium border cursor-pointer ${t.secondaryBtn}`}
                      >
                        Files ({fileCount})
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs opacity-65">No active project. Tap + Import .md or switch via Project Hub.</p>
                  )}
                </section>

                {/* 4-Tab Activity Hub */}
                <section className={`rounded-3xl border p-4 space-y-3 ${t.surface}`}>
                  <div className={`grid grid-cols-4 gap-1 p-1 rounded-2xl ${t.tabWrap}`}>
                    {([['feed', 'Feed'], ['agents', 'Agents'], ['checklist', 'Checklist'], ['watchdog', 'Watchdog']] as const).map(([id, lbl]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setHubTab(id)}
                        className={`py-1.5 rounded-xl text-[11px] font-medium cursor-pointer ${hubTab === id ? t.tabActive : t.tabIdle}`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>

                  {hubTab === 'feed' && (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {activity.length === 0 ? (
                        <p className="text-xs opacity-60 py-3 text-center">No agent activity yet.</p>
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
                        <p className="text-xs opacity-60 py-3 text-center">No active phase checklist.</p>
                      ) : (
                        activePhase.checklist.map((c) => (
                          <div key={c.id} className="flex items-center gap-2.5 text-xs py-1">
                            <span className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] ${c.verified ? t.primaryBtn : 'border-current/30'}`}>
                              {c.verified ? 'OK' : ''}
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
              </div>
            )}

            {/* PRIMARY VIEWS (No Close Icons — Switch via Persistent Centered Dock) */}
            <OfficeDrawer
              open={activeTab === 'office'}
              t={t}
              keys={keys}
              telemetry={telemetry}
              agentMetrics={agentMetrics}
              agentsRef={agentsRef}
              packetsRef={packetsRef}
              onTriggerDemoHandoff={triggerRandomHandoff}
              onOpenTelemetry={() => switchToTab('telemetry')}
            />

            <WorkspaceDrawer
              open={activeTab === 'workspace'}
              t={t}
              project={activeProject}
              reports={reports}
              githubConfig={githubCfg}
              onSendErrorToDebugger={handleSendPreviewErrorToDebugger}
              onRollbackSnapshot={handleRollbackSnapshot}
              onAddGeneratedAssets={handleAddGeneratedAssets}
              onDeleteProject={handleDeleteProject}
              onOpenCanvas={setCanvasDoc}
              onOpenFolderPicker={() => switchToTab('settings')}
              onRequestConfirm={setConfirmState}
              onToast={showToast}
            />

            <ReportsDrawer
              open={activeTab === 'reports'}
              reports={reports}
              activeProject={activeProject}
              onOpenReport={openReportInCanvas}
              onGenerateSitrep={() => createPeriodicSitrep(true)}
              onToast={showToast}
              t={t}
            />

            <PromptStudioDrawer
              open={activeTab === 'prompts'}
              t={t}
              prompts={prompts}
              onPromptsChange={setPrompts}
              onRequestConfirm={setConfirmState}
              onToast={showToast}
            />

            <TelemetryDrawer
              open={activeTab === 'telemetry'}
              t={t}
              keys={keys}
              telemetry={telemetry}
              onToast={showToast}
            />

            {/* Memory View */}
            {activeTab === 'memory' && (
              <div className={`absolute inset-0 z-20 flex flex-col backdrop-blur-2xl p-5 ${t.overlay}`}>
                <div className="pb-4 border-b border-current/10 shrink-0">
                  <h3 className="text-lg font-semibold leading-none">What Cali Remembers</h3>
                  <p className="text-[11px] opacity-60 mt-1">Layer 2 Private Vault + Layer 1 Shared Brain ({brainCache.clearance})</p>
                </div>
                <div className="flex-1 overflow-y-auto py-4 pb-28 space-y-2.5">
                  {brainCache.clearance === 'BOSS' && brainCache.pendingShared.length > 0 && (
                    <div className={`rounded-2xl border p-3.5 space-y-2.5 ${t.accentCard}`}>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-accent">
                        BOSS Queue / Pending Shared Brain ({brainCache.pendingShared.length})
                      </div>
                      {brainCache.pendingShared.map((item) => (
                        <div key={item.id} className="rounded-xl bg-black/20 p-2.5 space-y-2">
                          <div className="text-[11px] font-semibold">{item.topic}</div>
                          <p className="text-xs opacity-85">{item.value}</p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                const r = await reviewSharedBrainCandidate(item.id, 'approved');
                                showToast(r.detail);
                                await handleSyncBrain();
                              }}
                              className={`flex-1 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer ${t.primaryBtn}`}
                            >
                              Approve to Shared
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                const r = await reviewSharedBrainCandidate(item.id, 'rejected');
                                showToast(r.detail);
                                await handleSyncBrain();
                              }}
                              className={`px-3 py-1.5 rounded-full text-[11px] border cursor-pointer ${t.secondaryBtn}`}
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

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

            {/* Settings View (Original Monolith Dark/Light Only + Local Folder + 5-Key Vault) */}
            {activeTab === 'settings' && (
              <div className={`absolute inset-0 z-20 flex flex-col backdrop-blur-2xl p-5 ${t.overlay}`}>
                <div className="pb-3.5 border-b border-current/10 shrink-0">
                  <h3 className="text-lg font-semibold leading-none">Settings &amp; 5-Key Vault</h3>
                  <p className="text-[11px] opacity-60 mt-1">Changes apply when you tap Save Settings</p>
                </div>

                <div className="flex-1 overflow-y-auto py-4 pb-32 space-y-4">
                  {/* 0. Cloud Sign-In & Access Gate */}
                  <div className={`rounded-3xl border p-4 space-y-2.5 ${t.accentCard}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[10px] font-mono uppercase tracking-widest text-accent">3-Layer JARVIS Brain</div>
                        <div className="text-sm font-semibold">
                          {brainCache.signedIn ? brainCache.email : accessMode === 'local' ? 'Offline Local Mode' : 'Not Signed In'}
                        </div>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${t.subtleBadge}`}>
                        {brainCache.signedIn ? brainCache.clearance : 'LOCAL'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setAuthModalOpen(true)}
                        className={`py-2.5 rounded-full text-xs font-semibold cursor-pointer ${t.primaryBtn}`}
                      >
                        Cloud Account
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          localStorage.removeItem(ACCESS_MODE_KEY);
                          setStage('login');
                        }}
                        className={`py-2.5 rounded-full text-xs font-medium border cursor-pointer ${t.secondaryBtn}`}
                      >
                        Login Screen
                      </button>
                    </div>
                  </div>

                  {/* 1. Original Monolith Appearance (Dark Default + Light Toggle Only) */}
                  <div className={`rounded-3xl border p-4 space-y-3 ${t.surface}`}>
                    <div className="text-[11px] font-semibold uppercase tracking-widest opacity-55">
                      1. Appearance (Original Monolith)
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setDraftTheme('monolith')}
                        className={`py-2.5 rounded-2xl text-xs font-semibold border cursor-pointer ${draftTheme === 'monolith' ? t.primaryBtn : t.secondaryBtn}`}
                      >
                        Dark Mode (Default)
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraftTheme('light')}
                        className={`py-2.5 rounded-2xl text-xs font-semibold border cursor-pointer ${draftTheme === 'light' ? t.primaryBtn : t.secondaryBtn}`}
                      >
                        Light Mode
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(Object.keys(TEXT_ACCENTS) as AccentId[]).map((ac) => (
                        <button
                          key={ac}
                          type="button"
                          onClick={() => setDraftAccent(ac)}
                          className={`py-1.5 rounded-2xl text-[11px] font-medium border cursor-pointer ${draftAccent === ac ? t.primaryBtn : t.secondaryBtn}`}
                        >
                          {TEXT_ACCENTS[ac].label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 2. Local Save Directory & Sitrep Interval */}
                  <div className={`rounded-3xl border p-4 space-y-2.5 ${t.surface}`}>
                    <div className="text-[11px] font-semibold uppercase tracking-widest opacity-55">
                      2. Local Android Folder &amp; Cali Sitreps
                    </div>
                    <div className="text-[11px] opacity-65">Files &amp; reports write live to Documents/&lt;folder&gt;/&lt;project&gt;/</div>
                    <input
                      value={draftFolder}
                      onChange={(e) => setDraftFolder(e.target.value)}
                      placeholder="CaliAgency"
                      className={`w-full px-3.5 py-2 rounded-2xl text-xs font-mono border focus:outline-none ${t.input}`}
                    />
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs opacity-75">Periodic Sitrep Interval</span>
                      <div className="flex gap-1">
                        {[10, 15, 30].map((mins) => (
                          <button
                            key={mins}
                            type="button"
                            onClick={() => setSitrepMinutes(mins)}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-mono border cursor-pointer ${sitrepMinutes === mins ? t.primaryBtn : t.secondaryBtn}`}
                          >
                            {mins}m
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 3. 5 Gemini API Keys */}
                  <div className={`rounded-3xl border p-4 space-y-3.5 ${t.surface}`}>
                    <div className="text-[11px] font-semibold uppercase tracking-widest opacity-55">
                      3. 5 Gemini API Keys (AQ.xxxx &amp; AIza Ready)
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
                              onClick={() => void handleDetectModelsForDraftKey(id)}
                              className="text-[10px] font-semibold text-accent hover:underline cursor-pointer disabled:opacity-45"
                            >
                              {d.detecting ? 'Detecting...' : 'Detect Models'}
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
                          <button
                            type="button"
                            onClick={() => setModelPickerKeyId(id)}
                            className={`w-full px-3.5 py-2 rounded-xl text-[11px] font-mono border flex items-center justify-between cursor-pointer ${t.secondaryBtn}`}
                          >
                            <span className="truncate">{d.selectedModel}</span>
                            <span className="text-[10px] opacity-60 shrink-0 ml-2">Select ({d.availableModels.length})</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* 4. Optional GitHub Ship PAT */}
                  <div className={`rounded-3xl border p-4 space-y-2.5 ${t.surface}`}>
                    <div className="text-[11px] font-semibold uppercase tracking-widest opacity-55">4. 1-Tap Ship to GitHub</div>
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

                  <button
                    type="button"
                    onClick={handleSaveSettings}
                    className={`w-full py-3 rounded-full text-xs font-semibold shadow-lg cursor-pointer ${t.primaryBtn}`}
                  >
                    Save Settings
                  </button>

                  {/* 5. Backup & Restore */}
                  <div className={`rounded-3xl border p-4 space-y-2.5 ${t.surface}`}>
                    <div className="text-[11px] font-semibold uppercase tracking-widest opacity-55">5. Local Backup &amp; Restore</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => void handleExportBackup()}
                        className={`py-2.5 rounded-full text-xs font-medium border cursor-pointer ${t.secondaryBtn}`}
                      >
                        Save Backup
                      </button>
                      <button
                        type="button"
                        onClick={() => backupInputRef.current?.click()}
                        className={`py-2.5 rounded-full text-xs font-medium border cursor-pointer ${t.secondaryBtn}`}
                      >
                        Restore Backup
                      </button>
                      <input
                        ref={backupInputRef}
                        type="file"
                        accept="application/json,.json"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void restoreFromBackupFile(f);
                          e.target.value = '';
                        }}
                        className="hidden"
                      />
                    </div>
                  </div>

                  {/* Danger Zone */}
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
                              switchToTab('settings');
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
                            message: 'Cali will forget your saved preferences and return to Onboarding.',
                            confirmLabel: 'Reset Cali Memory',
                            onConfirm: () => {
                              saveMemories([]);
                              setMemories([]);
                              const fresh = createFreshProfile();
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

            {/* REACHABLE FLOATING CHAT CALI FAB */}
            {!chatOpen && (
              <button
                type="button"
                onClick={() => setChatOpen(true)}
                className={`absolute bottom-20 right-3.5 z-30 px-3.5 py-2.5 rounded-full shadow-xl flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${t.primaryBtn}`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
                <span>Chat Cali</span>
              </button>
            )}

            {/* ALWAYS-VISIBLE ENLARGED FLOATING BOTTOM DOCK (HOME CENTERED) */}
            <nav
              aria-label="Primary navigation"
              className="absolute bottom-3.5 inset-x-2.5 z-30 flex items-center justify-center pointer-events-none"
            >
              <div className={`pointer-events-auto flex items-center justify-between gap-1 px-2.5 py-2 rounded-full border backdrop-blur-2xl w-full max-w-md ${t.dockBg}`}>
                {(
                  [
                    ['office', 'Office', <><rect key="o1" x="3" y="4" width="18" height="14" rx="2" /><line key="o2" x1="8" y1="21" x2="16" y2="21" /><line key="o3" x1="12" y1="18" x2="12" y2="21" /></>],
                    ['workspace', 'Files', <path key="w" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />],
                    ['reports', 'Reports', <><path key="r1" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline key="r2" points="14 2 14 8 20 8" /><line key="r3" x1="16" y1="13" x2="8" y2="13" /><line key="r4" x1="16" y1="17" x2="8" y2="17" /></>],
                    ['home', 'Home', <path key="h" d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9.5z" />],
                    ['prompts', 'Prompts', <><polyline key="p1" points="16 18 22 12 16 6" /><polyline key="p2" points="8 6 2 12 8 18" /></>],
                    ['memory', 'Memory', <><path key="m1" d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z" /><path key="m2" d="M9 22h6" /></>],
                    ['settings', 'Settings', <><line key="s1" x1="4" y1="21" x2="4" y2="14" /><line key="s2" x1="4" y1="10" x2="4" y2="3" /><line key="s3" x1="12" y1="21" x2="12" y2="12" /><line key="s4" x1="12" y1="8" x2="12" y2="3" /><line key="s5" x1="20" y1="21" x2="20" y2="16" /><line key="s6" x1="20" y1="12" x2="20" y2="3" /></>]
                  ] as Array<[TabId, string, React.ReactNode]>
                ).map(([id, label, icon]) => {
                  const isHome = id === 'home';
                  const isActive = activeTab === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      title={label}
                      aria-label={label}
                      onClick={() => switchToTab(id)}
                      className={`relative flex items-center justify-center rounded-full transition cursor-pointer ${
                        isHome
                          ? `w-12 h-12 shadow-lg border ${isActive ? t.fabCore : t.secondaryBtn}`
                          : `w-11 h-11 ${isActive ? t.iconBtnActive : t.iconBtn}`
                      }`}
                    >
                      {id === 'reports' && reports.length > 0 && (
                        <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[#FFB732]" />
                      )}
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
                        {icon}
                      </svg>
                    </button>
                  );
                })}
              </div>
            </nav>

            {/* CHAT SHEET (Tap-to-View Canvas Cards + Grey-Out Action CTAs) */}
            {chatOpen && (
              <div className={`absolute inset-0 z-40 flex flex-col backdrop-blur-2xl ${t.overlay}`}>
                <div className="px-5 py-4 border-b border-current/10 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold leading-none">Cali (COO)</h3>
                    <p className="text-[11px] opacity-55 mt-1 truncate">
                      {chatScope === 'planning'
                        ? 'New Project Planning Mode'
                        : chatScope === 'general'
                        ? 'General Chat (No Project Lock)'
                        : activeProject
                        ? `Scoped to ${activeProject.project_name}`
                        : 'Executive Project Director'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setChatOpen(false);
                        setVoiceOpen(true);
                      }}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-medium border cursor-pointer ${t.secondaryBtn}`}
                    >
                      Voice Chat
                    </button>
                    <button
                      type="button"
                      onClick={() => setChatOpen(false)}
                      className="p-2 rounded-full border border-current/15 cursor-pointer"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>

                {chatScope === 'planning' && (
                  <div className="px-5 py-2.5 border-b border-current/10 grid grid-cols-4 gap-1.5 shrink-0">
                    {(
                      [
                        [1, '1. Vision'],
                        [2, '2. MVP'],
                        [3, '3. Stack'],
                        [4, '4. Blueprint']
                      ] as const
                    ).map(([g, label]) => (
                      <div key={g} className="space-y-1">
                        <div className={`h-1.5 rounded-full ${planningGate >= g ? t.dot : 'bg-current/15'}`} />
                        <div className={`text-[9px] font-mono truncate ${planningGate >= g ? 'text-accent font-semibold' : 'opacity-50'}`}>
                          {label}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                  {messages.map((m) => (
                    <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} space-y-2`}>
                      <div className={`max-w-[88%] rounded-3xl border px-4 py-3 text-[13px] leading-relaxed ${m.role === 'user' ? t.userBubble : t.caliBubble}`}>
                        {m.text}
                      </div>

                      {/* Tap-to-View Full-Screen Canvas Card (Reports / Blueprints / Scripts) */}
                      {m.canvasContent && m.canvasTitle && (
                        <button
                          type="button"
                          onClick={() =>
                            setCanvasDoc({
                              category: m.reportId ? 'ACCOMPLISHMENT REPORT' : 'BLUEPRINT CANVAS',
                              title: m.canvasTitle!,
                              subtitle: m.canvasSubtitle,
                              content: m.canvasContent!,
                              mode: 'editorial'
                            })
                          }
                          className={`w-full max-w-[92%] rounded-2xl border border-l-4 border-l-[#8B5CF6] p-3.5 text-left flex items-center justify-between gap-3 cursor-pointer ${t.surface}`}
                        >
                          <div className="min-w-0">
                            <div className="text-[10px] font-mono uppercase text-accent font-semibold">
                              Tap to View Full Canvas
                            </div>
                            <div className="text-xs font-bold truncate mt-0.5">{m.canvasTitle}</div>
                            {m.canvasSubtitle && <div className="text-[11px] opacity-65 truncate">{m.canvasSubtitle}</div>}
                          </div>
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold shrink-0 ${t.accentCard}`}>
                            Open
                          </span>
                        </button>
                      )}

                      {/* Grey-Out Action Box (Locks permanently once Approved or Declined) */}
                      {m.actionBox && (
                        <div
                          className={`w-full max-w-[92%] rounded-2xl border p-3.5 space-y-2.5 transition-all ${t.surface} ${
                            m.actionBox.status !== 'pending' ? 'opacity-55 pointer-events-none' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono uppercase font-semibold text-accent">
                              {m.actionBox.kind.replace('_', ' ')}
                            </span>
                            <span className="text-[10px] font-mono uppercase opacity-65">{m.actionBox.status}</span>
                          </div>
                          <div className="text-xs font-semibold">{m.actionBox.title}</div>
                          <div className="text-[11px] opacity-70">{m.actionBox.detail}</div>
                          {m.actionBox.status === 'pending' ? (
                            <div className="flex gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => handleResolveChatAction(m.id, 'approved')}
                                className={`flex-1 py-2 rounded-full text-xs font-semibold cursor-pointer ${t.primaryBtn}`}
                              >
                                {m.actionBox.approveLabel}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleResolveChatAction(m.id, 'declined')}
                                className={`px-4 py-2 rounded-full text-xs border cursor-pointer ${t.secondaryBtn}`}
                              >
                                {m.actionBox.declineLabel}
                              </button>
                            </div>
                          ) : (
                            <div className="w-full py-2 rounded-full bg-current/10 text-center text-[11px] font-mono">
                              {m.actionBox.resolvedLabel || m.actionBox.status.toUpperCase()}
                            </div>
                          )}
                        </div>
                      )}

                      {m.meta && <span className="text-[10px] opacity-45 px-2">{m.meta}</span>}
                    </div>
                  ))}
                  {chatBusy && (
                    <div className={`self-start rounded-3xl border px-4 py-2.5 text-xs opacity-75 ${t.caliBubble}`}>
                      Cali is thinking...
                    </div>
                  )}
                  <div ref={chatBottomRef} />
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSendChat(chatInput);
                  }}
                  className="px-4 py-3.5 border-t border-current/10 flex items-center gap-2"
                >
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={chatScope === 'planning' ? 'Describe your new app idea to Cali...' : 'Message Cali...'}
                    className={`flex-1 px-4 py-2.5 rounded-full text-xs sm:text-sm border focus:outline-none ${t.input}`}
                  />
                  <button
                    type="submit"
                    disabled={chatBusy}
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 cursor-pointer ${t.primaryBtn}`}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="19" x2="12" y2="5" />
                      <polyline points="5 12 12 5 19 12" />
                    </svg>
                  </button>
                </form>
              </div>
            )}

            {/* GEMINI LIVE VOICE OVERLAY */}
            {voiceOpen && (
              <div className={`absolute inset-0 z-40 flex flex-col items-center justify-between p-6 backdrop-blur-2xl text-center ${t.overlay}`}>
                <div className="w-full flex items-center justify-between">
                  <span className="text-xs font-medium tracking-wider uppercase opacity-60">Gemini Live / KEY_CALI</span>
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
                  <button
                    type="button"
                    onClick={toggleLiveMute}
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
                      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                      </svg>
                    </div>
                  </button>

                  <div className="space-y-1.5 max-w-xs">
                    <h3 className="text-lg font-semibold">
                      {liveMuted ? 'Mic Muted — Tap to Speak' : liveStatus === 'connected' || liveStatus === 'speaking' ? 'Mic Open — Listening' : 'Voice Briefing'}
                    </h3>
                    <p className="text-xs opacity-65">{liveDetail}</p>
                  </div>

                  {liveToolLogs.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-1.5 max-w-sm">
                      {liveToolLogs.map((log, i) => (
                        <span key={i} className={`px-2.5 py-1 rounded-full text-[10px] font-mono border ${t.accentCard}`}>
                          {log}
                        </span>
                      ))}
                    </div>
                  )}

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
                    onClick={() => void toggleLiveVoice()}
                    className={`flex-1 py-3 rounded-full text-xs font-semibold cursor-pointer ${t.primaryBtn}`}
                  >
                    {liveStatus === 'connected' || liveStatus === 'speaking' ? 'End Call' : 'Connect Live'}
                  </button>
                </div>
              </div>
            )}

            {/* PENDING DECISIONS MODAL */}
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
                            onClick={() => handleApprovePendingDecision(d, true)}
                            className={`flex-1 py-2 rounded-full text-xs font-semibold cursor-pointer ${t.primaryBtn}`}
                          >
                            {d.approveLabel}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApprovePendingDecision(d, false)}
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

            {/* BLUEPRINT IMPORTER MODAL */}
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
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['pwa', 'apk'] as ProjectTarget[]).map((tg) => (
                      <button
                        key={tg}
                        type="button"
                        onClick={() => setTargetPlatform(tg)}
                        className={`py-2 rounded-xl text-xs font-semibold uppercase border cursor-pointer ${targetPlatform === tg ? t.primaryBtn : t.secondaryBtn}`}
                      >
                        Target: {tg}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={8}
                    value={blueprintDraft}
                    onChange={(e) => setBlueprintDraft(e.target.value)}
                    placeholder="# Project Blueprint: My App..."
                    className={`w-full rounded-2xl border p-3 text-xs font-mono focus:outline-none ${t.input}`}
                  />
                  <button
                    type="button"
                    onClick={() => void handleLaunchBlueprint(blueprintDraft)}
                    className={`w-full py-2.5 rounded-full text-xs font-semibold cursor-pointer ${t.primaryBtn}`}
                  >
                    Run Master Orchestrator INTAKE
                  </button>
                </div>
              </div>
            )}

            {/* GLOBAL OVERLAYS */}
            <ChangelogDrawer open={changelogOpen} onClose={() => setChangelogOpen(false)} t={t} />
            <ArtifactCanvasModal doc={canvasDoc} onClose={() => setCanvasDoc(null)} onToast={showToast} t={t} />
            <CaliSignInModal
              open={authModalOpen}
              onClose={() => setAuthModalOpen(false)}
              brain={brainCache}
              onSyncNow={handleSyncBrain}
              onToast={showToast}
              t={t}
            />
            <ModelPickerModal
              open={modelPickerKeyId !== null}
              keyId={modelPickerKeyId}
              models={modelPickerKeyId ? draftKeys[modelPickerKeyId].availableModels : []}
              selectedModel={modelPickerKeyId ? draftKeys[modelPickerKeyId].selectedModel : DEFAULT_GEMINI_MODEL}
              onSelect={(m) => {
                if (!modelPickerKeyId) return;
                setDraftKeys((prev) => ({
                  ...prev,
                  [modelPickerKeyId]: { ...prev[modelPickerKeyId], selectedModel: m }
                }));
              }}
              onClose={() => setModelPickerKeyId(null)}
              t={t}
            />
            <SuggestionBoardModal
              open={suggestionsOpen}
              suggestions={suggestions}
              onResolve={(id, decision) => {
                setSuggestions((prev) => {
                  const next = prev.map((s) => (s.id === id ? { ...s, status: decision } : s));
                  saveSuggestions(next);
                  return next;
                });
                showToast(decision === 'approved' ? 'Suggestion approved & queued' : 'Suggestion deferred');
              }}
              onSimulateNew={(title, rationale, impact) => {
                const sug = createEscalatedSuggestion({
                  projectId: activeProject?.id || null,
                  specialistId: 'frontend-developer',
                  title,
                  rationale,
                  impact
                });
                setSuggestions((prev) => {
                  const next = [sug, ...prev];
                  saveSuggestions(next);
                  return next;
                });
                showToast('Pinned & escalated to Cali (COO)');
              }}
              onClose={() => setSuggestionsOpen(false)}
              t={t}
            />
            <CoachingLogsModal
              open={coachingOpen}
              sessions={coachingLogs}
              onTriggerDemoCoaching={() => {
                const { session, report } = createCoachingRecord({
                  kind: 'one_on_one',
                  projectId: activeProject?.id || null,
                  projectName: activeProject?.project_name || 'Cali Studio',
                  specialistId: 'mobile-pwa-builder',
                  taskId: 'P1-T2',
                  triggerReason: 'Static Pre-Check flagged a trailing comma in manifest.webmanifest.',
                  takeaway: 'Validated strict JSON formatting and verified offline icon paths before retry.'
                });
                setCoachingLogs((prev) => {
                  const next = [session, ...prev];
                  saveCoachingSessions(next);
                  return next;
                });
                saveReportRecord(report);
                showToast('1-on-1 Coaching Pod logged & saved to Reports');
              }}
              onClose={() => setCoachingOpen(false)}
              t={t}
            />
            <OrgChartModal open={orgChartOpen} onClose={() => setOrgChartOpen(false)} t={t} />
            <ConfirmModal state={confirmState} onCancel={() => setConfirmState(null)} t={t} />
          </>
        )}
      </div>
    </div>
  );
}
