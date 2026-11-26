import { AGENCY_PROMPTS, buildWorkerSystemPrompt } from '../prompts/agencyPrompts';
import type {
  AgencyActivity,
  AgentId,
  OrchestratorDecision,
  PendingDecision,
  ProjectState,
  WorkerEnvelope,
  WorkspaceFile
} from '../types/agency';
import { callGeminiJson, GeminiApiError } from './geminiClient';
import { keyPool } from './keyPool';
import { storage } from './storage';

export interface LoopHooks {
  onProjectUpdate: (project: ProjectState) => void;
  onFilesUpdate: (files: WorkspaceFile[]) => void;
  onActivity: (act: AgencyActivity) => void;
  onStageDecision: (dec: PendingDecision) => void;
  onLoopStateChange: (running: boolean, statusText: string) => void;
}

export class AgencyOrchestratorLoop {
  private running = false;
  private hooks: LoopHooks;
  private project: ProjectState | null;
  private files: WorkspaceFile[];

  constructor(hooks: LoopHooks) {
    this.hooks = hooks;
    this.project = storage.loadProject();
    this.files = storage.loadFiles();

    keyPool.setRecoveryHandler((recoveredKeys) => {
      this.emitActivity('cali-director', 'master-orchestrator', `Keys recovered (${recoveredKeys.join(', ')}). Pinging Cali to resume production.`, undefined, 'watchdog');
      const profile = storage.loadProfile();
      if (profile.autoResumeOnKeyRecovery && this.project) {
        this.start();
      } else {
        this.hooks.onStageDecision({
          id: `dec_${Date.now()}`,
          title: 'Worker API Keys Recovered',
          detail: `${recoveredKeys.join(', ')} are back online and READY.`,
          recommendedCall: 'Resume the paused build loop right where we left off.',
          kind: 'KEY_RECOVERY',
          approveLabel: 'Resume Production',
          declineLabel: 'Stay Paused',
          createdAt: new Date().toISOString()
        });
      }
    });
  }

  public async intakeBlueprint(blueprintMarkdown: string): Promise<void> {
    this.hooks.onLoopStateChange(true, 'Orchestrator parsing blueprint...');
    this.emitActivity('cali-director', 'master-orchestrator', 'Handing project blueprint to Master Orchestrator', undefined, 'handoff');

    const decision = await this.invokeWithPool<OrchestratorDecision>(
      'master-orchestrator',
      JSON.stringify({ mode: 'INTAKE', input_markdown: blueprintMarkdown, project_state: null })
    );
    if (!decision?.updated_project_state) {
      this.hooks.onLoopStateChange(false, 'Intake paused — check worker keys');
      return;
    }

    this.project = decision.updated_project_state;
    storage.saveProject(this.project);
    this.hooks.onProjectUpdate(this.project);
    this.emitActivity('master-orchestrator', undefined, `Locked stack (${this.project.tech_stack.framework}) with ${this.project.phases.length} phases.`, undefined, 'done');
    this.start();
  }

  public start(): void {
    if (this.running || !this.project) return;
    this.running = true;
    this.hooks.onLoopStateChange(true, 'Agency loop active');
    void this.tickLoop();
  }

  public pause(reason = 'Paused by user'): void {
    this.running = false;
    this.hooks.onLoopStateChange(false, reason);
  }

  public async stepOnce(): Promise<void> {
    if (!this.project) return;
    await this.executeNextStep();
  }

  private async tickLoop(): Promise<void> {
    while (this.running && this.project) {
      const keepGoing = await this.executeNextStep();
      if (!keepGoing) break;
      await new Promise((r) => setTimeout(r, 900));
    }
  }

