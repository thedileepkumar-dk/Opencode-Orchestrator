import { EventEmitter } from 'events';

// ============================================================
// ENUMS
// ============================================================

export enum TaskStatus {
  Pending = 'pending',
  Assigned = 'assigned',
  InProgress = 'in_progress',
  Completed = 'completed',
  Failed = 'failed',
  Blocked = 'blocked',
  Escalated = 'escalated',
  Merged = 'merged',
  Cancelled = 'cancelled',
}

export enum AgentStatus {
  Idle = 'idle',
  Busy = 'busy',
  Offline = 'offline',
  Error = 'error',
  Initializing = 'initializing',
}

export enum MessagePriority {
  Critical = 'critical',
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}

export enum OrchestratorMode {
  AutoPilot = 'auto-pilot',
  Supervised = 'supervised',
  Specialist = 'specialist',
  Swarm = 'swarm',
  ReviewCrew = 'review-crew',
}

export enum TaskDomain {
  Frontend = 'frontend',
  Backend = 'backend',
  Database = 'database',
  DevOps = 'devops',
  Security = 'security',
  Testing = 'testing',
  Docs = 'docs',
  UIUX = 'uiux',
  Performance = 'performance',
  Refactor = 'refactor',
  ML = 'ml',
  Mobile = 'mobile',
  General = 'general',
}

export enum ModelTier {
  Cheap = 'cheap',
  Standard = 'standard',
  Powerful = 'powerful',
  Reasoning = 'reasoning',
}

export enum MessageType {
  TaskAssign = 'TASK_ASSIGN',
  TaskComplete = 'TASK_COMPLETE',
  TaskFailed = 'TASK_FAILED',
  ContextShare = 'CONTEXT_SHARE',
  Escalate = 'ESCALATE',
  MergeRequest = 'MERGE_REQUEST',
  Heartbeat = 'HEARTBEAT',
  LockRequest = 'LOCK_REQUEST',
  LockRelease = 'LOCK_RELEASE',
  Rollback = 'ROLLBACK',
  Discovery = 'DISCOVERY',
  CapabilityAnnounce = 'CAPABILITY_ANNOUNCE',
}

export enum IndexSymbolKind {
  Function = 'function',
  Class = 'class',
  Interface = 'interface',
  Type = 'type',
  Import = 'import',
  Export = 'export',
  Variable = 'variable',
  Enum = 'enum',
  Module = 'module',
  Method = 'method',
  Property = 'property',
  Decorator = 'decorator',
}

export enum LogSeverity {
  Debug = 'debug',
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
}

// ============================================================
// TASK TYPES
// ============================================================

export interface TaskDependency {
  taskId: string;
  type: 'blocks' | 'soft' | 'data';
}

export interface TaskResult {
  success: boolean;
  filesModified: string[];
  output: string;
  errors: string[];
  duration: number;
  tokenUsage: { input: number; output: number };
}

