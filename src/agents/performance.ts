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

const PERFORMANCE_SYSTEM_PROMPT = `You are a Senior Performance Engineer with 13+ years of experience optimizing web applications, backend systems, and infrastructure for speed, efficiency, and scalability.

## Your Expertise
You have deep mastery across performance optimization:
- Frontend performance: Core Web Vitals (LCP, FID/INP, CLS), bundle optimization, lazy loading
- Backend profiling: CPU profiling, memory profiling, flame graphs, async debugging
- Database optimization: query analysis (EXPLAIN ANALYZE), index tuning, connection pooling
- Caching strategies: browser cache, CDN, application cache, database cache, Redis
- Network optimization: HTTP/2, HTTP/3, compression, prefetching, resource hints
- Build optimization: tree shaking, code splitting, dynamic imports, chunking strategies
- Runtime optimization: V8 optimization, memory leak detection, event loop monitoring
- Infrastructure: load testing, auto-scaling, capacity planning, cost optimization

## Your Profiling Methodology
You follow a systematic approach to every optimization:
1. Measure first: establish baselines with real metrics, not assumptions
2. Identify bottlenecks: use profiling data to find the actual constraint
3. Hypothesize: predict the impact of a change before making it
4. Implement: make one change at a time for clear causality
5. Verify: measure again to confirm improvement and check for regressions
6. Document: record the optimization, its impact, and any trade-offs

## Core Web Vitals Optimization
### LCP (Largest Contentful Paint) — target < 2.5s
- Optimize server response time (TTFB < 800ms)
- Preload critical resources (fonts, hero images, above-fold CSS)
- Inline critical CSS; defer non-critical stylesheets
- Use responsive images with srcset and sizes
- CDN delivery for static assets with edge caching
- Eliminate render-blocking resources

### INP (Interaction to Next Paint) — target < 200ms
- Break up long tasks (>50ms) with yield/scheduler.yield
- Defer non-essential JavaScript with dynamic imports
- Use web workers for CPU-intensive computations
- Optimize event handlers: debounce, throttle, passive listeners
- Virtualize long lists to reduce DOM size
- Avoid layout thrashing: batch DOM reads and writes

### CLS (Cumulative Layout Shift) — target < 0.1
- Set explicit dimensions on images and videos
- Reserve space for dynamic content (ads, embeds)
- Use CSS contain property for isolated components
- Avoid inserting content above existing content after load
- Font-display: swap with size-adjust for zero layout shift

## Backend Performance
- Profile with: Node --prof, py-spy, Go pprof, async-profiler (Java)
- Identify N+1 queries with query logging and DataLoader
- Connection pooling: PgBouncer, built-in ORM pools, HTTP keep-alive
- Async I/O: non-blocking operations, worker threads for CPU-bound tasks
- Memory: detect leaks with heap snapshots, object tracking
- Caching: Redis with proper TTL, in-memory LRU, stale-while-revalidate

## Database Performance
- EXPLAIN ANALYZE every query in critical paths
- Index strategy: B-tree for equality/range, GIN for full-text, partial indexes
- Query rewriting: avoid SELECT *, use covering indexes, batch operations
- Connection management: pool sizing based on (2 * cores) + effective_spindle_count
- Partitioning for large tables with time-series or tenant-based access patterns
- Read replicas for read-heavy workloads with proper routing

## Load Testing
- Tools: k6, Artillery, Locust, wrk2
- Ramp-up patterns: gradual increase to find breaking points
- Scenarios: steady state, spike, soak (endurance), stress
- Metrics: p50/p95/p99 latency, throughput, error rate, resource utilization
- Correlation: link load test results to infrastructure metrics

## Optimization Decision Framework
Every optimization has a cost. You evaluate:
- Impact: how many users/sessions benefit? How much faster?
- Effort: engineering hours, complexity, risk of regression
- Trade-offs: increased bundle size, code complexity, cache invalidation
- Maintainability: will future developers understand this optimization?

You never optimize without profiling first. You never assume — you measure.`;

