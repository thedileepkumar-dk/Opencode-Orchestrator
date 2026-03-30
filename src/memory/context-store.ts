import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  MemoryEntry,
  SessionMemory,
  Decision,
  ModifiedFile,
  AgentOutputRecord,
} from '../protocol/types.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ scope: 'context-store' });

// ============================================================
// SIMPLE SQLITE-LIKE IN-MEMORY STORE
// (Interface compatible with better-sqlite3 for future swap)
// ============================================================

interface Row {
  [key: string]: unknown;
}

interface Statement {
  run(...params: unknown[]): { changes: number };
  get(...params: unknown[]): Row | undefined;
  all(...params: unknown[]): Row[];
}

interface Database {
  prepare(sql: string): Statement;
  exec(sql: string): void;
  close(): void;
}

/**
 * In-memory implementation of a SQLite-like database.
 * Replace with better-sqlite3 in production by implementing the same interface.
 */
class InMemoryDatabase implements Database {
  private tables: Map<string, Row[]> = new Map();

  prepare(sql: string): Statement {
    const trimmed = sql.trim().toUpperCase();

    if (trimmed.startsWith('CREATE TABLE')) {
      const tableName = this.extractTableName(sql);
      if (!this.tables.has(tableName)) {
        this.tables.set(tableName, []);
      }
      return {
        run: () => ({ changes: 0 }),
        get: () => undefined,
        all: () => [],
      };
    }

    if (trimmed.startsWith('INSERT')) {
      const tableName = this.extractInsertTable(sql);
      return {
        run: (...params: unknown[]) => {
          const rows = this.tables.get(tableName) || [];
          const row = this.parseInsertParams(sql, params);
          rows.push(row);
          this.tables.set(tableName, rows);
          return { changes: 1 };
        },
        get: () => undefined,
        all: () => [],
      };
    }

    if (trimmed.startsWith('SELECT')) {
      return {
        run: () => ({ changes: 0 }),
        get: (...params: unknown[]) => {
          const results = this.executeSelect(sql, params);
          return results[0];
        },
        all: (...params: unknown[]) => {
          return this.executeSelect(sql, params);
        },
      };
    }

    if (trimmed.startsWith('UPDATE')) {
      return {
        run: (...params: unknown[]) => {
          const changes = this.executeUpdate(sql, params);
          return { changes };
        },
        get: () => undefined,
        all: () => [],
      };
    }

    if (trimmed.startsWith('DELETE')) {
      return {
        run: (...params: unknown[]) => {
          const changes = this.executeDelete(sql, params);
          return { changes };
        },
        get: () => undefined,
        all: () => [],
      };
    }

    // Default no-op
    return {
      run: () => ({ changes: 0 }),
      get: () => undefined,
      all: () => [],
    };
  }

  exec(sql: string): void {
    // Simple exec for multi-statement
    const statements = sql.split(';').filter((s) => s.trim());
    for (const stmt of statements) {
      this.prepare(stmt).run();
    }
  }

  close(): void {
    this.tables.clear();
  }

  private extractTableName(sql: string): string {
    const match = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
    return match ? match[1].toLowerCase() : 'unknown';
  }

  private extractInsertTable(sql: string): string {
    const match = sql.match(/INSERT\s+INTO\s+(\w+)/i);
    return match ? match[1].toLowerCase() : 'unknown';
  }

