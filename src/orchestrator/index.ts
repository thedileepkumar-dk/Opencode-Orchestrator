import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { TaskDecomposer } from './decomposer.js';
import { AgentRouter } from './router.js';
import { MessageBus } from './message-bus.js';
import { ConflictResolver } from './conflict-resolver.js';
import { SelfHealing } from './self-healing.js';
import type {
  TaskPlan,
  SubTask,
  TaskStatus,
  TaskResult,
  OrchestratorMode,
  AgentProfile,
  TaskDomain,
  SessionState,
  MessageType,
  TaskPriority,
  ModelTier,
} from './types.js';

export { TaskDecomposer } from './decomposer.js';
export { AgentRouter } from './router.js';
export { MessageBus } from './message-bus.js';
export { ConflictResolver } from './conflict-resolver.js';
export { SelfHealing } from './self-healing.js';
export type * from './types.js';

interface OrchestratorOptions {
  mode?: OrchestratorMode;
  maxConcurrentTasks?: number;
  healingEnabled?: boolean;
  healingMaxRetries?: number;
  autoRegisterAgents?: boolean;
  executeCommand?: (command: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  onTaskExecute?: (task: SubTask) => Promise<TaskResult>;
  onProgress?: (session: SessionState) => void;
}

interface AgentExecutor {
  domain: TaskDomain;
  execute: (task: SubTask, context: OrchestratorContext) => Promise<TaskResult>;
}

interface OrchestratorContext {
  plan: TaskPlan;
  session: SessionState;
  allTaskResults: Map<string, TaskResult>;
  messages: MessageBus;
  conflicts: ConflictResolver;
}

export class Orchestrator extends EventEmitter {
  readonly decomposer: TaskDecomposer;
  readonly router: AgentRouter;
  readonly messageBus: MessageBus;
  readonly conflicts: ConflictResolver;
  readonly healing: SelfHealing;

  private sessions = new Map<string, SessionState>();
  private plans = new Map<string, TaskPlan>();
  private executors = new Map<TaskDomain, AgentExecutor>();
  private defaultExecutor: AgentExecutor | null = null;
  private options: OrchestratorOptions;
  private activePromises = new Map<string, Promise<TaskResult>>();

  constructor(options: OrchestratorOptions = {}) {
    super();
    this.options = options;
    this.decomposer = new TaskDecomposer();
    this.router = new AgentRouter();
    this.messageBus = new MessageBus();
    this.conflicts = new ConflictResolver();
    this.healing = new SelfHealing({
      maxRetries: options.healingMaxRetries ?? 3,
    });

    this.setupEventForwarding();
  }

  async orchestrate(
    userPrompt: string,
    context: Record<string, unknown> = {}
  ): Promise<SessionState> {
    const mode = this.options.mode ?? (context.mode as OrchestratorMode) ?? 'auto-pilot';
    const plan = this.decomposer.decompose(userPrompt, mode);
    this.plans.set(plan.id, plan);

    const session: SessionState = {
      id: `session-${randomUUID().slice(0, 8)}`,
      planId: plan.id,
      mode,
      status: 'initializing',
      startedAt: Date.now(),
      progress: {
        total: plan.subtasks.length,
        completed: 0,
        failed: 0,
        inProgress: 0,
      },
      healingAttempts: [],
      conflicts: [],
    };
    this.sessions.set(session.id, session);

    this.emit('session:created', session);
    this.emit('plan:created', plan);

    session.status = 'running';
    this.emit('session:started', session);

    try {
      const results = await this.executePlan(plan, session, mode);
      const allSucceeded = plan.subtasks.every((t) => t.status === 'completed');

      session.status = allSucceeded ? 'completed' : 'failed';
      session.completedAt = Date.now();
      this.emit('session:completed', { session, results, success: allSucceeded });
      return session;
    } catch (err) {
      session.status = 'failed';
      session.completedAt = Date.now();
      this.emit('session:failed', { session, error: err instanceof Error ? err.message : String(err) });
      return session;
    }
  }

  registerExecutor(executor: AgentExecutor): void {
    this.executors.set(executor.domain, executor);
  }

  setDefaultExecutor(executor: AgentExecutor): void {
    this.defaultExecutor = executor;
  }

