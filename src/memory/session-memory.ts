import * as crypto from 'crypto';
import {
  SessionMemory,
  Decision,
  ModifiedFile,
  AgentOutputRecord,
} from '../protocol/types.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ scope: 'session-memory' });

// ============================================================
// CONTEXT WINDOW MANAGEMENT
// ============================================================

interface ContextWindow {
  maxSize: number;
  currentSize: number;
  entries: ContextEntry[];
}

interface ContextEntry {
  id: string;
  content: string;
  size: number;
  priority: number;
  timestamp: number;
  type: 'decision' | 'output' | 'file' | 'summary' | 'context';
}

// ============================================================
// SESSION MEMORY
// ============================================================

export interface SessionMemoryOptions {
  sessionId: string;
  maxContextSize?: number;
  summarizeThreshold?: number;
}

export class SessionMemoryManager {
  private sessionId: string;
  private decisions: Map<string, Decision> = new Map();
  private modifiedFiles: Map<string, ModifiedFile> = new Map();
  private agentOutputs: Map<string, AgentOutputRecord> = new Map();
  private contextChunks: string[] = [];
  private summary = '';
  private contextWindow: ContextWindow;
  private summarizeThreshold: number;
  private createdAt: number;
  private updatedAt: number;

  constructor(options: SessionMemoryOptions) {
    this.sessionId = options.sessionId;
    this.summarizeThreshold = options.summarizeThreshold ?? 8000;
    this.contextWindow = {
      maxSize: options.maxContextSize ?? 16000,
      currentSize: 0,
      entries: [],
    };
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;

    logger.info(`Session memory created: ${this.sessionId}`);
  }

  // ============================================================
  // DECISIONS
  // ============================================================

  addDecision(
    description: string,
    rationale: string,
    alternatives: string[] = [],
    madeBy = 'orchestrator',
    relatedFiles: string[] = []
  ): Decision {
    const decision: Decision = {
      id: crypto.randomUUID(),
      description,
      rationale,
      alternatives,
      madeAt: Date.now(),
      madeBy,
      relatedFiles,
    };

    this.decisions.set(decision.id, decision);
    this.addToContextWindow({
      id: decision.id,
      content: `[Decision] ${description}: ${rationale}`,
      size: decision.description.length + decision.rationale.length,
      priority: 8,
      timestamp: decision.madeAt,
      type: 'decision',
    });

    this.touch();
    return decision;
  }

  getDecisions(): Decision[] {
    return Array.from(this.decisions.values()).sort((a, b) => b.madeAt - a.madeAt);
  }

  getDecisionsForFile(file: string): Decision[] {
    return this.getDecisions().filter((d) => d.relatedFiles.includes(file));
  }

  // ============================================================
  // MODIFIED FILES
  // ============================================================

  trackFileModification(
    path: string,
    action: ModifiedFile['action'],
    modifiedBy: string,
    diffSummary: string,
    previousPath?: string
  ): ModifiedFile {
    const entry: ModifiedFile = {
      path,
      action,
      previousPath,
      modifiedBy,
      modifiedAt: Date.now(),
      diffSummary,
    };

    this.modifiedFiles.set(path, entry);
    this.addToContextWindow({
      id: `file:${path}`,
      content: `[File ${action}] ${path} by ${modifiedBy}: ${diffSummary}`,
      size: path.length + diffSummary.length,
      priority: 7,
      timestamp: entry.modifiedAt,
      type: 'file',
    });

    this.touch();
    return entry;
  }

  getModifiedFiles(): ModifiedFile[] {
    return Array.from(this.modifiedFiles.values()).sort((a, b) => b.modifiedAt - a.modifiedAt);
  }

  getFilesModifiedBy(agentId: string): ModifiedFile[] {
    return this.getModifiedFiles().filter((f) => f.modifiedBy === agentId);
  }

  // ============================================================
  // AGENT OUTPUTS
  // ============================================================

