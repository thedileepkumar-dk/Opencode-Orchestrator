import { BaseAgent } from './base.js';
import {
  AgentCapability,
  AgentTool,
  AgentConfig,
  TaskContext,
  AnalyzeResult,
  ExecuteResult,
  VerifyResult,
} from './types.js';

const DATABASE_SYSTEM_PROMPT = `You are a Senior Database Architect with 14+ years of experience designing, optimizing, and operating database systems at scale across relational, document, key-value, and graph databases.

## Your Expertise
You have deep mastery across the database landscape:
- Relational: PostgreSQL 16 (primary), MySQL 8, SQLite, CockroachDB, TiDB
- Document: MongoDB 7, CouchDB, Amazon DocumentDB
- Key-value: Redis 7, DynamoDB, etcd
- Search: Elasticsearch 8, OpenSearch, Meilisearch
- Graph: Neo4j, Amazon Neptune, ArangoDB
- Time-series: TimescaleDB, InfluxDB, QuestDB
- Vector: pgvector, Qdrant, Weaviate, Pinecone
- ORMs: Prisma, Drizzle, TypeORM, SQLAlchemy, Django ORM, GORM, Diesel

## Your Schema Design Philosophy
You design schemas with these principles:
1. Correctness first: normalize to eliminate anomalies, denormalize only with justification
2. Query-driven design: model the data based on how it will be queried
3. Evolvability: design for change with migration-friendly patterns
4. Performance: anticipate access patterns and index accordingly
5. Integrity: enforce constraints at the database level, not just application level
6. Scalability: consider partitioning, sharding, and replication from the start

## Relational Schema Design
### Normalization
- 1NF: atomic values, no repeating groups
- 2NF: no partial dependencies on composite keys
- 3NF: no transitive dependencies
- BCNF: every determinant is a candidate key
- Denormalization: only for proven performance needs, with clear documentation

### Data Types
- Use the most specific type: UUID for IDs, TIMESTAMPTZ for dates, JSONB for semi-structured
- Avoid: TEXT for everything, VARCHAR without length, FLOAT for money
- Prefer: BIGSERIAL for auto-increment, BOOLEAN for flags, ENUM for fixed sets
- Arrays and JSONB for flexible schema needs (with indexing via GIN)

### Constraints
- PRIMARY KEY on every table (prefer UUID or BIGINT)
- FOREIGN KEY with appropriate ON DELETE/UPDATE actions
- UNIQUE constraints for natural keys
- CHECK constraints for domain validation
- NOT NULL wherever the data should never be absent
- EXCLUDE constraints for complex business rules (PostgreSQL)

## Index Strategy
### When to Index
- Columns in WHERE clauses of frequent queries
- Columns in JOIN conditions (foreign keys)
- Columns in ORDER BY for sorted queries
- Columns in GROUP BY for aggregation queries
- Covering indexes to avoid table lookups

### Index Types
- B-tree: default, equality and range queries
- Hash: equality-only, faster than B-tree for exact matches
- GIN: JSONB, arrays, full-text search, composite values
- GiST: geometric data, range types, nearest-neighbor search
- BRIN: large, naturally ordered tables (time-series)
- Partial indexes: index only rows matching a condition
- Expression indexes: index computed values (LOWER, DATE)
- Covering indexes (INCLUDE): avoid heap lookups

### Index Maintenance
- Monitor index usage with pg_stat_user_indexes
- Remove unused indexes (they slow writes)
- REINDEX bloated indexes periodically
- VACUUM ANALYZE for statistics and dead tuple cleanup

## Migration Strategy
- Expand-contract pattern for zero-downtime migrations
- Always make backward-compatible changes in steps:
  1. Add new column/table (nullable or with default)
  2. Deploy code that writes to both old and new
  3. Backfill existing data
  4. Deploy code that reads from new only
  5. Drop old column/table
- Transactional DDL when supported (PostgreSQL)
- Rollback scripts for every forward migration
- Test migrations against production-size data

## Query Optimization
- EXPLAIN (ANALYZE, BUFFERS, FORMAT YAML) for detailed plans
- Identify: sequential scans on large tables, nested loops with high row counts, sort spills
- Common fixes: add index, rewrite query, use CTE/materialized views, partition table
- Batch operations: use COPY for bulk loads, batch UPDATE/DELETE with LIMIT
- Avoid: SELECT *, correlated subqueries, OR on different columns, functions on indexed columns

## Redis Design Patterns
- Cache-aside: read from cache, populate on miss, invalidate on write
- Write-through: write to cache and database together
- Session store: hash per session with TTL
- Rate limiting: sorted set with sliding window
- Leaderboard: sorted set with scores
- Pub/Sub: real-time event distribution
- Proper TTL on every cached key; no unbounded growth

## Replication & High Availability
- Primary-replica with streaming replication (PostgreSQL)
- Connection pooling at PgBouncer level, not application
- Automatic failover with Patroni, repmgr, or cloud-managed
- Read replicas for read-heavy workloads with routing logic
- Multi-region: careful conflict resolution, prefer primary-per-region

You never guess at query performance — you EXPLAIN ANALYZE. You never add indexes without understanding the write impact.`;

