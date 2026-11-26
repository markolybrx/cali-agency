import type {
  ActivityEvent,
  ProjectTarget,
  AgencyTask,
  KeySlotId,
  MemoryItem,
  PendingDecision,
  ProjectState,
  WorkerAgentId
} from '../types/agency';
import { assembleWorkerSystemPrompt, getPromptByRole } from '../prompts/agencyPrompts';
import { callGeminiJson } from './geminiClient';
import { keyPool } from './keyPool';
import { runStaticPreCheck } from './staticPreCheck';
import { buildCompactProjectContext } from './contextCompactor';
import { acquireScreenWakeLock, releaseScreenWakeLock, sendAgencyNotification } from './deviceRuntime';
import { generateAndroidApkScaffold, getProjectLocalPath } from './localSave';

export interface LoopHooks {
  onProjectUpdate: (project: ProjectState) => void;
  onActivity: (event: Omit<ActivityEvent, 'id' | 'ts'>) => void;
  onHandoff: (from: WorkerAgentId | 'cali', to: WorkerAgentId | 'cali', label: string) => void;
  onAgentVisual: (agentId: WorkerAgentId | 'cali', state: 'IDLE' | 'THINKING' | 'CODING' | 'REVIEWING' | 'BLOCKED' | 'TALKING', speech?: string) => void;
  onAgentMetric: (agentId: WorkerAgentId | 'cali', latencyMs: number, tokens: number, taskLabel: string, isRetry?: boolean) => void;
  onPendingDecision: (decision: Omit<PendingDecision, 'id' | 'createdAt'>) => void;
  onLoopStatus: (status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'WATCHDOG' | 'DEMO') => void;
}

interface WorkerResponse {
  agent_id: string;
  task_id: string;
  status: 'COMPLETED' | 'NEEDS_REVISION' | 'BLOCKED';
  summary: string;
  files: Array<{ path: string; action: 'CREATE' | 'UPDATE' | 'DELETE'; content?: string }>;
  verification_commands?: string[];
  handoff_notes?: string[];
  blockers?: string[];
}

export class AgencyOrchestratorLoop {
  private running = false;
  private paused = false;
  private hooks: LoopHooks;

  constructor(hooks: LoopHooks) {
    this.hooks = hooks;
  }

  public isRunning(): boolean {
    return this.running;
  }

  public pause(): void {
    this.paused = true;
    this.running = false;
    void releaseScreenWakeLock();
    this.hooks.onLoopStatus('PAUSED');
    this.hooks.onActivity({ agentId: 'cali', text: 'Agency floor paused.', kind: 'warn' });
  }

