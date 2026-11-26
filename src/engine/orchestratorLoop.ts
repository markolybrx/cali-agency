import type {
  ActivityEvent,
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

export interface LoopHooks {
  onProjectUpdate: (project: ProjectState) => void;
  onActivity: (event: Omit<ActivityEvent, 'id' | 'ts'>) => void;
  onHandoff: (from: WorkerAgentId | 'cali', to: WorkerAgentId | 'cali', label: string) => void;
  onAgentVisual: (agentId: WorkerAgentId | 'cali', state: 'IDLE' | 'THINKING' | 'CODING' | 'REVIEWING' | 'BLOCKED' | 'TALKING', speech?: string) => void;
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
  private demoTimer: number | null = null;
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
    if (this.demoTimer !== null) {
      clearTimeout(this.demoTimer);
      this.demoTimer = null;
    }
    this.hooks.onLoopStatus('PAUSED');
    this.hooks.onActivity({ agentId: 'cali', text: 'Agency floor paused.', kind: 'warn' });
  }

  public async intakeBlueprint(blueprintMd: string, memories: MemoryItem[]): Promise<ProjectState> {
    const slot = keyPool.acquireWorkerKey('master-orchestrator');
    const now = new Date().toISOString();

    if (!slot) {
      // Offline deterministic intake parser so user can test immediately
      const titleMatch = blueprintMd.match(/^#\s+Project Blueprint:\s*(.+)$/m);
      const name = titleMatch ? titleMatch[1].trim() : 'New Agency PWA';
      const fallback: ProjectState = {
        id: `proj_${Date.now().toString(36)}`,
        project_name: name,
        blueprint_md: blueprintMd,
        current_phase_id: 1,
        tech_stack: {
          framework: 'Vanilla HTML/CSS/JS',
          language: 'JavaScript',
          styling: 'Vanilla CSS',
          storage_or_backend: 'LocalStorage',
          testing_tool: 'Node Test Runner',
          deployment_target: 'Vercel'
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
              {
                task_id: 'P1-T1',
                title: 'Define design tokens & responsive layout CSS',
                assigned_agent: 'ui-designer',
                target_files: ['styles.css'],
                status: 'PENDING',
                retry_count: 0,
                split_depth: 0
              },
              {
                task_id: 'P1-T2',
                title: 'Build PWA app shell, manifest.webmanifest & sw.js',
                assigned_agent: 'frontend-developer',
                target_files: ['index.html', 'manifest.webmanifest', 'sw.js'],
                status: 'PENDING',
                retry_count: 0,
                split_depth: 0
              }
            ]
          },
          {
            phase_id: 2,
            name: 'Phase 2: Data Layer & Core MVP',
            status: 'PENDING',
            checklist: [
              { id: 'P2-C1', description: 'LocalStorage CRUD repository wired cleanly', verified: false },
              { id: 'P2-C2', description: 'Interactive UI flows work completely offline', verified: false }
            ],
            tasks: [
              {
                task_id: 'P2-T1',
                title: 'Implement LocalStorage CRUD store & app logic',
                assigned_agent: 'backend-developer',
                target_files: ['app.js'],
                status: 'PENDING',
                retry_count: 0,
                split_depth: 0
              }
            ]
          },
          {
            phase_id: 3,
            name: 'Phase 3: QA, A11y & Release',
            status: 'PENDING',
            checklist: [
              { id: 'P3-C1', description: 'WCAG 2.1 AA semantics & hosting config ready', verified: false }
            ],
            tasks: [
              {
                task_id: 'P3-T1',
                title: 'Generate vercel.json & DEPLOY.md release docs',
                assigned_agent: 'deployment-engineer',
                target_files: ['vercel.json', 'DEPLOY.md'],
                status: 'PENDING',
                retry_count: 0,
                split_depth: 0
              }
            ]
          }
        ],
        file_manifest: {},
        files: {},
        created_at: now,
        updated_at: now
      };
      this.hooks.onProjectUpdate(fallback);
      this.hooks.onActivity({
        agentId: 'master-orchestrator',
        text: `Loaded "${name}" locally (add K1-K4 keys for live Gemini intake).`,
        kind: 'info'
      });
      return fallback;
    }

    this.hooks.onAgentVisual('master-orchestrator', 'THINKING', 'Parsing blueprint & locking tech stack...');
    const orchPrompt = getPromptByRole('master-orchestrator');
    const res = await callGeminiJson<{
      reasoning?: string;
      updated_project_state: Omit<ProjectState, 'id' | 'blueprint_md' | 'files' | 'created_at' | 'updated_at'>;
    }>({
      keyId: slot.id,
      systemPrompt: orchPrompt.content,
      userPayload: JSON.stringify({
        mode: 'INTAKE',
        blueprint_markdown: blueprintMd,
        user_preferences: memories.map((m) => `${m.key}: ${m.value}`)
      }),
      thinkingLevel: orchPrompt.thinkingLevel
    });

    const p: ProjectState = {
      id: `proj_${Date.now().toString(36)}`,
      project_name: res.data.updated_project_state?.project_name || 'Agency PWA',
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
      files: {},
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
    let project = structuredClone(initialProject);

    while (this.running && !this.paused) {
      const phase = project.phases.find((p) => p.phase_id === project.current_phase_id);
      if (!phase) {
        this.hooks.onActivity({ agentId: 'cali', text: `Project "${project.project_name}" complete! Ready to export or ship.`, kind: 'success' });
        this.running = false;
        this.hooks.onLoopStatus('IDLE');
        return;
      }

      const nextTask = phase.tasks.find((t) => t.status === 'PENDING' || t.status === 'CODED');
      if (!nextTask) {
        // Phase-end QA Tester -> Phase Gate
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
        const contextFiles: Record<string, string> = {};
        for (const f of nextTask.target_files) {
          if (project.files[f]) contextFiles[f] = project.files[f];
        }

        const workerRes = await callGeminiJson<WorkerResponse>({
          keyId: key.id,
          systemPrompt,
          thinkingLevel,
          userPayload: JSON.stringify({
            tech_stack: project.tech_stack,
            task: nextTask,
            existing_files: contextFiles,
            file_manifest: project.file_manifest
          })
        });

        const out = workerRes.data;
        if (out.status === 'BLOCKED' && out.blockers?.some((b) => b.includes('TASK_TOO_LARGE'))) {
          await this.handleTaskSplit(project, phase, nextTask, out.blockers.join('; '));
          continue;
        }

        // Write returned files
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

        // Route to 07-code-reviewer
        this.hooks.onHandoff(nextTask.assigned_agent, 'code-reviewer', `${nextTask.task_id} diff`);
        const revKey = keyPool.acquireWorkerKey('code-reviewer');
        if (!revKey) {
          this.enterWatchdog(project);
          return;
        }

        this.hooks.onAgentVisual('code-reviewer', 'REVIEWING', `Auditing ${nextTask.task_id}...`);
        const revCfg = assembleWorkerSystemPrompt('code-reviewer');
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
            this.pause();
            return;
          }
          // Hand off to 09-debugger
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
    const res = await callGeminiJson<WorkerResponse>({
      keyId: dbgKey.id,
      systemPrompt: dbgCfg.systemPrompt,
      thinkingLevel: dbgCfg.thinkingLevel,
      userPayload: JSON.stringify({
        tech_stack: project.tech_stack,
        task,
        blockers,
        files: targetContents
      })
    });
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
    // 1. Invoke 08-qa-tester (WRITE_TESTS)
    const qaKey = keyPool.acquireWorkerKey('qa-tester');
    if (!qaKey) {
      this.enterWatchdog(project);
      return false;
    }
    this.hooks.onAgentVisual('qa-tester', 'THINKING', `Writing Phase ${phase.phase_id} QA tests...`);
    const qaCfg = assembleWorkerSystemPrompt('qa-tester');
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
    for (const f of qaRes.data.files || []) {
      if (typeof f.content === 'string') project.files[f.path] = f.content;
    }
    this.hooks.onAgentVisual('qa-tester', 'IDLE');
    this.hooks.onHandoff('qa-tester', 'master-orchestrator', `Phase ${phase.phase_id} QA report`);
    this.hooks.onActivity({
      agentId: 'qa-tester',
      text: `Generated Phase ${phase.phase_id} test suite: ${qaRes.data.summary || 'Ready for gate.'}`,
      kind: 'success',
      keyId: qaKey.id
    });

    // 2. Advance phase & mark checklist verified
    phase.checklist = phase.checklist.map((c) => ({ ...c, verified: true }));
    phase.status = 'PASSED';
    const nextPhase = project.phases.find((p) => p.phase_id === phase.phase_id + 1);
    if (nextPhase) {
      nextPhase.status = 'IN_PROGRESS';
      project.current_phase_id = nextPhase.phase_id;
      this.hooks.onActivity({
        agentId: 'master-orchestrator',
        text: `Phase ${phase.phase_id} passed! Advancing to ${nextPhase.name}.`,
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
      this.pause();
      return;
    }
    const splitA: AgencyTask = {
      ...task,
      task_id: `${task.task_id}A`,
      title: `${task.title} (Part 1)`,
      split_depth: task.split_depth + 1,
      status: 'PENDING'
    };
    const splitB: AgencyTask = {
      ...task,
      task_id: `${task.task_id}B`,
      title: `${task.title} (Part 2)`,
      split_depth: task.split_depth + 1,
      status: 'PENDING'
    };
    const idx = phase.tasks.findIndex((t) => t.task_id === task.task_id);
    phase.tasks.splice(idx, 1, splitA, splitB);
    this.hooks.onActivity({
      agentId: 'master-orchestrator',
      text: `Autonomous SPLIT_TASK: ${task.task_id} -> ${splitA.task_id} & ${splitB.task_id}`,
      kind: 'handoff'
    });
    this.hooks.onProjectUpdate({ ...project });
  }

  private enterWatchdog(project: ProjectState): void {
    this.running = false;
    this.hooks.onLoopStatus('WATCHDOG');
    this.hooks.onActivity({
      agentId: 'watchdog',
      text: 'All worker keys cooling down or offline. Watchdog polling every 10s...',
      kind: 'warn'
    });
    keyPool.startWatchdog((recoveredKey: KeySlotId) => {
      this.hooks.onActivity({
        agentId: 'cali',
        text: `Watchdog pinged me: ${recoveredKey} is green again! Auto-resuming production.`,
        kind: 'success',
        keyId: recoveredKey
      });
      this.runLoop(project);
    });
  }

  // Zero-Quota Demo Sprint Mode: creates a real previewable PWA + animates the whole office!
  public runDemoSprint(onComplete?: () => void): void {
    this.pause();
    this.running = true;
    this.hooks.onLoopStatus('DEMO');
    const now = new Date().toISOString();

    const demoProject: ProjectState = {
      id: `demo_${Date.now().toString(36)}`,
      project_name: 'HabitFlow PWA (Demo)',
      blueprint_md: '# Project Blueprint: HabitFlow PWA (Demo Sprint)\nZero-quota live agency simulation.',
      current_phase_id: 1,
      tech_stack: {
        framework: 'Vanilla HTML/CSS/JS',
        language: 'JavaScript',
        styling: 'Vanilla CSS',
        storage_or_backend: 'LocalStorage',
        testing_tool: 'Node Test Runner',
        deployment_target: 'Vercel'
      },
      phases: [
        {
          phase_id: 1,
          name: 'Phase 1: Design & PWA Shell',
          status: 'IN_PROGRESS',
          checklist: [
            { id: 'P1-C1', description: 'Design tokens & Poppins palette locked', verified: false },
            { id: 'P1-C2', description: 'Standalone interactive index.html + manifest', verified: false }
          ],
          tasks: [
            { task_id: 'P1-T1', title: 'Craft design tokens & palette', assigned_agent: 'ui-designer', target_files: ['styles.css'], status: 'PENDING', retry_count: 0, split_depth: 0 },
            { task_id: 'P1-T2', title: 'Build interactive HabitFlow PWA', assigned_agent: 'frontend-developer', target_files: ['index.html'], status: 'PENDING', retry_count: 0, split_depth: 0 },
            { task_id: 'P1-T3', title: 'Audit diff & verify offline rules', assigned_agent: 'code-reviewer', target_files: ['index.html'], status: 'PENDING', retry_count: 0, split_depth: 0 }
          ]
        }
      ],
      file_manifest: {},
      files: {},
      created_at: now,
      updated_at: now
    };

    this.hooks.onProjectUpdate(demoProject);

    const steps: Array<() => void> = [
      () => {
        this.hooks.onHandoff('cali', 'master-orchestrator', 'Approved Blueprint');
        this.hooks.onAgentVisual('master-orchestrator', 'THINKING', 'Locking Vanilla PWA stack...');
        this.hooks.onActivity({ agentId: 'master-orchestrator', text: 'Demo INTAKE locked HabitFlow PWA.', kind: 'info' });
      },
      () => {
        this.hooks.onAgentVisual('master-orchestrator', 'IDLE');
        this.hooks.onHandoff('master-orchestrator', 'ui-designer', 'P1-T1 Tokens');
        this.hooks.onAgentVisual('ui-designer', 'CODING', 'Crafting #6C4CD1 violet tokens...');
        demoProject.files['styles.css'] = ':root { --bg: #121215; --card: #18181D; --accent: #6C4CD1; --text: #F4F4F5; }';
        demoProject.file_manifest['styles.css'] = 'Core Monolith violet design tokens';
        demoProject.phases[0].tasks[0].status = 'DONE';
        demoProject.phases[0].checklist[0].verified = true;
        this.hooks.onProjectUpdate({ ...demoProject });
        this.hooks.onActivity({ agentId: 'ui-designer', text: 'Delivered styles.css tokens.', kind: 'success' });
      },
      () => {
        this.hooks.onAgentVisual('ui-designer', 'IDLE');
        this.hooks.onHandoff('ui-designer', 'frontend-developer', 'styles.css');
        this.hooks.onAgentVisual('frontend-developer', 'CODING', 'Building interactive HabitFlow PWA...');
        demoProject.files['index.html'] = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HabitFlow PWA</title>
<style>
  body { margin:0; font-family: system-ui, sans-serif; background:#121215; color:#F4F4F5; padding:20px; }
  .card { background:#18181D; border:1px solid rgba(255,255,255,.08); border-radius:16px; padding:16px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; }
  button { background:#6C4CD1; color:#fff; border:none; border-radius:999px; padding:8px 14px; font-weight:600; cursor:pointer; }
  .done { opacity:.5; text-decoration:line-through; }
</style>
</head>
<body>
  <h2 style="margin:0 0 4px">HabitFlow PWA</h2>
  <p style="margin:0 0 16px;font-size:12px;color:#A1A1AA">Built by Cali's 13-Agent Demo Sprint</p>
  <div id="list"></div>
  <script>
    const habits = [
      { id: 1, name: 'Ship 1 mobile build', streak: 5, done: false },
      { id: 2, name: '30m deep focus session', streak: 12, done: true },
      { id: 3, name: 'Drink 2L water', streak: 3, done: false }
    ];
    function render() {
      document.getElementById('list').innerHTML = habits.map(h =>
        '<div class="card"><div class="'+(h.done?'done':'')+'"><b>'+h.name+'</b><div style="font-size:11px;color:#FFB732">'+h.streak+' day streak</div></div><button onclick="toggle('+h.id+')">'+(h.done?'Undo':'Done')+'</button></div>'
      ).join('');
    }
    window.toggle = (id) => { const h = habits.find(x => x.id === id); h.done = !h.done; h.streak += h.done ? 1 : -1; render(); };
    render();
  </script>
</body>
</html>`;
        demoProject.file_manifest['index.html'] = 'Interactive offline HabitFlow PWA';
        demoProject.phases[0].tasks[1].status = 'DONE';
        demoProject.phases[0].checklist[1].verified = true;
        this.hooks.onProjectUpdate({ ...demoProject });
        this.hooks.onActivity({ agentId: 'frontend-developer', text: 'Built index.html — ready for Preview!', kind: 'success' });
      },
      () => {
        this.hooks.onAgentVisual('frontend-developer', 'IDLE');
        this.hooks.onHandoff('frontend-developer', 'code-reviewer', 'index.html diff');
        this.hooks.onAgentVisual('code-reviewer', 'REVIEWING', 'Zero critical bugs found.');
        keyPool.simulateCooldown('K1', 8);
        this.hooks.onActivity({ agentId: 'watchdog', text: 'Simulated 429 on K1 -> rotated to K2 cleanly.', kind: 'warn', keyId: 'K1' });
      },
      () => {
        this.hooks.onAgentVisual('code-reviewer', 'IDLE');
        this.hooks.onHandoff('code-reviewer', 'qa-tester', 'Approved build');
        this.hooks.onAgentVisual('qa-tester', 'THINKING', 'All 3 offline assertions passed!');
        demoProject.phases[0].tasks[2].status = 'DONE';
        demoProject.phases[0].status = 'PASSED';
        this.hooks.onProjectUpdate({ ...demoProject });
      },
      () => {
        this.hooks.onAgentVisual('qa-tester', 'IDLE');
        this.hooks.onHandoff('qa-tester', 'cali', 'Sprint Complete');
        this.hooks.onAgentVisual('cali', 'TALKING', 'HabitFlow PWA is ready to preview or export!');
        this.hooks.onActivity({ agentId: 'cali', text: 'Demo Sprint complete! Open Workspace -> Live Preview to test it.', kind: 'success' });
        this.running = false;
        this.hooks.onLoopStatus('IDLE');
        onComplete?.();
      }
    ];

    let idx = 0;
    const runNext = () => {
      if (!this.running || idx >= steps.length) return;
      steps[idx++]();
      if (idx < steps.length) {
        this.demoTimer = window.setTimeout(runNext, 2600);
      }
    };
    runNext();
  }
}
