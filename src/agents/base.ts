import {
  AgentStatus,
  AgentCapability,
  AgentTool,
  AgentMetrics,
  AgentConfig,
  TaskContext,
  AnalyzeResult,
  ExecuteResult,
  VerifyResult,
  ToolRegistration,
  Message,
} from './types.js';

export abstract class BaseAgent {
  readonly id: string;
  readonly name: string;
  readonly domain: string;
  readonly version: string;
  readonly capabilities: AgentCapability[];
  readonly tools: AgentTool[];

  private status: AgentStatus = 'idle';
  private metrics: AgentMetrics;
  private config: AgentConfig;
  private toolHandlers: Map<string, ToolRegistration['handler']>;
  private contextBuffer: Map<string, TaskContext>;
  private abortControllers: Map<string, AbortController>;

  constructor(config: AgentConfig) {
    this.id = config.id;
    this.name = config.name;
    this.domain = config.domain;
    this.version = config.version;
    this.config = config;
    this.capabilities = this.defineCapabilities();
    this.tools = this.defineTools();
    this.toolHandlers = new Map();
    this.contextBuffer = new Map();
    this.abortControllers = new Map();
    this.metrics = {
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      totalTokensUsed: 0,
      inputTokens: 0,
      outputTokens: 0,
      averageExecutionTimeMs: 0,
      consecutiveFailures: 0,
      cumulativeExecutionTimeMs: 0,
    };
    this.registerDefaultTools();
  }

  protected abstract defineCapabilities(): AgentCapability[];
  protected abstract defineTools(): AgentTool[];
  abstract getSystemPrompt(): string;

  protected registerDefaultTools(): void {
    this.registerTool(
      {
        name: 'read_file',
        description: 'Read the contents of a file from the workspace',
        parameters: { path: 'string' },
        required: true,
      },
      async (params) => {
        return { path: params.path, content: `/* placeholder for ${params.path} */` };
      }
    );

    this.registerTool(
      {
        name: 'write_file',
        description: 'Write content to a file in the workspace',
        parameters: { path: 'string', content: 'string' },
        required: true,
      },
      async (params) => {
        return { path: params.path, written: true };
      }
    );

    this.registerTool(
      {
        name: 'list_files',
        description: 'List files matching a glob pattern',
        parameters: { pattern: 'string' },
        required: false,
      },
      async (params) => {
        return { pattern: params.pattern, files: [] as string[] };
      }
    );

    this.registerTool(
      {
        name: 'search_content',
        description: 'Search file contents using a regex pattern',
        parameters: { pattern: 'string', include: 'string' },
        required: false,
      },
      async (params) => {
        return { pattern: params.pattern, matches: [] as unknown[] };
      }
    );

    this.registerTool(
      {
        name: 'run_command',
        description: 'Execute a shell command in the workspace',
        parameters: { command: 'string', timeout: 'number' },
        required: true,
      },
      async (params) => {
        return { command: params.command, stdout: '', stderr: '', exitCode: 0 };
      }
    );
  }

  registerTool(tool: AgentTool, handler: ToolRegistration['handler']): void {
    this.toolHandlers.set(tool.name, handler);
  }

  async callTool(name: string, params: Record<string, unknown>): Promise<unknown> {
    const handler = this.toolHandlers.get(name);
    if (!handler) {
      throw new Error(`Tool "${name}" is not registered for agent "${this.id}"`);
    }
    return handler(params);
  }

  getRegisteredTools(): string[] {
    return Array.from(this.toolHandlers.keys());
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  setStatus(status: AgentStatus): void {
    this.status = status;
  }

  isAvailable(): boolean {
    return this.status === 'idle' && this.metrics.consecutiveFailures < 5;
  }

  getMetrics(): Readonly<AgentMetrics> {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      totalTokensUsed: 0,
      inputTokens: 0,
      outputTokens: 0,
      averageExecutionTimeMs: 0,
      consecutiveFailures: 0,
      cumulativeExecutionTimeMs: 0,
    };
  }

  getSuccessRate(): number {
    if (this.metrics.totalTasks === 0) return 1.0;
    return this.metrics.successfulTasks / this.metrics.totalTasks;
  }

  protected updateMetrics(
    success: boolean,
    tokensUsed: number,
    inputTokens: number,
    outputTokens: number,
    executionTimeMs: number
  ): void {
    this.metrics.totalTasks++;
    if (success) {
      this.metrics.successfulTasks++;
      this.metrics.consecutiveFailures = 0;
    } else {
      this.metrics.failedTasks++;
      this.metrics.consecutiveFailures++;
    }
    this.metrics.totalTokensUsed += tokensUsed;
    this.metrics.inputTokens += inputTokens;
    this.metrics.outputTokens += outputTokens;
    this.metrics.cumulativeExecutionTimeMs += executionTimeMs;
    this.metrics.averageExecutionTimeMs =
      this.metrics.cumulativeExecutionTimeMs / this.metrics.totalTasks;
    this.metrics.lastExecutedAt = new Date();
  }