  public async intakeBlueprint(blueprintMd: string, memories: MemoryItem[], targetPlatform: ProjectTarget = 'PWA'): Promise<ProjectState> {
    const slot = keyPool.acquireWorkerKey('master-orchestrator');
    const now = new Date().toISOString();

    if (!slot) {
      const titleMatch = blueprintMd.match(/^#\s+Project Blueprint:\s*(.+)$/m);
      const name = titleMatch ? titleMatch[1].trim() : 'New Agency PWA';
      const fallback: ProjectState = {
        id: `proj_${Date.now().toString(36)}`,
        project_name: name,
        target_platform: targetPlatform,
        local_path: getProjectLocalPath(name),
        blueprint_md: blueprintMd,
        current_phase_id: 1,
        tech_stack: {
          framework: 'Vanilla HTML/CSS/JS',
          language: 'JavaScript',
          styling: 'Vanilla CSS',
          storage_or_backend: 'LocalStorage',
          testing_tool: 'Node Test Runner',
          deployment_target: targetPlatform === 'ANDROID_APK' ? 'GitHub Actions APK (Capacitor)' : 'Vercel'
        },
        phases: [
          {
            phase_id: 1,
            name: 'Phase 1: Foundation & PWA Shell',
            status: 'IN_PROGRESS',
            checklist: [
              { id: 'P1-C1', description: 'Design tokens & responsive CSS defined', verified: false },
              { id: 'P1-C2', description: 'Valid manifest.webmanifest & sw.js precache shell', verified: false }
            ],
            tasks: [
              { task_id: 'P1-T1', title: 'Define design tokens & responsive layout CSS', assigned_agent: 'ui-designer', target_files: ['styles.css'], status: 'PENDING', retry_count: 0, split_depth: 0 },
              { task_id: 'P1-T2', title: 'Build PWA app shell, manifest.webmanifest & sw.js', assigned_agent: 'frontend-developer', target_files: ['index.html', 'manifest.webmanifest', 'sw.js'], status: 'PENDING', retry_count: 0, split_depth: 0 }
            ]
          },
          {
            phase_id: 2,
            name: 'Phase 2: Data Layer & Core MVP',
            status: 'PENDING',
            checklist: [{ id: 'P2-C1', description: 'LocalStorage CRUD repository wired cleanly', verified: false }],
            tasks: [
              { task_id: 'P2-T1', title: 'Implement LocalStorage CRUD store & app logic', assigned_agent: 'backend-developer', target_files: ['app.js'], status: 'PENDING', retry_count: 0, split_depth: 0 }
            ]
          },
          {
            phase_id: 3,
            name: 'Phase 3: QA, A11y & Release',
            status: 'PENDING',
            checklist: [{ id: 'P3-C1', description: 'WCAG 2.1 AA semantics & hosting config ready', verified: false }],
            tasks: [
              { task_id: 'P3-T1', title: 'Generate vercel.json & DEPLOY.md release docs', assigned_agent: 'deployment-engineer', target_files: ['vercel.json', 'DEPLOY.md'], status: 'PENDING', retry_count: 0, split_depth: 0 }
            ]
          }
        ],
        file_manifest: targetPlatform === 'ANDROID_APK' ? { 'capacitor.config.ts': 'Capacitor Android config', '.github/workflows/main.yml': 'GitHub Actions APK builder' } : {},
        files: targetPlatform === 'ANDROID_APK' ? generateAndroidApkScaffold(name) : {},
        snapshots: [],
        created_at: now,
        updated_at: now
      };
      this.hooks.onProjectUpdate(fallback);
      this.hooks.onActivity({
        agentId: 'master-orchestrator',
        text: `Loaded "${name}" locally (add K1-K4 keys & tap Save Settings for live Gemini intake).`,
        kind: 'info'
      });
      return fallback;
    }

    this.hooks.onAgentVisual('master-orchestrator', 'THINKING', 'Parsing blueprint & locking tech stack...');
    const orchPrompt = getPromptByRole('master-orchestrator');
    const t0 = performance.now();
    const res = await callGeminiJson<{
      reasoning?: string;
      updated_project_state: Omit<ProjectState, 'id' | 'blueprint_md' | 'files' | 'snapshots' | 'created_at' | 'updated_at'>;
    }>({
      keyId: slot.id,
      systemPrompt: orchPrompt.content,
      userPayload: JSON.stringify({
        mode: 'INTAKE',
        target_platform: targetPlatform,
        blueprint_markdown: blueprintMd,
        user_preferences: memories.map((m) => `${m.key}: ${m.value}`)
      }),
      thinkingLevel: orchPrompt.thinkingLevel
    });
    this.hooks.onAgentMetric('master-orchestrator', Math.round(performance.now() - t0), res.usage.totalTokens, 'Blueprint INTAKE');

    const p: ProjectState = {
      id: `proj_${Date.now().toString(36)}`,
      project_name: res.data.updated_project_state?.project_name || 'Agency Project',
      target_platform: targetPlatform,
      local_path: getProjectLocalPath(res.data.updated_project_state?.project_name || 'Agency Project'),
      blueprint_md: blueprintMd,
      current_phase_id: res.data.updated_project_state?.current_phase_id || 1,
      tech_stack: res.data.updated_project_state?.tech_stack || {
        framework: 'Vanilla HTML/CSS/JS',
        language: 'JavaScript',
        styling: 'Vanilla CSS',
        storage_or_backend: 'LocalStorage',
        testing_tool: 'Node Test Runner',
        deployment_target: 'Vercel'
      },
      phases: res.data.updated_project_state?.phases || [],
      file_manifest: res.data.updated_project_state?.file_manifest || {},
      files: targetPlatform === 'ANDROID_APK' ? generateAndroidApkScaffold(res.data.updated_project_state?.project_name || 'Agency Project') : {},
      snapshots: [],
      created_at: now,
      updated_at: now
    };

    this.hooks.onAgentVisual('master-orchestrator', 'IDLE');
    this.hooks.onProjectUpdate(p);
    this.hooks.onActivity({
      agentId: 'master-orchestrator',
      text: `Intake locked "${p.project_name}" (${p.phases.length} phases).`,
      kind: 'success',
      keyId: slot.id
    });
    return p;
  }

  public async runLoop(initialProject: ProjectState): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this.hooks.onLoopStatus('RUNNING');
    void acquireScreenWakeLock();

    let project = structuredClone(initialProject);
    if (!Array.isArray(project.snapshots)) project.snapshots = [];

    while (this.running && !this.paused) {
      const phase = project.phases.find((p) => p.phase_id === project.current_phase_id);
      if (!phase) {
        this.hooks.onActivity({
          agentId: 'cali',
          text: `Project "${project.project_name}" complete! Ready to preview, save locally, or ship.`,
          kind: 'success'
        });
        void sendAgencyNotification('Cali Agency Complete', `${project.project_name} finished all phases.`);
        void releaseScreenWakeLock();
        this.running = false;
        this.hooks.onLoopStatus('IDLE');
        return;
      }

      const nextTask = phase.tasks.find((t) => t.status === 'PENDING' || t.status === 'CODED');
      if (!nextTask) {
        const qaOk = await this.runPhaseQaAndGate(project, phase);
        if (!qaOk) return;
        project = { ...project, updated_at: new Date().toISOString() };
        this.hooks.onProjectUpdate(project);
        continue;
      }

      const key = keyPool.acquireWorkerKey(nextTask.assigned_agent);
      if (!key) {
        this.enterWatchdog(project);
        return;
      }

      try {
        this.hooks.onAgentVisual(nextTask.assigned_agent, 'CODING', nextTask.title);
        this.hooks.onActivity({
          agentId: nextTask.assigned_agent,
          text: `Working on ${nextTask.task_id}: ${nextTask.title}`,
          kind: 'info',
          keyId: key.id
        });

        const { systemPrompt, thinkingLevel } = assembleWorkerSystemPrompt(nextTask.assigned_agent);
        const compactCtx = buildCompactProjectContext(project, nextTask.target_files);

        const t0 = performance.now();
        const workerRes = await callGeminiJson<WorkerResponse>({
          keyId: key.id,
          systemPrompt,
          thinkingLevel,
          userPayload: JSON.stringify({
            tech_stack: project.tech_stack,
            task: nextTask,
            existing_files: compactCtx.target_contents,
            repo_symbol_index: compactCtx.symbol_index,
            recent_handoffs: compactCtx.recent_handoffs
          })
        });
        this.hooks.onAgentMetric(nextTask.assigned_agent, Math.round(performance.now() - t0), workerRes.usage.totalTokens, nextTask.title);

        const out = workerRes.data;
        if (out.status === 'BLOCKED' && out.blockers?.some((b) => b.includes('TASK_TOO_LARGE'))) {
          await this.handleTaskSplit(project, phase, nextTask, out.blockers.join('; '));
          continue;
        }

        for (const f of out.files || []) {
          if (f.action === 'DELETE') delete project.files[f.path];
          else if (typeof f.content === 'string') {
            project.files[f.path] = f.content;
            project.file_manifest[f.path] = out.summary || nextTask.title;
          }
        }
        nextTask.last_summary = out.summary;
        nextTask.handoff_notes = out.handoff_notes || [];
        nextTask.status = 'CODED';
        this.hooks.onAgentVisual(nextTask.assigned_agent, 'IDLE');
        this.hooks.onProjectUpdate({ ...project, updated_at: new Date().toISOString() });

        const preCheck = runStaticPreCheck(out.files || []);
        if (!preCheck.passed) {
          this.hooks.onActivity({
            agentId: 'precheck',
            text: `Static Pre-Check caught ${preCheck.issues.length} issue(s) -> routing to 09. Debugger.`,
            kind: 'warn'
          });
          this.hooks.onHandoff(nextTask.assigned_agent, 'debugger', 'Static Pre-Check fail');
          await this.runDebuggerPatch(project, nextTask, preCheck.issues);
          project.updated_at = new Date().toISOString();
          this.hooks.onProjectUpdate({ ...project });
          continue;
        }

        this.hooks.onHandoff(nextTask.assigned_agent, 'code-reviewer', `${nextTask.task_id} diff`);
        const revKey = keyPool.acquireWorkerKey('code-reviewer');
        if (!revKey) {
          this.enterWatchdog(project);
          return;
        }

        this.hooks.onAgentVisual('code-reviewer', 'REVIEWING', `Auditing ${nextTask.task_id}...`);
        const revCfg = assembleWorkerSystemPrompt('code-reviewer');
        const rt0 = performance.now();
        const revRes = await callGeminiJson<WorkerResponse>({
          keyId: revKey.id,
          systemPrompt: revCfg.systemPrompt,
          thinkingLevel: revCfg.thinkingLevel,
          userPayload: JSON.stringify({
            tech_stack: project.tech_stack,
            task: nextTask,
            generated_files: out.files || [],
            handoff_notes: out.handoff_notes || []
          })
        });
        this.hooks.onAgentMetric('code-reviewer', Math.round(performance.now() - rt0), revRes.usage.totalTokens, `Audit ${nextTask.task_id}`);
        this.hooks.onAgentVisual('code-reviewer', 'IDLE');

        if (revRes.data.status === 'NEEDS_REVISION' && (revRes.data.blockers?.length || 0) > 0) {
          nextTask.retry_count += 1;
          nextTask.blockers = revRes.data.blockers;
          if (nextTask.retry_count >= 3) {
            this.hooks.onAgentVisual('code-reviewer', 'BLOCKED', 'Circuit breaker hit');
            this.hooks.onPendingDecision({
              kind: 'CIRCUIT_BREAKER',
              title: `Circuit Breaker on ${nextTask.task_id}`,
              detail: `Reviewer flagged blockers 3 times: ${revRes.data.blockers?.join(' | ')}`,
              approveLabel: 'Skip & Mark Done',
              declineLabel: 'Keep Paused',
              payload: { taskId: nextTask.task_id }
            });
            void sendAgencyNotification('Cali Needs Approval', `Circuit breaker on ${nextTask.task_id}.`);
            this.pause();
            return;
          }
          this.hooks.onHandoff('code-reviewer', 'debugger', 'Critical blockers');
          await this.runDebuggerPatch(project, nextTask, revRes.data.blockers || []);
        } else {
          nextTask.status = 'DONE';
          this.hooks.onActivity({
            agentId: 'code-reviewer',
            text: `Approved ${nextTask.task_id}: ${revRes.data.summary || 'Zero critical issues.'}`,
            kind: 'success',
            keyId: revKey.id
          });
        }

        project.updated_at = new Date().toISOString();
        this.hooks.onProjectUpdate({ ...project });
      } catch (err) {
        const msg = (err as Error).message || 'Error';
        this.hooks.onAgentVisual(nextTask.assigned_agent, 'BLOCKED', msg);
        if (msg === 'MAX_TOKENS') {
          await this.handleTaskSplit(project, phase, nextTask, 'MAX_TOKENS truncation');
          continue;
        }
        this.hooks.onActivity({
          agentId: nextTask.assigned_agent,
          text: `Task error (${msg}) — rotating key / checking pool.`,
          kind: 'warn',
          keyId: key.id
        });
        const nextAvail = keyPool.getAll().some((k) => k.role === 'worker' && k.apiKey && k.status === 'READY');
        if (!nextAvail) {
          this.enterWatchdog(project);
          return;
        }
      }
    }
  }