  private async executeNextStep(): Promise<boolean> {
    if (!this.project) return false;
    const phase = this.project.phases.find((p) => p.phase_id === this.project!.current_phase_id);
    if (!phase) {
      this.pause('All phases complete');
      return false;
    }

    const nextTask = phase.tasks.find((t) => t.status === 'PENDING' || t.status === 'FAILED');
    if (nextTask) {
      if (nextTask.retry_count >= 3 || nextTask.split_depth >= 2) {
        this.pause(`Circuit breaker on ${nextTask.task_id}`);
        this.hooks.onStageDecision({
          id: `dec_${Date.now()}`,
          title: `Circuit Breaker: ${nextTask.task_id}`,
          detail: `Task "${nextTask.title}" hit retry/split limits.`,
          recommendedCall: 'Review the last error in Office Inspect or skip to continue.',
          kind: 'RECOVER',
          approveLabel: 'Reset & Retry',
          declineLabel: 'Keep Paused',
          createdAt: new Date().toISOString()
        });
        return false;
      }

      const targetContents = this.files.filter((f) => nextTask.target_files.includes(f.path));
      this.emitActivity(nextTask.assigned_agent, undefined, `Working on ${nextTask.task_id}: ${nextTask.title}`, undefined, 'working');

      const workerOut = await this.invokeWithPool<WorkerEnvelope>(
        nextTask.assigned_agent,
        JSON.stringify({
          tech_stack: this.project.tech_stack,
          task: nextTask,
          existing_files: targetContents
        })
      );

      if (!workerOut) return false;

      if (workerOut.status === 'BLOCKED' && workerOut.blockers.some((b) => b.includes('TASK_TOO_LARGE'))) {
        this.emitActivity(nextTask.assigned_agent, 'master-orchestrator', 'Task too large — requesting autonomous split', undefined, 'handoff');
        const splitDec = await this.invokeWithPool<OrchestratorDecision>(
          'master-orchestrator',
          JSON.stringify({ mode: 'RECOVER', project_state: this.project, failed_task: nextTask, blockers: workerOut.blockers })
        );
        if (splitDec?.updated_project_state) {
          this.project = splitDec.updated_project_state;
          storage.saveProject(this.project);
          this.hooks.onProjectUpdate(this.project);
        }
        return true;
      }

      for (const f of workerOut.files || []) {
        this.upsertWorkspaceFile(f.path, f.content, nextTask.assigned_agent);
      }
      nextTask.last_summary = workerOut.summary;

      // Hand off to Code Reviewer
      this.emitActivity(nextTask.assigned_agent, 'code-reviewer', workerOut.handoff_notes?.[0] || workerOut.summary, undefined, 'handoff');
      const review = await this.invokeWithPool<WorkerEnvelope>(
        'code-reviewer',
        JSON.stringify({ task: nextTask, produced_files: workerOut.files, handoff_notes: workerOut.handoff_notes })
      );

      if (!review) return false;

      if (review.status === 'COMPLETED') {
        nextTask.status = 'DONE';
        this.emitActivity('code-reviewer', undefined, `Approved ${nextTask.task_id}`, undefined, 'done');
      } else {
        nextTask.retry_count += 1;
        this.emitActivity('code-reviewer', 'debugger', `Blockers found on ${nextTask.task_id} — routing to Debugger`, undefined, 'handoff');
        const fix = await this.invokeWithPool<WorkerEnvelope>(
          'debugger',
          JSON.stringify({ task: nextTask, blockers: review.blockers, files: workerOut.files })
        );
        if (fix?.files?.length) {
          for (const f of fix.files) this.upsertWorkspaceFile(f.path, f.content, 'debugger');
          nextTask.status = 'DONE';
          this.emitActivity('debugger', 'code-reviewer', `Patched ${nextTask.task_id}`, undefined, 'done');
        }
      }

      storage.saveProject(this.project);
      this.hooks.onProjectUpdate({ ...this.project });
      return true;
    }

    // All tasks in phase DONE -> QA & Phase Gate
    this.emitActivity('qa-tester', 'master-orchestrator', `Evaluating Phase ${phase.phase_id} gate`, undefined, 'handoff');
    const gate = await this.invokeWithPool<OrchestratorDecision>(
      'master-orchestrator',
      JSON.stringify({ mode: 'PHASE_GATE', project_state: this.project })
    );
    if (!gate?.updated_project_state) return false;

    this.project = gate.updated_project_state;
    storage.saveProject(this.project);
    this.hooks.onProjectUpdate(this.project);

    if (gate.decision === 'PROJECT_COMPLETE') {
      this.pause('Project complete — ready to export .zip');
      this.emitActivity('deployment-engineer', 'cali-director', 'PWA build complete and ready for export!', undefined, 'done');
      return false;
    }

    const profile = storage.loadProfile();
    if (!profile.autoAdvancePhases) {
      this.pause(`Phase ${phase.phase_id} complete — awaiting approval`);
      this.hooks.onStageDecision({
        id: `dec_${Date.now()}`,
        title: `Phase ${phase.phase_id} Complete`,
        detail: gate.reasoning,
        recommendedCall: `Advance to Phase ${this.project.current_phase_id}`,
        kind: 'PHASE_GATE',
        approveLabel: `Start Phase ${this.project.current_phase_id}`,
        declineLabel: 'Inspect Files First',
        createdAt: new Date().toISOString()
      });
      return false;
    }
    return true;
  }

  private async invokeWithPool<T>(agentId: AgentId, userPayload: string): Promise<T | null> {
    const def = AGENCY_PROMPTS[agentId];
    for (let attempt = 0; attempt < 4; attempt++) {
      const slot = keyPool.acquireWorkerKey(agentId);
      if (!slot) {
        this.pause('All worker keys cooling down — Watchdog active');
        this.emitActivity('cali-director', undefined, 'All K1-K4 keys busy/cooling. Watchdog probing for recovery...', undefined, 'watchdog');
        keyPool.startWatchdog();
        return null;
      }
      try {
        const res = await callGeminiJson<T>({
          apiKey: slot.key,
          systemInstruction: buildWorkerSystemPrompt(agentId),
          userPayload,
          thinkingLevel: def.thinkingLevel
        });
        keyPool.releaseKey(slot.id);
        return res;
      } catch (err: any) {
        const status = err instanceof GeminiApiError ? err.httpStatus : 500;
        keyPool.reportKeyError(slot.id, status, err?.message || 'Unknown error');
        if (keyPool.areAllWorkersUnavailable()) {
          this.pause('Worker keys offline — Watchdog monitoring');
          keyPool.startWatchdog();
          return null;
        }
      }
    }
    return null;
  }

  private upsertWorkspaceFile(path: string, content: string, agentId: string): void {
    const now = new Date().toISOString();
    const idx = this.files.findIndex((f) => f.path === path);
    const entry: WorkspaceFile = { path, content, updatedBy: agentId, updatedAt: now };
    if (idx >= 0) this.files[idx] = entry;
    else this.files.push(entry);
    storage.saveFiles(this.files);
    this.hooks.onFilesUpdate([...this.files]);
  }

  private emitActivity(
    fromAgent: AgentId,
    toAgent: AgentId | undefined,
    summary: string,
    keyId: any,
    status: AgencyActivity['status']
  ): void {
    this.hooks.onActivity({
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      fromAgent,
      toAgent,
      summary,
      keyId,
      status
    });
  }
}