  setContext(taskId: string, context: TaskContext): void {
    this.contextBuffer.set(taskId, context);
  }

  getContext(taskId: string): TaskContext | undefined {
    return this.contextBuffer.get(taskId);
  }

  clearContext(taskId: string): boolean {
    return this.contextBuffer.delete(taskId);
  }

  clearAllContexts(): void {
    this.contextBuffer.clear();
  }

  getActiveContexts(): number {
    return this.contextBuffer.size;
  }

  abort(taskId: string): boolean {
    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(taskId);
      return true;
    }
    return false;
  }

  protected createAbortController(taskId: string): AbortController {
    const controller = new AbortController();
    this.abortControllers.set(taskId, controller);
    return controller;
  }

  protected cleanupAbortController(taskId: string): void {
    this.abortControllers.delete(taskId);
  }

  async analyze(task: TaskContext): Promise<AnalyzeResult> {
    this.setStatus('analyzing');
    const startTime = Date.now();

    try {
      const result = await this.performAnalysis(task);
      const elapsed = Date.now() - startTime;

      this.setStatus('idle');
      return {
        ...result,
        agentId: this.id,
      };
    } catch (error) {
      this.setStatus('error');
      throw error;
    }
  }

  async execute(task: TaskContext): Promise<ExecuteResult> {
    this.setStatus('executing');
    const startTime = Date.now();
    this.setContext(task.taskId, task);
    const controller = this.createAbortController(task.taskId);

    try {
      const result = await this.performExecution(task, controller.signal);
      const executionTimeMs = Date.now() - startTime;

      this.updateMetrics(
        result.success,
        result.tokensUsed,
        0,
        result.tokensUsed,
        executionTimeMs
      );
      this.setStatus('idle');
      this.cleanupAbortController(task.taskId);

      return {
        ...result,
        agentId: this.id,
        taskId: task.taskId,
        executionTimeMs,
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      this.updateMetrics(false, 0, 0, 0, executionTimeMs);
      this.setStatus('error');
      this.cleanupAbortController(task.taskId);
      throw error;
    }
  }

  async verify(result: ExecuteResult): Promise<VerifyResult> {
    this.setStatus('verifying');

    try {
      const verifyResult = await this.performVerification(result);
      this.setStatus('idle');
      return {
        ...verifyResult,
        agentId: this.id,
        taskId: result.taskId,
        verifiedAt: new Date(),
      };
    } catch (error) {
      this.setStatus('error');
      throw error;
    }
  }

  protected abstract performAnalysis(task: TaskContext): Promise<Omit<AnalyzeResult, 'agentId'>>;
  protected abstract performExecution(
    task: TaskContext,
    signal: AbortSignal
  ): Promise<Omit<ExecuteResult, 'agentId' | 'taskId' | 'executionTimeMs'>>;
  protected abstract performVerification(
    result: ExecuteResult
  ): Promise<Omit<VerifyResult, 'agentId' | 'taskId' | 'verifiedAt'>>;

  hasCapability(name: string): boolean {
    return this.capabilities.some((c) => c.name === name);
  }

  getCapabilityConfidence(name: string): number {
    const cap = this.capabilities.find((c) => c.name === name);
    return cap ? cap.confidence : 0;
  }

  canHandleDomain(domain: string): boolean {
    return this.domain === domain || this.domain === 'general';
  }

  getConfig(): Readonly<AgentConfig> {
    return { ...this.config };
  }

  buildMessages(task: TaskContext): Message[] {
    const messages: Message[] = [
      {
        role: 'system',
        content: this.getSystemPrompt(),
        timestamp: new Date(),
      },
    ];

    if (task.conversationHistory) {
      messages.push(...task.conversationHistory);
    }

    messages.push({
      role: 'user',
      content: this.buildTaskPrompt(task),
      timestamp: new Date(),
    });

    return messages;
  }

  protected buildTaskPrompt(task: TaskContext): string {
    const parts: string[] = [];
    parts.push(`## Task: ${task.description}`);
    parts.push(`\nComplexity: ${task.complexity}`);

    if (task.constraints && task.constraints.length > 0) {
      parts.push('\n### Constraints:');
      task.constraints.forEach((c) => parts.push(`- ${c}`));
    }

    if (task.filePaths && task.filePaths.length > 0) {
      parts.push('\n### Relevant Files:');
      task.filePaths.forEach((f) => parts.push(`- ${f}`));
    }

    if (task.codeSnippets) {
      parts.push('\n### Code Context:');
      Object.entries(task.codeSnippets).forEach(([key, value]) => {
        parts.push(`\n**${key}:**\n\`\`\`\n${value}\n\`\`\``);
      });
    }

    return parts.join('\n');
  }

  toJSON(): object {
    return {
      id: this.id,
      name: this.name,
      domain: this.domain,
      version: this.version,
      status: this.status,
      capabilities: this.capabilities.map((c) => c.name),
      tools: this.tools.map((t) => t.name),
      metrics: this.metrics,
    };
  }
}