  public async runDebuggerPatch(project: ProjectState, task: AgencyTask, blockers: string[]): Promise<void> {
    const dbgKey = keyPool.acquireWorkerKey('debugger');
    if (!dbgKey) return;
    this.hooks.onAgentVisual('debugger', 'CODING', 'Patching blockers...');
    const dbgCfg = assembleWorkerSystemPrompt('debugger');
    const targetContents: Record<string, string> = {};
    for (const p of task.target_files) {
      if (project.files[p]) targetContents[p] = project.files[p];
    }
    const t0 = performance.now();
    const res = await callGeminiJson<WorkerResponse>({
      keyId: dbgKey.id,
      systemPrompt: dbgCfg.systemPrompt,
      thinkingLevel: dbgCfg.thinkingLevel,
      userPayload: JSON.stringify({ tech_stack: project.tech_stack, task, blockers, files: targetContents })
    });
    this.hooks.onAgentMetric('debugger', Math.round(performance.now() - t0), res.usage.totalTokens, `Patch ${task.task_id}`, true);
    for (const f of res.data.files || []) {
      if (f.action !== 'DELETE' && typeof f.content === 'string') {
        project.files[f.path] = f.content;
      }
    }
    task.status = 'DONE';
    this.hooks.onAgentVisual('debugger', 'IDLE');
    this.hooks.onActivity({
      agentId: 'debugger',
      text: `Patched ${task.task_id}: ${res.data.summary || 'Applied surgical fix.'}`,
      kind: 'success',
      keyId: dbgKey.id
    });
  }