  recordAgentOutput(agentId: string, taskId: string, output: string, tokenUsage: { input: number; output: number }): AgentOutputRecord {
    const record: AgentOutputRecord = {
      agentId,
      taskId,
      output,
      timestamp: Date.now(),
      tokenUsage,
    };

    const key = `${agentId}:${taskId}`;
    this.agentOutputs.set(key, record);

    // Summarize long outputs to save space
    const truncated = output.length > 500 ? output.slice(0, 500) + '...' : output;
    this.addToContextWindow({
      id: `output:${key}`,
      content: `[Agent ${agentId} / Task ${taskId}] ${truncated}`,
      size: truncated.length,
      priority: 5,
      timestamp: record.timestamp,
      type: 'output',
    });

    this.touch();
    return record;
  }

  getAgentOutputs(agentId?: string): AgentOutputRecord[] {
    const all = Array.from(this.agentOutputs.values());
    if (agentId) return all.filter((o) => o.agentId === agentId);
    return all.sort((a, b) => b.timestamp - a.timestamp);
  }

  getOutputsForTask(taskId: string): AgentOutputRecord[] {
    return Array.from(this.agentOutputs.values()).filter((o) => o.taskId === taskId);
  }

  // ============================================================
  // CONTEXT CHUNKS
  // ============================================================

  addContextChunk(chunk: string): void {
    this.contextChunks.push(chunk);
    this.addToContextWindow({
      id: `ctx:${this.contextChunks.length}`,
      content: chunk,
      size: chunk.length,
      priority: 3,
      timestamp: Date.now(),
      type: 'context',
    });
    this.touch();
  }

  getContextChunks(): string[] {
    return [...this.contextChunks];
  }

  // ============================================================
  // CONTEXT WINDOW MANAGEMENT
  // ============================================================

  private addToContextWindow(entry: ContextEntry): void {
    this.contextWindow.entries.push(entry);
    this.contextWindow.currentSize += entry.size;

    if (this.contextWindow.currentSize > this.contextWindow.maxSize) {
      this.evict();
    }

    if (this.contextWindow.currentSize > this.summarizeThreshold) {
      this.summarize();
    }
  }