  private parseInsertParams(sql: string, params: unknown[]): Row {
    const colsMatch = sql.match(/\(([^)]+)\)\s*VALUES/i);
    if (!colsMatch) return {};
    const cols = colsMatch[1].split(',').map((c) => c.trim());
    const row: Row = {};
    for (let i = 0; i < cols.length; i++) {
      row[cols[i]] = params[i];
    }
    return row;
  }

  private executeSelect(sql: string, params: unknown[]): Row[] {
    const fromMatch = sql.match(/FROM\s+(\w+)/i);
    if (!fromMatch) return [];
    const tableName = fromMatch[1].toLowerCase();
    let rows = [...(this.tables.get(tableName) || [])];

    // Simple WHERE clause handling
    const whereMatch = sql.match(/WHERE\s+(.+?)(?:ORDER|LIMIT|$)/is);
    if (whereMatch) {
      const conditions = whereMatch[1].trim();
      rows = this.filterRows(rows, conditions, params);
    }

    // ORDER BY
    const orderMatch = sql.match(/ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
    if (orderMatch) {
      const col = orderMatch[1];
      const desc = orderMatch[2]?.toUpperCase() === 'DESC';
      rows.sort((a, b) => {
        const va = a[col] as string | number;
        const vb = b[col] as string | number;
        if (va < vb) return desc ? 1 : -1;
        if (va > vb) return desc ? -1 : 1;
        return 0;
      });
    }

    // LIMIT
    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) {
      rows = rows.slice(0, parseInt(limitMatch[1], 10));
    }

    // SELECT specific columns
    const colsMatch = sql.match(/SELECT\s+(.+?)\s+FROM/i);
    if (colsMatch && colsMatch[1].trim() !== '*') {
      const cols = colsMatch[1].split(',').map((c) => c.trim());
      rows = rows.map((row) => {
        const filtered: Row = {};
        for (const col of cols) {
          filtered[col] = row[col];
        }
        return filtered;
      });
    }

    return rows;
  }

  private filterRows(rows: Row[], conditions: string, params: unknown[]): Row[] {
    // Handle simple AND conditions with ? placeholders
    return rows.filter((row) => {
      let paramIdx = 0;
      const parts = conditions.split(/\s+AND\s+/i);

      for (const part of parts) {
        const match = part.trim().match(/(\w+)\s*(=|!=|LIKE|>|<)\s*\?/i);
        if (!match) continue;

        const col = match[1];
        const op = match[2].toUpperCase();
        const value = params[paramIdx++];
        const cellValue = row[col];

        if (op === '=' && cellValue !== value) return false;
        if (op === '!=' && cellValue === value) return false;
        if (op === '>' && (cellValue as number) <= (value as number)) return false;
        if (op === '<' && (cellValue as number) >= (value as number)) return false;
        if (op === 'LIKE') {
          const pattern = (value as string).replace(/%/g, '.*');
          if (!(cellValue as string).match(new RegExp(pattern, 'i'))) return false;
        }
      }
      return true;
    });
  }

  private executeUpdate(sql: string, params: unknown[]): number {
    const tableMatch = sql.match(/UPDATE\s+(\w+)/i);
    if (!tableMatch) return 0;
    const tableName = tableMatch[1].toLowerCase();
    const rows = this.tables.get(tableName);
    if (!rows) return 0;

    let count = 0;
    for (const row of rows) {
      // Very simplified — real implementation would parse SET and WHERE properly
      count++;
    }
    return count;
  }

  private executeDelete(sql: string, params: unknown[]): number {
    const tableMatch = sql.match(/FROM\s+(\w+)/i);
    if (!tableMatch) return 0;
    const tableName = tableMatch[1].toLowerCase();
    const rows = this.tables.get(tableName);
    if (!rows) return 0;

    const whereMatch = sql.match(/WHERE\s+(.+?)$/is);
    if (whereMatch) {
      const before = rows.length;
      const filtered = this.filterRows(rows, whereMatch[1].trim(), params);
      this.tables.set(tableName, filtered);
      return before - filtered.length;
    }

    const count = rows.length;
    this.tables.set(tableName, []);
    return count;
  }
}

// ============================================================
// CONTEXT STORE
// ============================================================

export interface ContextStoreOptions {
  dbPath?: string;
  defaultTTL?: number;
  maxEntries?: number;
  compactInterval?: number;
}

export class ContextStore {
  private db: Database;
  private defaultTTL: number;
  private maxEntries: number;
  private compactTimer: NodeJS.Timeout | null = null;