export interface SubTask {
  id: string;
  title: string;
  description: string;
  domain: TaskDomain;
  priority: MessagePriority;
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

// ============================================================
// AGENT TYPES
// ============================================================

export interface AgentCapability {
  name: string;
  domain: TaskDomain;
  languages: string[];
  frameworks: string[];
  description: string;
  confidence: number;
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
  status: AgentStatus;
  lastActiveAt: number;
}

export interface AgentResult {
  agentId: string;
  taskId: string;
  success: boolean;
  output: string;
  filesModified: string[];
  errors: string[];
  warnings: string[];
  duration: number;
  tokenUsage: { input: number; output: number };
  metadata: Record<string, unknown>;
  completedAt: number;
}

export interface AgentMessage {
  id: string;
  type: MessageType;
  from: string;
  to: string | '*';
  priority: MessagePriority;
  payload: Record<string, unknown>;
  timestamp: number;
  correlationId?: string;
  delivered: boolean;
  acknowledged: boolean;
}

// ============================================================
// INDEXER TYPES
// ============================================================

export interface IndexSymbol {
  name: string;
  kind: IndexSymbolKind;
  file: string;
  line: number;
  endLine: number;
  column: number;
  endColumn: number;
  signature?: string;
  docstring?: string;
  scope: string;
  references: SymbolReference[];
  exports: boolean;
}

export interface SymbolReference {
  file: string;
  line: string;
  lineNum: number;
  context: string;
}

export interface IndexResult {
  file: string;
  language: string;
  symbols: IndexSymbol[];
  imports: ImportStatement[];
  exports: ExportStatement[];
  dependencies: string[];
  errors: string[];
  parseTime: number;
  indexedAt: number;
}

export interface ImportStatement {
  source: string;
  specifiers: string[];
  isDefault: boolean;
  isNamespace: boolean;
  isDynamic: boolean;
  line: number;
  file: string;
}

export interface ExportStatement {
  name: string;
  isDefault: boolean;
  isReExport: boolean;
  source?: string;
  line: number;
  file: string;
}

export interface CodeChunk {
  id: string;
  content: string;
  file: string;
  startLine: number;
  endLine: number;
  kind: IndexSymbolKind;
  symbolName: string;
  embedding?: number[];
  metadata: Record<string, unknown>;
}

export interface VectorSearchResult {
  chunk: CodeChunk;
  score: number;
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: 'import' | 'call' | 'extends' | 'implements' | 'uses' | 'contains';
  file: string;
  line: number;
}

export interface DependencyNode {
  id: string;
  name: string;
  file: string;
  kind: IndexSymbolKind;
  incoming: string[];
  outgoing: string[];
}

export interface ImpactAnalysis {
  target: string;
  directDependents: string[];
  transitiveDependents: string[];
  directDependencies: string[];
  transitiveDependencies: string[];
  affectedFiles: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

// ============================================================
// MEMORY TYPES
// ============================================================

export interface MemoryEntry {
  id: string;
  key: string;
  value: string;
  namespace: string;
  tags: string[];
  embedding?: number[];
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  accessCount: number;
  lastAccessedAt: number;
  metadata: Record<string, unknown>;
}

export interface SessionMemory {
  sessionId: string;
  decisions: Decision[];
  modifiedFiles: ModifiedFile[];
  agentOutputs: AgentOutputRecord[];
  contextChunks: string[];
  summary: string;
  createdAt: number;
  updatedAt: number;
}

export interface Decision {
  id: string;
  description: string;
  rationale: string;
  alternatives: string[];
  madeAt: number;
  madeBy: string;
  relatedFiles: string[];
}

export interface ModifiedFile {
  path: string;
  action: 'created' | 'modified' | 'deleted' | 'renamed';
  previousPath?: string;
  modifiedBy: string;
  modifiedAt: number;
  diffSummary: string;
}

export interface AgentOutputRecord {
  agentId: string;
  taskId: string;
  output: string;
  timestamp: number;
  tokenUsage: { input: number; output: number };
}

// ============================================================
// PROJECT / FRAMEWORK DETECTION
// ============================================================

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

// ============================================================
// ORCHESTRATOR / SESSION
// ============================================================

export interface OrchestratorConfig {
  mode: OrchestratorMode;
  maxAgents: number;
  maxConcurrentTasks: number;
  defaultModelTier: ModelTier;
  projectRoot: string;
  workingBranch: string;
  useWorktrees: boolean;
  autoMerge: boolean;
  requireApproval: boolean;
  logLevel: LogSeverity;
  indexOnStart: boolean;
  watchFiles: boolean;
  memoryTTL: number;
  sessionTimeout: number;
  mcpServers: MCPServerConfig[];
  agentOverrides: Record<string, Partial<AgentProfile>>;
  excludePatterns: string[];
  includePatterns: string[];
}

export interface MCPServerConfig {
  name: string;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  transport: 'stdio' | 'sse' | 'websocket';
  timeout: number;
  capabilities: string[];
}

export interface Session {
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
  config: OrchestratorConfig;
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

export interface ConflictResolution {
  filePath: string;
  agents: string[];
  strategy: 'merge' | 'ours' | 'theirs' | 'manual';
  resolved: boolean;
  mergedContent?: string;
  backupContent: string;
}

export interface FileLock {
  filePath: string;
  agentId: string;
  acquiredAt: number;
  expiresAt: number;
}

// ============================================================
// PROCESS TYPES
// ============================================================

export interface ProcessOptions {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  timeout?: number;
  maxBuffer?: number;
  stdin?: string;
}

export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  killed: boolean;
}

export interface SpawnedProcess {
  pid: number;
  kill: (signal?: NodeJS.Signals) => boolean;
  promise: Promise<ProcessResult>;
  stdout: AsyncIterable<string>;
  stderr: AsyncIterable<string>;
}

// ============================================================
// GIT TYPES
// ============================================================

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  modified: string[];
  untracked: string[];
  deleted: string[];
  renamed: Array<{ from: string; to: string }>;
  conflicted: string[];
}

export interface GitDiff {
  file: string;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  binary: boolean;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

export interface PRConfig {
  title: string;
  body: string;
  head: string;
  base: string;
  draft: boolean;
  reviewers?: string[];
  labels?: string[];
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
  locked: boolean;
}
