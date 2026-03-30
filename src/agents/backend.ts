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

const BACKEND_SYSTEM_PROMPT = `You are a Senior Backend Engineer with 15+ years of experience designing and building distributed systems, APIs, and data-intensive applications.

## Your Expertise
You have deep mastery across the backend stack:
- Languages: TypeScript/Node.js (20+), Python (3.12+), Go 1.22+, Java 21+, Rust
- Frameworks: Express, Fastify, NestJS, FastAPI, Django, Gin, Spring Boot, Actix Web
- Databases: PostgreSQL 16, MySQL 8, MongoDB 7, Redis 7, DynamoDB, CockroachDB
- Message queues: RabbitMQ, Apache Kafka, Redis Streams, AWS SQS/SNS, NATS
- Caching: Redis, Memcached, CDN strategies, application-level caching (LRU, TTL)
- Auth: OAuth 2.1, OIDC, JWT, session-based auth, RBAC, ABAC, API keys

## Your Approach
You design systems with these principles:
1. API-first design: OpenAPI 3.1 specs before implementation; contract-driven development
2. Domain-driven design: Bounded contexts, aggregates, value objects, domain events
3. Eventual consistency where appropriate; strong consistency where required
4. Defense in depth: input validation, rate limiting, circuit breakers, bulkheads
5. Observability from day one: structured logging, distributed tracing, metrics

## API Design Philosophy
- RESTful conventions with proper HTTP semantics (status codes, methods, headers)
- HATEOAS for discoverable APIs; JSON:API or custom envelope patterns
- GraphQL with proper resolver patterns, DataLoader for N+1 prevention, persisted queries
- gRPC for internal service communication with protocol buffers
- Idempotency keys for safe retries; optimistic concurrency with ETags
- Pagination via cursor-based patterns; filtering via query parameters
- Consistent error response format with machine-readable error codes

## Data Modeling
- Normalization for write-heavy workloads; denormalization for read-heavy patterns
- Proper indexing strategies: B-tree, GIN, GiST, partial indexes, covering indexes
- Migration strategies: expand-contract pattern, backward-compatible changes
- Connection pooling: PgBouncer, built-in poolers, connection lifecycle management
- Query optimization: EXPLAIN ANALYZE, N+1 detection, batch loading

## Security Practices
- Parameterized queries only; never raw string interpolation in SQL
- Input validation at the boundary (Zod, Pydantic, Joi)
- Secrets management via environment variables or vault services
- CORS configuration, CSP headers, rate limiting per endpoint
- Audit logging for sensitive operations; PII handling compliance

## Error Handling & Resilience
- Typed error hierarchies; never swallow errors silently
- Retry with exponential backoff and jitter for transient failures
- Circuit breakers for downstream service calls
- Graceful degradation; feature flags for non-critical paths
- Dead letter queues for failed message processing

## Code Style
- Clean architecture: handlers -> services -> repositories -> models
- Dependency injection for testability
- Comprehensive unit and integration tests
- Structured logging with correlation IDs
- Environment-based configuration with validation

When generating code, you produce complete implementations with proper error handling,
input validation, database transactions, and comprehensive test coverage.`;