  private evict(): void {
    // Sort by priority (low first) then by timestamp (oldest first)
    this.contextWindow.entries.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.timestamp - b.timestamp;
    });

    while (
      this.contextWindow.currentSize > this.contextWindow.maxSize * 0.8 &&
      this.contextWindow.entries.length > 0
    ) {
      const removed = this.contextWindow.entries.shift()!;
      this.contextWindow.currentSize -= removed.size;
    }
  }

  private summarize(): void {
    const entries = this.contextWindow.entries;
    if (entries.length < 5) return;

    // Group by type
    const byType: Map<string, ContextEntry[]> = new Map();
    for (const entry of entries) {
      const group = byType.get(entry.type) || [];
      group.push(entry);
      byType.set(entry.type, group);
    }

    const summaryParts: string[] = [];

    if (byType.has('decision')) {
      const decisions = byType.get('decision')!;
      summaryParts.push(`${decisions.length} decisions made`);
    }

    if (byType.has('file')) {
      const files = byType.get('file')!;
      const actions = new Map<string, number>();
      for (const f of files) {
        const action = f.content.match(/\[File (\w+)\]/)?.[1] || 'unknown';
        actions.set(action, (actions.get(action) || 0) + 1);
      }
      const actionSummary = Array.from(actions.entries()).map(([a, c]) => `${c} ${a}`).join(', ');
      summaryParts.push(`Files: ${actionSummary}`);
    }

    if (byType.has('output')) {
      const outputs = byType.get('output')!;
      summaryParts.push(`${outputs.length} agent outputs recorded`);
    }

    this.summary = `Session ${this.sessionId}: ${summaryParts.join('. ')}.`;

    // Replace old entries with summary
    const recent = entries.slice(-Math.floor(entries.length / 3));
    this.contextWindow.entries = [
      {
        id: 'summary',
        content: this.summary,
        size: this.summary.length,
        priority: 10,
        timestamp: Date.now(),
        type: 'summary',
      },
      ...recent,
    ];

    this.contextWindow.currentSize = this.contextWindow.entries.reduce((sum, e) => sum + e.size, 0);
  }

  // ============================================================
  // QUERY
  // ============================================================

  getContextForPrompt(): string {
    const parts: string[] = [];

    // Summary
    if (this.summary) {
      parts.push(`## Session Summary\n${this.summary}`);
    }

    // Recent decisions
    const recentDecisions = this.getDecisions().slice(0, 5);
    if (recentDecisions.length > 0) {
      parts.push('## Recent Decisions');
      for (const d of recentDecisions) {
        parts.push(`- ${d.description} (by ${d.madeBy}): ${d.rationale}`);
      }
    }

    // Modified files
    const recentFiles = this.getModifiedFiles().slice(0, 10);
    if (recentFiles.length > 0) {
      parts.push('## Modified Files');
      for (const f of recentFiles) {
        parts.push(`- ${f.path} (${f.action} by ${f.modifiedBy})`);
      }
    }

    // Recent context chunks
    if (this.contextChunks.length > 0) {
      parts.push('## Context');
      const recent = this.contextChunks.slice(-5);
      for (const chunk of recent) {
        parts.push(chunk);
      }
    }

    return parts.join('\n\n');
  }

  search(query: string): Array<{ type: string; content: string; score: number }> {
    const lower = query.toLowerCase();
    const results: Array<{ type: string; content: string; score: number }> = [];

    // Search decisions
    for (const d of this.decisions.values()) {
      const text = `${d.description} ${d.rationale}`.toLowerCase();
      const score = this.simpleRelevance(text, lower);
      if (score > 0) {
        results.push({ type: 'decision', content: d.description, score });
      }
    }

    // Search file modifications
    for (const f of this.modifiedFiles.values()) {
      const text = `${f.path} ${f.diffSummary}`.toLowerCase();
      const score = this.simpleRelevance(text, lower);
      if (score > 0) {
        results.push({ type: 'file', content: `${f.path}: ${f.diffSummary}`, score });
      }
    }

    // Search context chunks
    for (const chunk of this.contextChunks) {
      const score = this.simpleRelevance(chunk.toLowerCase(), lower);
      if (score > 0) {
        results.push({ type: 'context', content: chunk.slice(0, 200), score });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, 20);
  }

  private simpleRelevance(text: string, query: string): number {
    const words = query.split(/\s+/).filter(Boolean);
    let score = 0;
    for (const word of words) {
      if (text.includes(word)) score += 1;
    }
    return score / words.length;
  }

  // ============================================================
  // IMPORT / EXPORT
  // ============================================================

  export(): SessionMemory {
    return {
      sessionId: this.sessionId,
      decisions: this.getDecisions(),
      modifiedFiles: this.getModifiedFiles(),
      agentOutputs: this.getAgentOutputs(),
      contextChunks: [...this.contextChunks],
      summary: this.summary,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  import(data: SessionMemory): void {
    this.decisions.clear();
    for (const d of data.decisions) {
      this.decisions.set(d.id, d);
    }

    this.modifiedFiles.clear();
    for (const f of data.modifiedFiles) {
      this.modifiedFiles.set(f.path, f);
    }

    this.agentOutputs.clear();
    for (const o of data.agentOutputs) {
      this.agentOutputs.set(`${o.agentId}:${o.taskId}`, o);
    }

    this.contextChunks = [...data.contextChunks];
    this.summary = data.summary;
    this.updatedAt = Date.now();

    logger.info(`Session memory imported: ${data.decisions.length} decisions, ${data.modifiedFiles.length} files, ${data.agentOutputs.length} outputs`);
  }

  // ============================================================
  // STATS
  // ============================================================

  getStats(): {
    sessionId: string;
    decisions: number;
    modifiedFiles: number;
    agentOutputs: number;
    contextChunks: number;
    contextWindowSize: number;
    contextWindowMax: number;
    age: number;
  } {
    return {
      sessionId: this.sessionId,
      decisions: this.decisions.size,
      modifiedFiles: this.modifiedFiles.size,
      agentOutputs: this.agentOutputs.size,
      contextChunks: this.contextChunks.length,
      contextWindowSize: this.contextWindow.currentSize,
      contextWindowMax: this.contextWindow.maxSize,
      age: Date.now() - this.createdAt,
    };
  }

  clear(): void {
    this.decisions.clear();
    this.modifiedFiles.clear();
    this.agentOutputs.clear();
    this.contextChunks = [];
    this.summary = '';
    this.contextWindow = {
      maxSize: this.contextWindow.maxSize,
      currentSize: 0,
      entries: [],
    };
    this.touch();
  }

  private touch(): void {
    this.updatedAt = Date.now();
  }
}

export default SessionMemoryManager;
