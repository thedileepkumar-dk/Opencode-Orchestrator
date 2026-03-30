import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  FileLock,
  ConflictResolution,
} from './types.js';

interface FileVersion {
  agentId: string;
  content: string;
  timestamp: number;
  hash: string;
}

interface MergeResult {
  success: boolean;
  mergedContent: string;
  conflicts: string[];
}

interface RollbackEntry {
  id: string;
  filePath: string;
  previousContent: string;
  newContent: string;
  agentId: string;
  timestamp: number;
}

function computeHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const ch = content.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return hash.toString(16);
}

function diff3Merge(base: string, ours: string, theirs: string): MergeResult {
  const baseLines = base.split('\n');
  const oursLines = ours.split('\n');
  const theirsLines = theirs.split('\n');

  const conflicts: string[] = [];
  const merged: string[] = [];
  const maxLen = Math.max(baseLines.length, oursLines.length, theirsLines.length);

  let i = 0;
  while (i < maxLen) {
    const baseLine = i < baseLines.length ? baseLines[i] : undefined;
    const oursLine = i < oursLines.length ? oursLines[i] : undefined;
    const theirsLine = i < theirsLines.length ? theirsLines[i] : undefined;

    if (oursLine === theirsLine) {
      if (oursLine !== undefined) merged.push(oursLine);
    } else if (oursLine === baseLine) {
      if (theirsLine !== undefined) merged.push(theirsLine);
    } else if (theirsLine === baseLine) {
      if (oursLine !== undefined) merged.push(oursLine);
    } else {
      if (oursLine !== undefined && theirsLine !== undefined) {
        conflicts.push(`Conflict at line ${i + 1}`);
        merged.push(`<<<<<<< OURS`);
        merged.push(oursLine);
        merged.push(`=======`);
        merged.push(theirsLine);
        merged.push(`>>>>>>> THEIRS`);
      } else if (oursLine !== undefined) {
        merged.push(oursLine);
      } else if (theirsLine !== undefined) {
        merged.push(theirsLine);
      }
    }
    i++;
  }

  return {
    success: conflicts.length === 0,
    mergedContent: merged.join('\n'),
    conflicts,
  };
}

export class ConflictResolver extends EventEmitter {
  private locks = new Map<string, FileLock>();
  private fileVersions = new Map<string, Map<string, FileVersion>>();
  private conflicts: ConflictResolution[] = [];
  private rollbackStack: RollbackEntry[] = [];
  private lockTimeoutMs: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null;

  constructor(options: { lockTimeoutMs?: number; cleanupIntervalMs?: number } = {}) {
    super();
    this.lockTimeoutMs = options.lockTimeoutMs ?? 30000;
    const cleanupMs = options.cleanupIntervalMs ?? 5000;
    this.cleanupInterval = setInterval(() => this.cleanExpiredLocks(), cleanupMs);
  }

  acquireLock(filePath: string, agentId: string): boolean {
    const existing = this.locks.get(filePath);
    if (existing) {
      if (existing.agentId === agentId) {
        existing.expiresAt = Date.now() + this.lockTimeoutMs;
        return true;
      }
      if (existing.expiresAt > Date.now()) {
        this.emit('lock:denied', { filePath, agentId, holder: existing.agentId });
        return false;
      }
    }

    this.locks.set(filePath, {
      filePath,
      agentId,
      acquiredAt: Date.now(),
      expiresAt: Date.now() + this.lockTimeoutMs,
    });
    this.emit('lock:acquired', { filePath, agentId });
    return true;
  }

  releaseLock(filePath: string, agentId: string): boolean {
    const lock = this.locks.get(filePath);
    if (!lock || lock.agentId !== agentId) return false;
    this.locks.delete(filePath);
    this.emit('lock:released', { filePath, agentId });
    return true;
  }

  isLocked(filePath: string): boolean {
    const lock = this.locks.get(filePath);
    return lock !== undefined && lock.expiresAt > Date.now();
  }

  getLockHolder(filePath: string): string | undefined {
    const lock = this.locks.get(filePath);
    if (lock && lock.expiresAt > Date.now()) return lock.agentId;
    return undefined;
  }