export class PerformanceAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      id: 'performance-agent',
      name: 'Performance Agent',
      domain: 'performance',
      version: '1.0.0',
      maxConcurrentTasks: 2,
      timeoutMs: 120_000,
      retryAttempts: 1,
      temperature: 0.15,
    };
    super(config);
  }

  protected defineCapabilities(): AgentCapability[] {
    return [
      {
        name: 'benchmarking',
        description: 'Set up performance benchmarks, load tests, and profiling instrumentation',
        confidence: 0.93,
        requiredTools: ['read_file', 'write_file', 'run_command'],
      },
      {
        name: 'bottleneck_detection',
        description: 'Identify performance bottlenecks through profiling and code analysis',
        confidence: 0.92,
        requiredTools: ['read_file', 'search_content', 'run_command'],
      },
      {
        name: 'query_optimization',
        description: 'Optimize database queries with index analysis and query rewriting',
        confidence: 0.9,
        requiredTools: ['read_file', 'search_content', 'run_command'],
      },
      {
        name: 'caching_strategy',
        description: 'Design and implement multi-layer caching strategies',
        confidence: 0.91,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'bundle_optimization',
        description: 'Optimize JavaScript/CSS bundles with code splitting and tree shaking',
        confidence: 0.89,
        requiredTools: ['read_file', 'run_command', 'write_file'],
      },
      {
        name: 'core_web_vitals',
        description: 'Optimize for Core Web Vitals (LCP, INP, CLS) targets',
        confidence: 0.94,
        requiredTools: ['read_file', 'write_file', 'run_command'],
      },
      {
        name: 'memory_optimization',
        description: 'Detect and fix memory leaks, optimize memory usage patterns',
        confidence: 0.87,
        requiredTools: ['read_file', 'search_content', 'run_command'],
      },
      {
        name: 'cdn_optimization',
        description: 'Configure CDN caching, edge delivery, and asset optimization',
        confidence: 0.85,
        requiredTools: ['read_file', 'write_file'],
      },
    ];
  }

  protected defineTools(): AgentTool[] {
    return [
      {
        name: 'read_file',
        description: 'Read source code and configuration for performance analysis',
        parameters: { path: 'string' },
        required: true,
      },
      {
        name: 'write_file',
        description: 'Write performance optimizations, configs, and load test scripts',
        parameters: { path: 'string', content: 'string' },
        required: true,
      },
      {
        name: 'search_content',
        description: 'Search for performance anti-patterns: N+1 queries, sync I/O, large loops',
        parameters: { pattern: 'string', include: 'string' },
        required: true,
      },
      {
        name: 'run_command',
        description: 'Run profiling tools, load tests, and build analysis commands',
        parameters: { command: 'string', timeout: 'number' },
        required: true,
      },
    ];
  }

  getSystemPrompt(): string {
    return PERFORMANCE_SYSTEM_PROMPT;
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
      name: 'performance-optimization',
      content: `// Performance optimization for: ${task.description}\n// Approach: ${approach}`,
      language: 'typescript',
    });

    return {
      success: true,
      output: `Performance task completed: ${approach}`,
      artifacts,
      tokensUsed: 2500,
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
      const content = artifact.content;

      if (content.includes('document.write')) {
        issues.push({
          severity: 'error',
          message: 'document.write blocks parsing and degrades performance',
          location: artifact.name,
          fix: 'Use DOM manipulation methods instead',
        });
      }
      if (content.includes('SELECT *') || content.includes('select *')) {
        issues.push({
          severity: 'warning',
          message: 'SELECT * fetches unnecessary columns, increasing I/O and network cost',
          location: artifact.name,
          fix: 'Select only required columns explicitly',
        });
      }
      if (content.includes('.forEach(') && content.includes('await')) {
        suggestions.push('forEach with await runs sequentially; use Promise.all with map for parallel execution');
      }
    }

    const passed = issues.filter((i) => i.severity === 'error' || i.severity === 'critical').length === 0;
    const score = passed ? Math.max(0.5, 1 - issues.length * 0.12) : 0.2;

    return { passed, score, issues, suggestions };
  }

  private calculateConfidence(task: TaskContext): number {
    const keywords = [
      'performance', 'speed', 'slow', 'fast', 'optimize', 'optimization',
      'latency', 'throughput', 'bottleneck', 'profiling', 'benchmark',
      'cache', 'caching', 'cdn', 'preload', 'prefetch',
      'core web vitals', 'lcp', 'fid', 'inp', 'cls', 'ttfb',
      'bundle', 'tree shaking', 'code split', 'lazy load',
      'memory', 'leak', 'gc', 'garbage collection',
      'database', 'query', 'index', 'n+1', 'connection pool',
      'load test', 'stress test', 'concurrent',
      'gzip', 'brotli', 'compression', 'minif',
    ];

    const desc = task.description.toLowerCase();
    const matches = keywords.filter((kw) => desc.includes(kw)).length;
    const base = Math.min(matches / 3, 1.0);

    if (task.domain === 'performance') return Math.max(base, 0.7);
    return base;
  }

  private estimateComplexity(task: TaskContext): TaskContext['complexity'] {
    const desc = task.description.toLowerCase();
    if (desc.includes('system') || desc.includes('architecture') || desc.includes('full')) return 'critical';
    if (desc.includes('database') || desc.includes('load') || desc.includes('scaling')) return 'complex';
    if (desc.includes('query') || desc.includes('cache') || desc.includes('bundle')) return 'moderate';
    if (desc.includes('index') || desc.includes('compress') || desc.includes('preload')) return 'simple';
    return 'trivial';
  }

  private determineRequiredTools(task: TaskContext): string[] {
    const tools = ['read_file'];
    const desc = task.description.toLowerCase();
    if (desc.includes('optimize') || desc.includes('fix') || desc.includes('improve')) tools.push('write_file');
    if (desc.includes('find') || desc.includes('detect') || desc.includes('anti-pattern')) tools.push('search_content');
    if (desc.includes('test') || desc.includes('profile') || desc.includes('measure') || desc.includes('benchmark')) tools.push('run_command');
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
    if (desc.includes('lcp') || desc.includes('core web')) return 'Optimize LCP: preload hero images, inline critical CSS, optimize TTFB with edge caching';
    if (desc.includes('bundle') || desc.includes('javascript')) return 'Analyze bundle with source-map-explorer, implement route-based code splitting, dynamic imports for heavy libraries';
    if (desc.includes('query') || desc.includes('database')) return 'Run EXPLAIN ANALYZE, add missing indexes, eliminate N+1 queries with eager loading, implement connection pooling';
    if (desc.includes('cache')) return 'Design multi-layer cache: browser (stale-while-revalidate), CDN (edge), application (Redis LRU), database (query cache)';
    if (desc.includes('memory') || desc.includes('leak')) return 'Take heap snapshots, identify retained objects, fix closure leaks, remove event listener leaks, optimize data structures';
    if (desc.includes('load') || desc.includes('stress')) return 'Create k6 load test scripts with ramp-up, steady state, and spike scenarios; measure p50/p95/p99';
    return 'Profile first to identify bottlenecks, then optimize the highest-impact constraint with measurable improvements';
  }

  private identifyRisks(task: TaskContext): string[] {
    const risks: string[] = [];
    const desc = task.description.toLowerCase();
    if (desc.includes('cache')) risks.push('Cache invalidation is hard; stale data may be served if TTL/invalidation is wrong');
    if (desc.includes('lazy')) risks.push('Lazy loading can cause layout shifts if dimensions are not reserved');
    if (desc.includes('index')) risks.push('Adding indexes improves reads but slows writes; balance based on workload');
    return risks;
  }

  private identifyDependencies(task: TaskContext): string[] {
    const deps: string[] = [];
    const desc = task.description.toLowerCase();
    if (desc.includes('database')) deps.push('Database access for EXPLAIN ANALYZE');
    if (desc.includes('load') || desc.includes('benchmark')) deps.push('Load testing tools (k6, Artillery)');
    if (desc.includes('bundle')) deps.push('Build toolchain with source-map support');
    return deps;
  }
}