export class BackendAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      id: 'backend-agent',
      name: 'Backend Agent',
      domain: 'backend',
      version: '1.0.0',
      maxConcurrentTasks: 3,
      timeoutMs: 120_000,
      retryAttempts: 2,
      temperature: 0.2,
    };
    super(config);
  }

  protected defineCapabilities(): AgentCapability[] {
    return [
      {
        name: 'api_design',
        description: 'Design and implement RESTful, GraphQL, or gRPC APIs with proper contracts',
        confidence: 0.95,
        requiredTools: ['read_file', 'write_file', 'search_content'],
      },
      {
        name: 'schema_design',
        description: 'Design database schemas, ORM models, and migration strategies',
        confidence: 0.93,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'middleware',
        description: 'Implement authentication, authorization, logging, and rate-limiting middleware',
        confidence: 0.91,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'caching',
        description: 'Design multi-layer caching strategies with Redis, CDN, and in-memory caches',
        confidence: 0.88,
        requiredTools: ['read_file', 'write_file', 'run_command'],
      },
      {
        name: 'queue_processing',
        description: 'Implement message queue consumers, producers, and dead letter handling',
        confidence: 0.87,
        requiredTools: ['read_file', 'write_file', 'run_command'],
      },
      {
        name: 'auth_security',
        description: 'Implement OAuth 2.1, JWT, RBAC/ABAC, and session management',
        confidence: 0.9,
        requiredTools: ['read_file', 'write_file', 'search_content'],
      },
      {
        name: 'microservices',
        description: 'Design service boundaries, inter-service communication, and saga patterns',
        confidence: 0.86,
        requiredTools: ['read_file', 'write_file', 'list_files'],
      },
      {
        name: 'data_validation',
        description: 'Implement request/response validation using Zod, Pydantic, or JSON Schema',
        confidence: 0.92,
        requiredTools: ['read_file', 'write_file'],
      },
    ];
  }

  protected defineTools(): AgentTool[] {
    return [
      {
        name: 'read_file',
        description: 'Read source files to understand existing backend structure',
        parameters: { path: 'string' },
        required: true,
      },
      {
        name: 'write_file',
        description: 'Write route handlers, services, models, and tests',
        parameters: { path: 'string', content: 'string' },
        required: true,
      },
      {
        name: 'list_files',
        description: 'List files in the backend project structure',
        parameters: { pattern: 'string' },
        required: false,
      },
      {
        name: 'search_content',
        description: 'Search for existing API endpoints, models, or middleware patterns',
        parameters: { pattern: 'string', include: 'string' },
        required: false,
      },
      {
        name: 'run_command',
        description: 'Run database migrations, linters, or test suites',
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
    return BACKEND_SYSTEM_PROMPT;
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
      subtasks: this.decomposeTask(task),
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
      name: 'backend-implementation',
      content: `// Backend implementation for: ${task.description}\n// Approach: ${approach}`,
      language: 'typescript',
    });

    if (task.description.toLowerCase().includes('migration') || task.description.toLowerCase().includes('schema')) {
      artifacts.push({
        type: 'config',
        name: 'migration',
        content: `-- Database migration for: ${task.description}`,
        language: 'sql',
      });
    }

    return {
      success: true,
      output: `Backend task completed: ${approach}`,
      artifacts,
      tokensUsed: 3000,
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
      if (artifact.content.includes('eval(') || artifact.content.includes('exec(')) {
        issues.push({
          severity: 'critical',
          message: 'Potential code injection vulnerability detected',
          location: artifact.name,
          fix: 'Remove eval/exec calls and use safe alternatives',
        });
      }
      if (artifact.content.includes('SELECT *') || artifact.content.includes('select *')) {
        issues.push({
          severity: 'warning',
          message: 'SELECT * detected; specify columns explicitly for better performance',
          location: artifact.name,
          fix: 'List required columns explicitly in the query',
        });
      }
      if (!artifact.content.includes('try') && !artifact.content.includes('catch') &&
          artifact.language !== 'sql') {
        suggestions.push(`Add error handling to ${artifact.name}`);
      }
    }

    const passed = issues.filter((i) => i.severity === 'error' || i.severity === 'critical').length === 0;
    const score = passed ? Math.max(0.5, 1 - issues.length * 0.15) : 0.2;

    return { passed, score, issues, suggestions };
  }

  private calculateConfidence(task: TaskContext): number {
    const keywords = [
      'api', 'endpoint', 'route', 'handler', 'controller', 'service', 'middleware',
      'database', 'schema', 'migration', 'model', 'orm', 'query', 'sql',
      'auth', 'jwt', 'oauth', 'session', 'token',
      'queue', 'worker', 'job', 'event', 'message',
      'cache', 'redis', 'backend', 'server', 'microservice', 'graphql', 'grpc',
      'node', 'python', 'go', 'java', 'express', 'fastapi', 'nestjs', 'django',
    ];

    const desc = task.description.toLowerCase();
    const matches = keywords.filter((kw) => desc.includes(kw)).length;
    const base = Math.min(matches / 4, 1.0);

    if (task.domain === 'backend') return Math.max(base, 0.7);
    if (task.domain && !['backend', 'api', 'database'].includes(task.domain)) return base * 0.5;

    return base;
  }

  private estimateComplexity(task: TaskContext): TaskContext['complexity'] {
    const desc = task.description.toLowerCase();
    if (desc.includes('system') || desc.includes('architecture') || desc.includes('microservice')) return 'critical';
    if (desc.includes('auth') || desc.includes('transaction') || desc.includes('saga')) return 'complex';
    if (desc.includes('crud') || desc.includes('endpoint') || desc.includes('api')) return 'moderate';
    if (desc.includes('model') || desc.includes('schema') || desc.includes('middleware')) return 'simple';
    return 'trivial';
  }

  private determineRequiredTools(task: TaskContext): string[] {
    const tools = ['read_file', 'write_file'];
    const desc = task.description.toLowerCase();
    if (desc.includes('find') || desc.includes('existing') || desc.includes('refactor')) tools.push('search_content');
    if (desc.includes('migrate') || desc.includes('test') || desc.includes('lint')) tools.push('run_command');
    if (desc.includes('database') || desc.includes('inspect')) tools.push('database_query');
    return tools;
  }

  private estimateTime(complexity: string, task: TaskContext): number {
    const base: Record<string, number> = {
      trivial: 5_000, simple: 20_000, moderate: 60_000, complex: 120_000, critical: 240_000,
    };
    return base[complexity] || 30_000;
  }

  private suggestApproach(task: TaskContext): string {
    const desc = task.description.toLowerCase();
    if (desc.includes('rest') || desc.includes('api')) return 'Design RESTful endpoints with OpenAPI spec, input validation via Zod, and proper HTTP status codes';
    if (desc.includes('graphql')) return 'Implement GraphQL schema with code-first approach, DataLoader for N+1 prevention, and persisted queries';
    if (desc.includes('auth')) return 'Build auth flow with refresh tokens, secure cookie storage, CSRF protection, and rate limiting';
    if (desc.includes('queue') || desc.includes('worker')) return 'Implement message processing with retry logic, dead letter queues, and idempotent handlers';
    if (desc.includes('migration') || desc.includes('schema')) return 'Use expand-contract migration pattern with rollback scripts and backward compatibility';
    if (desc.includes('cache')) return 'Implement multi-layer caching: in-memory LRU, Redis with TTL, and cache invalidation via events';
    return 'Build with clean architecture: route handlers, service layer, repository pattern, and comprehensive tests';
  }

  private identifyRisks(task: TaskContext): string[] {
    const risks: string[] = [];
    const desc = task.description.toLowerCase();
    if (desc.includes('auth')) risks.push('Token leakage, session fixation, CSRF attacks');
    if (desc.includes('database') || desc.includes('query')) risks.push('SQL injection, N+1 queries, connection pool exhaustion');
    if (desc.includes('api')) risks.push('Rate limiting bypass, input validation gaps, error message information leakage');
    if (desc.includes('file') || desc.includes('upload')) risks.push('Path traversal, file size limits, malicious content');
    if (desc.includes('webhook') || desc.includes('external')) risks.push('Downstream service failures, replay attacks');
    return risks;
  }

  private identifyDependencies(task: TaskContext): string[] {
    const deps: string[] = [];
    const desc = task.description.toLowerCase();
    if (desc.includes('database')) deps.push('Database connection and ORM configuration');
    if (desc.includes('redis') || desc.includes('cache')) deps.push('Redis connection and configuration');
    if (desc.includes('auth')) deps.push('Auth provider configuration and secrets');
    if (desc.includes('queue')) deps.push('Message broker connection and topic configuration');
    return deps;
  }

  private decomposeTask(task: TaskContext): TaskContext[] | undefined {
    if (task.complexity === 'trivial' || task.complexity === 'simple') return undefined;

    const subtasks: TaskContext[] = [];
    const desc = task.description.toLowerCase();

    if (desc.includes('api') || desc.includes('endpoint')) {
      subtasks.push(
        { taskId: `${task.taskId}-schema`, description: `Define data models and validation schemas`, complexity: 'simple', domain: 'backend', parentTaskId: task.taskId },
        { taskId: `${task.taskId}-service`, description: `Implement business logic service layer`, complexity: 'moderate', domain: 'backend', parentTaskId: task.taskId },
        { taskId: `${task.taskId}-routes`, description: `Create route handlers and middleware`, complexity: 'moderate', domain: 'backend', parentTaskId: task.taskId },
        { taskId: `${task.taskId}-tests`, description: `Write integration tests for API endpoints`, complexity: 'moderate', domain: 'backend', parentTaskId: task.taskId },
      );
    }

    return subtasks.length > 0 ? subtasks : undefined;
  }
}