  recordFileVersion(filePath: string, agentId: string, content: string): void {
    if (!this.fileVersions.has(filePath)) {
      this.fileVersions.set(filePath, new Map());
    }
    const versions = this.fileVersions.get(filePath)!;
    versions.set(agentId, {
      agentId,
      content,
      timestamp: Date.now(),
      hash: computeHash(content),
    });
    this.emit('version:recorded', { filePath, agentId, hash: computeHash(content) });
  }

  detectConflict(filePath: string): boolean {
    const versions = this.fileVersions.get(filePath);
    if (!versions || versions.size < 2) return false;

    const hashes = new Set<string>();
    for (const version of versions.values()) {
      hashes.add(version.hash);
    }
    return hashes.size > 1;
  }

  resolveConflict(
    filePath: string,
    baseContent: string,
    strategy: 'merge' | 'ours' | 'theirs' | 'manual' = 'merge'
  ): ConflictResolution {
    const versions = this.fileVersions.get(filePath);
    if (!versions || versions.size < 2) {
      const content = versions?.values().next().value?.content ?? baseContent;
      return {
        filePath,
        agents: [...(versions?.keys() ?? [])],
        strategy,
        resolved: true,
        mergedContent: content,
        backupContent: baseContent,
      };
    }

    const agents = [...versions.keys()];
    let resolved = false;
    let mergedContent: string;

    switch (strategy) {
      case 'ours': {
        mergedContent = versions.get(agents[0])!.content;
        resolved = true;
        break;
      }
      case 'theirs': {
        mergedContent = versions.get(agents[agents.length - 1])!.content;
        resolved = true;
        break;
      }
      case 'merge': {
        const allContents = agents.map((a) => versions.get(a)!.content);
        let current = baseContent;
        let allResolved = true;

        for (const content of allContents) {
          const result = diff3Merge(baseContent, current, content);
          current = result.mergedContent;
          if (!result.success) allResolved = false;
        }

        mergedContent = current;
        resolved = allResolved;
        break;
      }
      case 'manual':
      default: {
        mergedContent = baseContent;
        resolved = false;
        break;
      }
    }

    const resolution: ConflictResolution = {
      filePath,
      agents,
      strategy,
      resolved,
      mergedContent,
      backupContent: baseContent,
    };

    this.conflicts.push(resolution);
    this.emit('conflict:resolved', { filePath, strategy, resolved, agents });

    return resolution;
  }

  rollback(filePath: string, agentId: string): string | null {
    const entries = this.rollbackStack.filter(
      (e) => e.filePath === filePath && e.agentId === agentId
    );
    if (entries.length === 0) return null;

    const entry = entries[entries.length - 1];
    this.rollbackStack = this.rollbackStack.filter((e) => e.id !== entry.id);
    this.emit('rollback:executed', { filePath, agentId, rollbackId: entry.id });
    return entry.previousContent;
  }

  pushRollback(filePath: string, agentId: string, previousContent: string, newContent: string): string {
    const id = `rb-${randomUUID().slice(0, 8)}`;
    this.rollbackStack.push({
      id,
      filePath,
      previousContent,
      newContent,
      agentId,
      timestamp: Date.now(),
    });
    this.emit('rollback:pushed', { filePath, agentId, rollbackId: id });
    return id;
  }

  getRollbackHistory(filePath?: string): RollbackEntry[] {
    if (filePath) return this.rollbackStack.filter((e) => e.filePath === filePath);
    return [...this.rollbackStack];
  }

  getConflicts(): ConflictResolution[] {
    return [...this.conflicts];
  }

  getActiveLocks(): FileLock[] {
    const now = Date.now();
    return [...this.locks.values()].filter((l) => l.expiresAt > now);
  }

  getFileVersions(filePath: string): Map<string, FileVersion> | undefined {
    return this.fileVersions.get(filePath);
  }

  clearFileVersions(filePath: string): void {
    this.fileVersions.delete(filePath);
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.locks.clear();
    this.fileVersions.clear();
    this.removeAllListeners();
  }

  private cleanExpiredLocks(): void {
    const now = Date.now();
    for (const [path, lock] of this.locks) {
      if (lock.expiresAt <= now) {
        this.locks.delete(path);
        this.emit('lock:expired', { filePath: path, agentId: lock.agentId });
      }
    }
  }
}
