export type AgentStatus = 'idle' | 'analyzing' | 'executing' | 'verifying' | 'error' | 'disabled';

export type TaskComplexity = 'trivial' | 'simple' | 'moderate' | 'complex' | 'critical';

export interface AgentCapability {
  name: string;
  description: string;
  confidence: number; // 0.0 - 1.0
  requiredTools?: string[];
}

export interface AgentTool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  required: boolean;
}

export interface TaskContext {
  taskId: string;
  description: string;
  complexity: TaskComplexity;
  domain?: string;
  metadata?: Record<string, unknown>;
  parentTaskId?: string;
  dependencies?: string[];
  filePaths?: string[];
  codeSnippets?: Record<string, string>;
  conversationHistory?: Message[];
  constraints?: string[];
  deadline?: Date;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolName?: string;
  timestamp: Date;
}

export interface AgentMetrics {
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  totalTokensUsed: number;
  inputTokens: number;
  outputTokens: number;
  averageExecutionTimeMs: number;
  lastExecutedAt?: Date;
  consecutiveFailures: number;
  cumulativeExecutionTimeMs: number;
}

export interface AnalyzeResult {
  agentId: string;
  canHandle: boolean;
  confidence: number;
  estimatedComplexity: TaskComplexity;
  estimatedTimeMs: number;
  requiredTools: string[];
  suggestedApproach: string;
  risks: string[];
  dependencies: string[];
  subtasks?: TaskContext[];
}

export interface ExecuteResult {
  agentId: string;
  taskId: string;
  success: boolean;
  output: string;
  artifacts: Artifact[];
  tokensUsed: number;
  executionTimeMs: number;
  warnings: string[];
  errors: string[];
  metadata?: Record<string, unknown>;
}

export interface VerifyResult {
  agentId: string;
  taskId: string;
  passed: boolean;
  score: number; // 0.0 - 1.0
  issues: VerifyIssue[];
  suggestions: string[];
  verifiedAt: Date;
}

export interface VerifyIssue {
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  location?: string;
  fix?: string;
}

export interface Artifact {
  type: 'file' | 'snippet' | 'diagram' | 'config' | 'test' | 'documentation';
  name: string;
  content: string;
  language?: string;
  path?: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  domain: string;
  version: string;
  maxConcurrentTasks: number;
  timeoutMs: number;
  retryAttempts: number;
  modelPreference?: string;
  temperature?: number;
}

export interface ToolRegistration {
  tool: AgentTool;
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}