  private async runPhaseQaAndGate(project: ProjectState, phase: ProjectState['phases'][number]): Promise<boolean> {
    const qaKey = keyPool.acquireWorkerKey('qa-tester');
    if (!qaKey) {
      this.enterWatchdog(project);
      return false;
    }
    this.hooks.onAgentVisual('qa-tester', 'THINKING', `Writing Phase ${phase.phase_id} QA tests...`);
    const qaCfg = assembleWorkerSystemPrompt('qa-tester');
    const t0 = performance.now();
    const qaRes = await callGeminiJson<WorkerResponse>({
      keyId: qaKey.id,
      systemPrompt: qaCfg.systemPrompt,
      thinkingLevel: qaCfg.thinkingLevel,
      userPayload: JSON.stringify({
        mode: 'WRITE_TESTS',
        tech_stack: project.tech_stack,
        phase_checklist: phase.checklist,
        file_manifest: project.file_manifest
      })
    });
    this.hooks.onAgentMetric('qa-tester', Math.round(performance.now() - t0), qaRes.usage.totalTokens, `Phase ${phase.phase_id} QA`);
    for (const f of qaRes.data.files || []) {
      if (typeof f.content === 'string') project.files[f.path] = f.content;
    }
    this.hooks.onAgentVisual('qa-tester', 'IDLE');
    this.hooks.onHandoff('qa-tester', 'master-orchestrator', `Phase ${phase.phase_id} QA report`);

    project.snapshots.unshift({
      id: `snap_p${phase.phase_id}_${Date.now().toString(36)}`,
      phase_id: phase.phase_id,
      phase_name: phase.name,
      created_at: new Date().toISOString(),
      file_count: Object.keys(project.files).length,
      files: { ...project.files },
      file_manifest: { ...project.file_manifest }
    });

    phase.checklist = phase.checklist.map((c) => ({ ...c, verified: true }));
    phase.status = 'PASSED';
    const nextPhase = project.phases.find((p) => p.phase_id === phase.phase_id + 1);
    if (nextPhase) {
      nextPhase.status = 'IN_PROGRESS';
      project.current_phase_id = nextPhase.phase_id;
      this.hooks.onActivity({
        agentId: 'master-orchestrator',
        text: `Phase ${phase.phase_id} snapshot saved! Advancing to ${nextPhase.name}.`,
        kind: 'success'
      });
    } else {
      project.current_phase_id = phase.phase_id + 1;
    }
    return true;
  }