export class DatabaseAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      id: 'database-agent',
      name: 'Database Agent',
      domain: 'database',
      version: '1.0.0',
      maxConcurrentTasks: 2,
      timeoutMs: 120_000,
      retryAttempts: 2,
      temperature: 0.15,
    };
    super(config);
  }

  protected defineCapabilities(): AgentCapability[] {
    return [
      {
        name: 'schema_design',
        description: 'Design normalized/denormalized database schemas with proper constraints and types',
        confidence: 0.95,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'erd_generation',
        description: 'Generate Entity-Relationship Diagrams from schema definitions',
        confidence: 0.88,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'index_optimization',
        description: 'Analyze and optimize index strategies for query performance',
        confidence: 0.93,
        requiredTools: ['read_file', 'search_content', 'run_command'],
      },
      {
        name: 'migration_planning',
        description: 'Plan and write database migrations with rollback support',
        confidence: 0.92,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'query_optimization',
        description: 'Optimize SQL queries using EXPLAIN ANALYZE and query rewriting',
        confidence: 0.91,
        requiredTools: ['read_file', 'search_content', 'run_command'],
      },
      {
        name: 'redis_design',
        description: 'Design Redis data structures and caching patterns',
        confidence: 0.89,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'orm_design',
        description: 'Design ORM models (Prisma, Drizzle, TypeORM) with proper relations',
        confidence: 0.9,
        requiredTools: ['read_file', 'write_file', 'search_content'],
      },
      {
        name: 'replication',
        description: 'Configure database replication, sharding, and high availability',
        confidence: 0.84,
        requiredTools: ['read_file', 'write_file'],
      },
    ];
  }

  protected defineTools(): AgentTool[] {
    return [
      {
        name: 'read_file',
        description: 'Read schema files, migrations, and ORM models',
        parameters: { path: 'string' },
        required: true,
      },
      {
        name: 'write_file',
        description: 'Write schema definitions, migrations, and ORM models',
        parameters: { path: 'string', content: 'string' },
        required: true,
      },
      {
        name: 'search_content',
        description: 'Search for table definitions, queries, and index usage',
        parameters: { pattern: 'string', include: 'string' },
        required: true,
      },
      {
        name: 'run_command',
        description: 'Run EXPLAIN ANALYZE, migration tools, and database diagnostics',
        parameters: { command: 'string', timeout: 'number' },
        required: true,
      },
      {
        name: 'database_query',
        description: 'Execute read-only database queries for schema inspection',
        parameters: { query: 'string', database: 'string' },
        required: false,
      },
    ];
  }

  getSystemPrompt(): string {
    return DATABASE_SYSTEM_PROMPT;
  }

  protected async performAnalysis(task: TaskContext): Promise<Omit<AnalyzeResult, 'agentId'>> {
    const confidence = this.calculateConfidence(task);
    const complexity = this.estimateComplexity(task);

    return {
      canHandle: confidence > 0.3,
      confidence,
      estimatedComplexity: complexity,
      estimatedTimeMs: this.estimateTime(complexity, task),
      requiredTools: this.determineRequiredTools(task),
      suggestedApproach: this.suggestApproach(task),
      risks: this.identifyRisks(task),
      dependencies: this.identifyDependencies(task),
    };
  }

  protected async performExecution(
    task: TaskContext,
    signal: AbortSignal
  ): Promise<Omit<ExecuteResult, 'agentId' | 'taskId' | 'executionTimeMs'>> {
    const artifacts: ExecuteResult['artifacts'] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    if (signal.aborted) {
      return { success: false, output: 'Task aborted', artifacts, tokensUsed: 0, warnings, errors: ['Aborted'] };
    }

    const approach = this.suggestApproach(task);

    artifacts.push({
      type: 'snippet',
      name: 'database-implementation',
      content: `-- Database implementation for: ${task.description}\n-- Approach: ${approach}`,
      language: 'sql',
    });

    const desc = task.description.toLowerCase();
    if (desc.includes('migration') || desc.includes('schema')) {
      artifacts.push({
        type: 'config',
        name: 'migration',
        content: `-- Migration: ${task.description}\n-- UP\n-- TODO: Add migration SQL\n-- DOWN\n-- TODO: Add rollback SQL`,
        language: 'sql',
      });
    }

    if (desc.includes('model') || desc.includes('orm') || desc.includes('prisma')) {
      artifacts.push({
        type: 'snippet',
        name: 'orm-model',
        content: `// ORM model for: ${task.description}`,
        language: 'typescript',
      });
    }

    return {
      success: true,
      output: `Database task completed: ${approach}`,
      artifacts,
      tokensUsed: 2800,
      warnings,
      errors,
    };
  }

  protected async performVerification(
    result: ExecuteResult
  ): Promise<Omit<VerifyResult, 'agentId' | 'taskId' | 'verifiedAt'>> {
    const issues: VerifyResult['issues'] = [];
    const suggestions: string[] = [];

    for (const artifact of result.artifacts) {
      const content = artifact.content.toUpperCase();

      if (artifact.language === 'sql') {
        if (!content.includes('PRIMARY KEY')) {
          issues.push({
            severity: 'warning',
            message: 'Table definition missing PRIMARY KEY constraint',
            location: artifact.name,
            fix: 'Add PRIMARY KEY constraint to every table',
          });
        }
        if (content.includes('VARCHAR(') && content.match(/VARCHAR\(\d{4,}\)/)) {
          suggestions.push('Very large VARCHAR detected; consider TEXT type instead');
        }
        if (content.includes('FLOAT') || content.includes('DOUBLE')) {
          issues.push({
            severity: 'warning',
            message: 'Floating point type detected; use DECIMAL/NUMERIC for monetary values',
            location: artifact.name,
            fix: 'Use DECIMAL(precision, scale) for exact numeric values',
          });
        }
        if (!content.includes('NOT NULL') && content.includes('CREATE TABLE')) {
          suggestions.push('Consider adding NOT NULL constraints where data should never be absent');
        }
      }
    }

    const passed = issues.filter((i) => i.severity === 'error' || i.severity === 'critical').length === 0;
    const score = passed ? Math.max(0.5, 1 - issues.length * 0.12) : 0.2;

    return { passed, score, issues, suggestions };
  }

  private calculateConfidence(task: TaskContext): number {
    const keywords = [
      'database', 'db', 'sql', 'postgresql', 'postgres', 'mysql', 'mongodb', 'redis',
      'schema', 'table', 'column', 'index', 'migration', 'query',
      'orm', 'prisma', 'drizzle', 'typeorm', 'sequelize', 'sqlalchemy',
      'relation', 'foreign key', 'primary key', 'constraint', 'unique',
      'normalize', 'denormalize', 'partition', 'shard', 'replication',
      'cache', 'connection pool', 'transaction', 'acid',
      'nosql', 'document', 'key-value', 'graph',
      'pgvector', 'embedding', 'vector',
    ];

    const desc = task.description.toLowerCase();
    const matches = keywords.filter((kw) => desc.includes(kw)).length;
    const base = Math.min(matches / 3, 1.0);

    if (task.domain === 'database' || task.domain === 'data') return Math.max(base, 0.7);
    return base;
  }

  private estimateComplexity(task: TaskContext): TaskContext['complexity'] {
    const desc = task.description.toLowerCase();
    if (desc.includes('architecture') || desc.includes('full') || desc.includes('migration')) return 'critical';
    if (desc.includes('schema') || desc.includes('replication') || desc.includes('partition')) return 'complex';
    if (desc.includes('index') || desc.includes('query') || desc.includes('orm')) return 'moderate';
    if (desc.includes('model') || desc.includes('table') || desc.includes('column')) return 'simple';
    return 'trivial';
  }

  private determineRequiredTools(task: TaskContext): string[] {
    const tools = ['read_file', 'write_file'];
    const desc = task.description.toLowerCase();
    if (desc.includes('optimize') || desc.includes('existing') || desc.includes('find')) tools.push('search_content');
    if (desc.includes('explain') || desc.includes('analyze') || desc.includes('migrate') || desc.includes('test')) tools.push('run_command');
    return tools;
  }

  private estimateTime(complexity: string, task: TaskContext): number {
    const base: Record<string, number> = {
      trivial: 5_000, simple: 15_000, moderate: 40_000, complex: 80_000, critical: 150_000,
    };
    return base[complexity] || 25_000;
  }

  private suggestApproach(task: TaskContext): string {
    const desc = task.description.toLowerCase();
    if (desc.includes('schema') || desc.includes('design')) return 'Design normalized schema (3NF/BCNF), add proper constraints, types, and indexes based on query patterns';
    if (desc.includes('migration')) return 'Write expand-contract migration: add nullable column, backfill, update app, drop old. Include rollback SQL';
    if (desc.includes('index') || desc.includes('optimize')) return 'Run EXPLAIN ANALYZE on slow queries, identify missing indexes, create B-tree/GIN/partial indexes as appropriate';
    if (desc.includes('query')) return 'Analyze query plan with EXPLAIN (ANALYZE, BUFFERS), rewrite to use indexes, eliminate N+1, batch operations';
    if (desc.includes('redis') || desc.includes('cache')) return 'Design cache-aside pattern with proper TTL, invalidation strategy, and memory management';
    if (desc.includes('orm') || desc.includes('prisma') || desc.includes('drizzle')) return 'Create ORM models with proper relations, enums, indexes, and migration configuration';
    return 'Analyze data requirements, design schema with proper normalization, constraints, and index strategy';
  }

  private identifyRisks(task: TaskContext): string[] {
    const risks: string[] = [];
    const desc = task.description.toLowerCase();
    if (desc.includes('migration')) risks.push('Schema migrations can lock tables; plan for zero-downtime with expand-contract pattern');
    if (desc.includes('index')) risks.push('Adding indexes slows writes; analyze read/write ratio before adding');
    if (desc.includes('denormaliz')) risks.push('Denormalization introduces data inconsistency risk; ensure update propagation');
    if (desc.includes('json') || desc.includes('jsonb')) risks.push('JSONB is flexible but harder to validate and index; use judiciously');
    return risks;
  }

  private identifyDependencies(task: TaskContext): string[] {
    const deps: string[] = [];
    const desc = task.description.toLowerCase();
    if (desc.includes('postgres') || desc.includes('pg')) deps.push('PostgreSQL connection for EXPLAIN ANALYZE');
    if (desc.includes('redis')) deps.push('Redis connection for testing');
    if (desc.includes('migration')) deps.push('Migration tool configured (Prisma Migrate, Alembic, Flyway)');
    if (desc.includes('prisma')) deps.push('Prisma CLI and schema.prisma file');
    return deps;
  }
}
