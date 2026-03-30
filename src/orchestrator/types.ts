import { EventEmitter } from 'events';

export type TaskDomain =
  | 'frontend'
  | 'backend'
  | 'database'
  | 'devops'
  | 'security'
  | 'testing'
  | 'docs'
  | 'uiux'
  | 'performance'
  | 'refactor'
  | 'ml'
  | 'mobile'
  | 'general';

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export type TaskStatus =
  | 'pending'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'escalated'
  | 'merged';

export type OrchestratorMode =
  | 'auto-pilot'
  | 'supervised'
  | 'specialist'
  | 'swarm'
  | 'review-crew';

export type ModelTier = 'cheap' | 'standard' | 'powerful' | 'reasoning';

export interface FrameworkDetection {
  name: string;
  version?: string;
  confidence: number;
  configFiles: string[];
}

export interface LanguageDetection {
  language: string;
  confidence: number;
  files: string[];
}

export interface TaskDependency {
  taskId: string;
  type: 'blocks' | 'soft' | 'data';
}

export interface SubTask {
  id: string;
  title: string;
  description: string;
  domain: TaskDomain;
  priority: TaskPriority;
  status: TaskStatus;
  assignedAgent?: string;
  dependencies: TaskDependency[];
  filesToModify: string[];
  estimatedComplexity: number;
  requiredModelTier: ModelTier;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  result?: TaskResult;
}

export interface TaskResult {
  success: boolean;
  filesModified: string[];
  output: string;
  errors: string[];
  duration: number;
  tokenUsage: { input: number; output: number };
}

export interface TaskPlan {
  id: string;
  originalPrompt: string;
  subtasks: SubTask[];
  detectedFrameworks: FrameworkDetection[];
  detectedLanguages: LanguageDetection[];
  executionOrder: string[][];
  mode: OrchestratorMode;
  createdAt: number;
}

export interface AgentProfile {
  id: string;
  name: string;
  domain: TaskDomain;
  capabilities: string[];
  modelTier: ModelTier;
  maxConcurrentTasks: number;
  currentTasks: number;
  successRate: number;
  totalTasks: number;
  averageDuration: number;
  available: boolean;
  lastActiveAt: number;
}

export interface AgentMessage {
  id: string;
  type: MessageType;
  from: string;
  to: string | '*';
  priority: TaskPriority;
  payload: Record<string, unknown>;
  timestamp: number;
  correlationId?: string;
  delivered: boolean;
  acknowledged: boolean;
}

export type MessageType =
  | 'TASK_ASSIGN'
  | 'TASK_COMPLETE'
  | 'TASK_FAILED'
  | 'CONTEXT_SHARE'
  | 'ESCALATE'
  | 'MERGE_REQUEST'
  | 'HEARTBEAT'
  | 'LOCK_REQUEST'
  | 'LOCK_RELEASE'
  | 'ROLLBACK';

export interface FileLock {
  filePath: string;
  agentId: string;
  acquiredAt: number;
  expiresAt: number;
}

export interface ConflictResolution {
  filePath: string;
  agents: string[];
  strategy: 'merge' | 'ours' | 'theirs' | 'manual';
  resolved: boolean;
  mergedContent?: string;
  backupContent: string;
}

export interface HealingAttempt {
  taskId: string;
  agentId: string;
  attemptNumber: number;
  error: string;
  fixApplied: string;
  success: boolean;
  timestamp: number;
}

export interface SessionState {
  id: string;
  planId: string;
  mode: OrchestratorMode;
  status: 'initializing' | 'running' | 'paused' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
  progress: {
    total: number;
    completed: number;
    failed: number;
    inProgress: number;
  };
  healingAttempts: HealingAttempt[];
  conflicts: ConflictResolution[];
}