  constructor(options: ContextStoreOptions = {}) {
    this.db = new InMemoryDatabase();
    this.defaultTTL = options.defaultTTL ?? 86400000; // 24 hours
    this.maxEntries = options.maxEntries ?? 100000;

    this.initializeSchema();

    const compactInterval = options.compactInterval ?? 3600000; // 1 hour
    this.compactTimer = setInterval(() => this.compact(), compactInterval);

    logger.info('ContextStore initialized');
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_entries (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        namespace TEXT NOT NULL DEFAULT 'default',
        tags TEXT NOT NULL DEFAULT '[]',
        embedding TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER,
        access_count INTEGER NOT NULL DEFAULT 0,
        last_accessed_at INTEGER NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}'
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_history (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS learnings (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        learning TEXT NOT NULL,
        context TEXT,
        confidence REAL NOT NULL DEFAULT 0.5,
        created_at INTEGER NOT NULL,
        reinforced_at INTEGER,
        reinforcement_count INTEGER NOT NULL DEFAULT 0
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conventions (
        id TEXT PRIMARY KEY,
        project TEXT NOT NULL,
        category TEXT NOT NULL,
        rule TEXT NOT NULL,
        examples TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  // ============================================================
  // MEMORY ENTRIES
  // ============================================================

  set(key: string, value: string, namespace = 'default', tags: string[] = [], ttl?: number): MemoryEntry {
    const now = Date.now();
    const id = crypto.createHash('md5').update(`${namespace}:${key}`).digest('hex');
    const expiresAt = ttl ? now + ttl : this.defaultTTL ? now + this.defaultTTL : undefined;

    const existing = this.db.prepare('SELECT * FROM memory_entries WHERE id = ?').get(id);
    if (existing) {
      this.db.prepare(
        'UPDATE memory_entries SET value = ?, updated_at = ?, expires_at = ?, tags = ? WHERE id = ?'
      ).run(value, now, expiresAt, JSON.stringify(tags), id);
    } else {
      this.db.prepare(
        'INSERT INTO memory_entries (id, key, value, namespace, tags, created_at, updated_at, expires_at, access_count, last_accessed_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)'
      ).run(id, key, value, namespace, JSON.stringify(tags), now, now, expiresAt, now, '{}');
    }

    return {
      id,
      key,
      value,
      namespace,
      tags,
      createdAt: existing ? (existing.created_at as number) : now,
      updatedAt: now,
      expiresAt,
      accessCount: existing ? (existing.access_count as number) : 0,
      lastAccessedAt: now,
      metadata: {},
    };
  }

  get(key: string, namespace = 'default'): MemoryEntry | null {
    const id = crypto.createHash('md5').update(`${namespace}:${key}`).digest('hex');
    const row = this.db.prepare('SELECT * FROM memory_entries WHERE id = ?').get(id);

    if (!row) return null;

    // Check TTL
    if (row.expires_at && (row.expires_at as number) < Date.now()) {
      this.delete(key, namespace);
      return null;
    }

    // Update access count
    this.db.prepare(
      'UPDATE memory_entries SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?'
    ).run(Date.now(), id);

    return this.rowToEntry(row);
  }

  delete(key: string, namespace = 'default'): boolean {
    const id = crypto.createHash('md5').update(`${namespace}:${key}`).digest('hex');
    const result = this.db.prepare('DELETE FROM memory_entries WHERE id = ?').run(id);
    return result.changes > 0;
  }

  getByNamespace(namespace: string): MemoryEntry[] {
    const rows = this.db.prepare('SELECT * FROM memory_entries WHERE namespace = ? ORDER BY updated_at DESC').all(namespace);
    return rows.map((r) => this.rowToEntry(r));
  }

  getByTag(tag: string): MemoryEntry[] {
    const rows = this.db.prepare("SELECT * FROM memory_entries WHERE tags LIKE ? ORDER BY updated_at DESC").all(`%${tag}%`);
    return rows.map((r) => this.rowToEntry(r));
  }

  search(query: string, namespace?: string): MemoryEntry[] {
    let sql = 'SELECT * FROM memory_entries WHERE (key LIKE ? OR value LIKE ?)';
    const params: unknown[] = [`%${query}%`, `%${query}%`];

    if (namespace) {
      sql += ' AND namespace = ?';
      params.push(namespace);
    }

    sql += ' ORDER BY access_count DESC, updated_at DESC LIMIT 50';

    const rows = this.db.prepare(sql).all(...params);
    return rows.map((r) => this.rowToEntry(r));
  }

  // ============================================================
  // SESSION HISTORY
  // ============================================================

  addSessionEvent(sessionId: string, type: string, data: Record<string, unknown>): void {
    const id = crypto.randomUUID();
    this.db.prepare(
      'INSERT INTO session_history (id, session_id, type, data, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, sessionId, type, JSON.stringify(data), Date.now());
  }

  getSessionHistory(sessionId: string, limit = 100): Array<{ id: string; type: string; data: Record<string, unknown>; createdAt: number }> {
    const rows = this.db.prepare(
      'SELECT * FROM session_history WHERE session_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(sessionId, limit);

    return rows.map((r) => ({
      id: r.id as string,
      type: r.type as string,
      data: JSON.parse(r.data as string),
      createdAt: r.created_at as number,
    }));
  }

  // ============================================================
  // LEARNINGS
  // ============================================================

  addLearning(category: string, learning: string, context?: string, confidence = 0.5): string {
    const id = crypto.randomUUID();
    this.db.prepare(
      'INSERT INTO learnings (id, category, learning, context, confidence, created_at, reinforced_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, category, learning, context, confidence, Date.now(), Date.now());
    return id;
  }

  reinforceLearning(id: string): void {
    this.db.prepare(
      'UPDATE learnings SET reinforcement_count = reinforcement_count + 1, reinforced_at = ? WHERE id = ?'
    ).run(Date.now(), id);
  }

  getLearnings(category?: string): Array<{ id: string; category: string; learning: string; confidence: number; reinforced: number }> {
    const sql = category
      ? 'SELECT * FROM learnings WHERE category = ? ORDER BY reinforcement_count DESC, confidence DESC'
      : 'SELECT * FROM learnings ORDER BY reinforcement_count DESC, confidence DESC';

    const rows = category ? this.db.prepare(sql).all(category) : this.db.prepare(sql).all();

    return rows.map((r) => ({
      id: r.id as string,
      category: r.category as string,
      learning: r.learning as string,
      confidence: r.confidence as number,
      reinforced: r.reinforcement_count as number,
    }));
  }

  // ============================================================
  // PROJECT CONVENTIONS
  // ============================================================

  setConvention(project: string, category: string, rule: string, examples: string[] = []): string {
    const id = crypto.randomUUID();
    const now = Date.now();
    this.db.prepare(
      'INSERT INTO conventions (id, project, category, rule, examples, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, project, category, rule, JSON.stringify(examples), now, now);
    return id;
  }

  getConventions(project: string): Array<{ id: string; category: string; rule: string; examples: string[] }> {
    const rows = this.db.prepare('SELECT * FROM conventions WHERE project = ? ORDER BY category, updated_at DESC').all(project);
    return rows.map((r) => ({
      id: r.id as string,
      category: r.category as string,
      rule: r.rule as string,
      examples: JSON.parse(r.examples as string),
    }));
  }

  // ============================================================
  // MAINTENANCE
  // ============================================================

  compact(): number {
    const now = Date.now();

    // Remove expired entries
    const expired = this.db.prepare('DELETE FROM memory_entries WHERE expires_at IS NOT NULL AND expires_at < ?').run(now);

    // Remove old session history (keep last 30 days)
    const oldSessions = this.db.prepare('DELETE FROM session_history WHERE created_at < ?').run(now - 30 * 86400000);

    // Enforce max entries (remove least recently accessed)
    const allRows = this.db.prepare('SELECT id FROM memory_entries ORDER BY last_accessed_at ASC').all();
    if (allRows.length > this.maxEntries) {
      const toRemove = allRows.slice(0, allRows.length - this.maxEntries);
      for (const row of toRemove) {
        this.db.prepare('DELETE FROM memory_entries WHERE id = ?').run(row.id);
      }
    }

    const totalRemoved = expired.changes + oldSessions.changes;
    if (totalRemoved > 0) {
      logger.info(`Compacted: removed ${totalRemoved} expired/old entries`);
    }

    return totalRemoved;
  }

  getStats(): { entries: number; sessions: number; learnings: number; conventions: number } {
    return {
      entries: (this.db.prepare('SELECT COUNT(*) as count FROM memory_entries').get()?.count as number) || 0,
      sessions: (this.db.prepare('SELECT COUNT(*) as count FROM session_history').get()?.count as number) || 0,
      learnings: (this.db.prepare('SELECT COUNT(*) as count FROM learnings').get()?.count as number) || 0,
      conventions: (this.db.prepare('SELECT COUNT(*) as count FROM conventions').get()?.count as number) || 0,
    };
  }

  clearNamespace(namespace: string): number {
    const result = this.db.prepare('DELETE FROM memory_entries WHERE namespace = ?').run(namespace);
    return result.changes;
  }

  close(): void {
    if (this.compactTimer) {
      clearInterval(this.compactTimer);
      this.compactTimer = null;
    }
    this.db.close();
    logger.info('ContextStore closed');
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private rowToEntry(row: Row): MemoryEntry {
    return {
      id: row.id as string,
      key: row.key as string,
      value: row.value as string,
      namespace: row.namespace as string,
      tags: JSON.parse((row.tags as string) || '[]'),
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      expiresAt: row.expires_at as number | undefined,
      accessCount: row.access_count as number,
      lastAccessedAt: row.last_accessed_at as number,
      metadata: JSON.parse((row.metadata as string) || '{}'),
    };
  }
}

export default ContextStore;