  registerAgent(profile: AgentProfile): void {
    this.router.registerAgent(profile);
  }

  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  getPlan(planId: string): TaskPlan | undefined {
    return this.plans.get(planId);
  }

  getAllSessions(): SessionState[] {
    return [...this.sessions.values()];
  }

  async pauseSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session && session.status === 'running') {
      session.status = 'paused';
      this.emit('session:paused', session);
    }
  }

  async resumeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session && session.status === 'paused') {
      session.status = 'running';
      this.emit('session:resumed', session);
      const plan = this.plans.get(session.planId);
      if (plan) {
        await this.executePlan(plan, session, session.mode);
      }
    }
  }

  destroy(): void {
    this.messageBus.destroy();
    this.conflicts.destroy();
    this.removeAllListeners();
  }

  private async executePlan(
    plan: TaskPlan,
    session: SessionState,
    mode: OrchestratorMode
  ): Promise<Map<string, TaskResult>> {
    const results = new Map<string, TaskResult>();
    const context: OrchestratorContext = {
      plan,
      session,
      allTaskResults: results,
      messages: this.messageBus,
      conflicts: this.conflicts,
    };

    switch (mode) {
      case 'auto-pilot':
        await this.executeAutoPilot(plan, session, context, results);
        break;
      case 'supervised':
        await this.executeSupervised(plan, session, context, results);
        break;
      case 'specialist':
        await this.executeSpecialist(plan, session, context, results);
        break;
      case 'swarm':
        await this.executeSwarm(plan, session, context, results);
        break;
      case 'review-crew':
        await this.executeReviewCrew(plan, session, context, results);
        break;
    }

    return results;
  }

  private async executeAutoPilot(
    plan: TaskPlan,
    session: SessionState,
    context: OrchestratorContext,
    results: Map<string, TaskResult>
  ): Promise<void> {
    for (const wave of plan.executionOrder) {
      const wavePromises = wave.map(async (taskId) => {
        const task = plan.subtasks.find((t) => t.id === taskId);
        if (!task) return;

        await this.waitForDependencies(task, results);

        task.status = 'assigned';
        task.assignedAgent = this.routeAndAssignAgent(task);
        session.progress.inProgress++;
        this.updateProgress(session);

        this.messageBus.send('TASK_ASSIGN', 'orchestrator', task.assignedAgent, {
          taskId: task.id,
          description: task.description,
          domain: task.domain,
        }, { priority: task.priority });

        const result = await this.executeSingleTask(task, context);
        results.set(task.id, result);
        this.finalizeTask(task, result, session);
      });

      if (this.options.maxConcurrentTasks && this.options.maxConcurrentTasks > 1) {
        const chunks = this.chunkArray(wavePromises, this.options.maxConcurrentTasks);
        for (const chunk of chunks) {
          await Promise.allSettled(chunk);
        }
      } else {
        await Promise.allSettled(wavePromises);
      }
    }
  }

  private async executeSupervised(
    plan: TaskPlan,
    session: SessionState,
    context: OrchestratorContext,
    results: Map<string, TaskResult>
  ): Promise<void> {
    for (const task of plan.subtasks) {
      await this.waitForDependencies(task, results);

      task.status = 'assigned';
      task.assignedAgent = this.routeAndAssignAgent(task);
      session.progress.inProgress++;
      this.updateProgress(session);

      this.emit('task:approval-needed', { task, session });

      const result = await this.executeSingleTask(task, context);
      results.set(task.id, result);

      this.emit('task:review-needed', { task, result, session });

      this.finalizeTask(task, result, session);
    }
  }

  private async executeSpecialist(
    plan: TaskPlan,
    session: SessionState,
    context: OrchestratorContext,
    results: Map<string, TaskResult>
  ): Promise<void> {
    const domainGroups = new Map<TaskDomain, SubTask[]>();
    for (const task of plan.subtasks) {
      if (!domainGroups.has(task.domain)) domainGroups.set(task.domain, []);
      domainGroups.get(task.domain)!.push(task);
    }

    for (const [domain, tasks] of domainGroups) {
      for (const task of tasks) {
        await this.waitForDependencies(task, results);

        task.status = 'assigned';
        task.assignedAgent = this.routeAndAssignAgent(task, domain);
        session.progress.inProgress++;
        this.updateProgress(session);

        const result = await this.executeSingleTask(task, context);
        results.set(task.id, result);
        this.finalizeTask(task, result, session);
      }
    }
  }

  private async executeSwarm(
    plan: TaskPlan,
    session: SessionState,
    context: OrchestratorContext,
    results: Map<string, TaskResult>
  ): Promise<void> {
    const allPromises: Promise<void>[] = [];

    for (const task of plan.subtasks) {
      const promise = (async () => {
        task.status = 'assigned';
        task.assignedAgent = this.routeAndAssignAgent(task);
        session.progress.inProgress++;
        this.updateProgress(session);

        const result = await this.executeSingleTask(task, context);
        results.set(task.id, result);
        this.finalizeTask(task, result, session);
      })();

      allPromises.push(promise);
    }

    await Promise.allSettled(allPromises);
  }

  private async executeReviewCrew(
    plan: TaskPlan,
    session: SessionState,
    context: OrchestratorContext,
    results: Map<string, TaskResult>
  ): Promise<void> {
    for (const task of plan.subtasks) {
      await this.waitForDependencies(task, results);

      task.status = 'assigned';
      task.assignedAgent = this.routeAndAssignAgent(task);
      session.progress.inProgress++;
      this.updateProgress(session);

      const primaryResult = await this.executeSingleTask(task, context);

      const reviewTask = { ...task, id: `${task.id}-review`, domain: 'general' as TaskDomain };
      const reviewAgent = this.routeAndAssignAgent(reviewTask);
      this.messageBus.send('TASK_ASSIGN', 'orchestrator', reviewAgent, {
        taskId: reviewTask.id,
        originalTaskId: task.id,
        description: `Review the following changes:\n${primaryResult.output}`,
        filesModified: primaryResult.filesModified,
      }, { priority: 'medium' });

      this.messageBus.send('CONTEXT_SHARE', task.assignedAgent!, reviewAgent, {
        taskId: task.id,
        result: primaryResult,
      }, { correlationId: task.id });

      results.set(task.id, primaryResult);
      this.finalizeTask(task, primaryResult, session);
    }
  }

  private async executeSingleTask(task: SubTask, context: OrchestratorContext): Promise<TaskResult> {
    const startTime = Date.now();

    try {
      if (task.assignedAgent) {
        this.router.updateAgentAvailability(task.assignedAgent, true);
      }

      let result: TaskResult;

      if (this.options.onTaskExecute) {
        result = await this.options.onTaskExecute(task);
      } else {
        const executor = this.executors.get(task.domain) || this.defaultExecutor;
        if (executor) {
          result = await executor.execute(task, context);
        } else {
          result = {
            success: false,
            filesModified: [],
            output: '',
            errors: [`No executor registered for domain: ${task.domain}`],
            duration: Date.now() - startTime,
            tokenUsage: { input: 0, output: 0 },
          };
        }
      }

      if (task.assignedAgent) {
        this.router.recordTaskComplete(task.assignedAgent, result.success, result.duration);
      }

      if (!result.success && this.options.healingEnabled !== false && this.options.executeCommand) {
        this.emit('healing:triggered', { task, result });

        const errorResult = {
          passed: false,
          totalTests: 1,
          passedTests: 0,
          failedTests: 1,
          errors: result.errors.map((e) => ({
            file: 'unknown',
            line: 0,
            column: 0,
            message: e,
            severity: 'error' as const,
          })),
          duration: result.duration,
          rawOutput: result.output,
        };

        const healingResult = await this.healing.heal(
          task,
          errorResult,
          async (t, errorContext) => {
            this.messageBus.send('TASK_ASSIGN', 'orchestrator', t.assignedAgent || 'default', {
              taskId: t.id,
              description: `${t.description}\n\nPrevious errors:\n${errorContext}`,
              isRetry: true,
            }, { priority: 'high' as TaskPriority });

            const executor = this.executors.get(t.domain) || this.defaultExecutor;
            if (executor) return executor.execute(t, context);
            return {
              success: false,
              filesModified: [],
              output: '',
              errors: ['No executor available for retry'],
              duration: 0,
              tokenUsage: { input: 0, output: 0 },
            };
          },
          this.options.executeCommand
        );

        if (healingResult.success) {
          const newResult = await this.reExecute(task, context);
          if (newResult) return newResult;
        }

        if (healingResult.escalated) {
          this.messageBus.send('ESCALATE', 'orchestrator', '*', {
            taskId: task.id,
            reason: 'healing-exhausted',
            attempts: healingResult.totalAttempts,
            finalError: healingResult.finalError,
          }, { priority: 'critical' });
        }
      }

      return result;
    } catch (err) {
      if (task.assignedAgent) {
        this.router.recordTaskComplete(task.assignedAgent, false, Date.now() - startTime);
      }
      return {
        success: false,
        filesModified: [],
        output: '',
        errors: [err instanceof Error ? err.message : String(err)],
        duration: Date.now() - startTime,
        tokenUsage: { input: 0, output: 0 },
      };
    }
  }

  private async reExecute(task: SubTask, context: OrchestratorContext): Promise<TaskResult | null> {
    const executor = this.executors.get(task.domain) || this.defaultExecutor;
    if (!executor) return null;
    try {
      return await executor.execute(task, context);
    } catch {
      return null;
    }
  }

  private waitForDependencies(task: SubTask, results: Map<string, TaskResult>): Promise<void> {
    const blockingDeps = task.dependencies.filter((d) => d.type === 'blocks');
    if (blockingDeps.length === 0) return Promise.resolve();

    return new Promise<void>((resolve) => {
      const check = () => {
        const allDone = blockingDeps.every((dep) => {
          const r = results.get(dep.taskId);
          return r !== undefined;
        });
        if (allDone) {
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  }

  private routeAndAssignAgent(task: SubTask, forcedDomain?: TaskDomain): string {
    const routingTask = forcedDomain ? { ...task, domain: forcedDomain } : task;
    const decision = this.router.routeTask(routingTask);
    task.assignedAgent = decision.agentId;
    return decision.agentId;
  }

  private finalizeTask(task: SubTask, result: TaskResult, session: SessionState): void {
    task.status = result.success ? 'completed' : 'failed';
    task.result = result;
    task.updatedAt = Date.now();

    if (result.success) {
      session.progress.completed++;
    } else {
      session.progress.failed++;
    }
    session.progress.inProgress = Math.max(0, session.progress.inProgress - 1);

    for (const file of result.filesModified) {
      if (this.conflicts.detectConflict(file)) {
        this.messageBus.send('MERGE_REQUEST', 'orchestrator', '*', {
          filePath: file,
          conflictingAgents: task.assignedAgent,
        }, { priority: 'high' });
      }
    }

    this.updateProgress(session);

    this.messageBus.send(
      result.success ? 'TASK_COMPLETE' : 'TASK_FAILED',
      task.assignedAgent || 'unknown',
      'orchestrator',
      {
        taskId: task.id,
        result,
      },
      { priority: result.success ? 'medium' : 'high' }
    );
  }

  private updateProgress(session: SessionState): void {
    if (this.options.onProgress) {
      this.options.onProgress(session);
    }
    this.emit('session:progress', session);
  }

  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  private setupEventForwarding(): void {
    this.router.on('agent:registered', (p) => this.emit('agent:registered', p));
    this.router.on('agent:cooldown', (p) => this.emit('agent:cooldown', p));
    this.router.on('task:routed', (p) => this.emit('task:routed', p));

    this.messageBus.on('message:delivered', (p) => this.emit('message:delivered', p));
    this.messageBus.on('message:failed', (p) => this.emit('message:failed', p));

    this.conflicts.on('lock:acquired', (p) => this.emit('lock:acquired', p));
    this.conflicts.on('lock:denied', (p) => this.emit('lock:denied', p));
    this.conflicts.on('conflict:resolved', (p) => this.emit('conflict:resolved', p));

    this.healing.on('heal:attempt', (p) => this.emit('healing:attempt', p));
    this.healing.on('heal:success', (p) => this.emit('healing:success', p));
    this.healing.on('heal:escalated', (p) => this.emit('healing:escalated', p));
  }
}