  private async handleTaskSplit(
    project: ProjectState,
    phase: ProjectState['phases'][number],
    task: AgencyTask,
    reason: string
  ): Promise<void> {
    if (task.split_depth >= 2) {
      this.hooks.onPendingDecision({
        kind: 'CIRCUIT_BREAKER',
        title: `Task ${task.task_id} too large after 2 splits`,
        detail: reason,
        approveLabel: 'Mark Done',
        declineLabel: 'Keep Paused',
        payload: { taskId: task.task_id }
      });
      void sendAgencyNotification('Cali Needs Approval', `${task.task_id} hit split limit.`);
      this.pause();
      return;
    }
    const splitA: AgencyTask = { ...task, task_id: `${task.task_id}A`, title: `${task.title} (Part 1)`, split_depth: task.split_depth + 1, status: 'PENDING' };
    const splitB: AgencyTask = { ...task, task_id: `${task.task_id}B`, title: `${task.title} (Part 2)`, split_depth: task.split_depth + 1, status: 'PENDING' };
    const idx = phase.tasks.findIndex((t) => t.task_id === task.task_id);
    phase.tasks.splice(idx, 1, splitA, splitB);
    this.hooks.onActivity({ agentId: 'master-orchestrator', text: `Autonomous SPLIT_TASK: ${task.task_id} -> ${splitA.task_id} & ${splitB.task_id}`, kind: 'handoff' });
    this.hooks.onProjectUpdate({ ...project });
  }

  private enterWatchdog(project: ProjectState): void {
    this.running = false;
    this.hooks.onLoopStatus('WATCHDOG');
    this.hooks.onActivity({ agentId: 'watchdog', text: 'All worker keys cooling down or offline. Watchdog polling every 10s...', kind: 'warn' });
    keyPool.startWatchdog((recoveredKey: KeySlotId) => {
      this.hooks.onActivity({ agentId: 'cali', text: `Watchdog pinged me: ${recoveredKey} is green again! Auto-resuming production.`, kind: 'success', keyId: recoveredKey });
      void sendAgencyNotification('Cali Watchdog Recovered', `${recoveredKey} is back online.`);
      this.runLoop(project);
    });
  }
}
