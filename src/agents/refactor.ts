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

const REFACTOR_SYSTEM_PROMPT = `You are a Principal Engineer with 16+ years of experience leading large-scale codebase transformations, eliminating technical debt, and mentoring teams on clean code practices.

## Your Expertise
You have deep mastery across software craftsmanship:
- Design patterns: GoF, SOLID, GRASP, domain-driven design (DDD), CQRS/Event Sourcing
- Code smells: Martin Fowler's catalog, anti-patterns, god objects, feature envy, shotgun surgery
- Refactoring techniques: 60+ cataloged refactorings from Fowler's Refactoring book
- Tech debt management: identification, prioritization, quantification, repayment strategies
- Architecture fitness: dependency analysis, coupling metrics, cohesion measurement
- Legacy code: characterization tests, seam identification, strangler fig pattern
- Clean architecture: hexagonal, onion, vertical slice, modular monolith
- Migration strategies: incrementally migrate, parallel run, feature toggles

## Your Refactoring Philosophy
You follow these principles:
1. Refactor with tests: never refactor without a safety net of tests
2. Small steps: each refactoring commit should be independently reviewable and reversible
3. Boy Scout Rule: leave the code cleaner than you found it, every time
4. Measure improvement: use metrics (complexity, coupling, coverage) to prove value
5. Communicate clearly: explain the "why" before the "what" for every change
6. Don't over-engineer: refactor to the level of abstraction the problem requires

## Code Smell Detection
You systematically identify:

### Bloaters
- Long method/function (>30 lines): extract method, replace temp with query
- Large class (>200 lines): extract class, extract subclass, extract interface
- Long parameter list (>4 params): introduce parameter object, builder pattern
- Primitive obsession: introduce domain objects, replace type code with class
- Data clumps: extract class for the recurring data group

### Object-Orientation Abusers
- Switch statements: replace conditional with polymorphism, strategy pattern
- Refused bequest: replace inheritance with delegation
- Alternative classes with different interfaces: extract shared interface
- Lazy class: inline class if it doesn't justify its existence

### Change Preventers
- Divergent change: extract class to isolate different change reasons
- Shotgun surgery: inline class or move method to consolidate changes
- Parallel inheritance hierarchies: merge hierarchies or use composition

### Dispensables
- Comments: refactor code to be self-documenting; remove redundant comments
- Duplicate code: extract method, pull up method, template method
- Dead code: remove unused code paths, imports, variables, functions
- Speculative generality: remove unused abstractions and parameters

### Couplers
- Feature envy: move method to the class it's most interested in
- Inappropriate intimacy: extract shared class, change bidirectional to unidirectional
- Message chains: hide delegate, extract method for the traversal
- Middle man: remove middle man, inline delegate

## Design Pattern Application
You apply patterns when they simplify, not complicate:
- Strategy: when algorithms vary and need runtime switching
- Factory Method: when object creation needs to be decoupled from usage
- Observer: when state changes need to notify multiple dependents
- Decorator: when behavior needs to be added dynamically
- Command: when operations need to be queued, logged, or undone
- Repository: when data access needs to be abstracted from business logic
- Builder: when complex objects need step-by-step construction
- Facade: when a simplified interface is needed for a complex subsystem

## Technical Debt Management
You categorize and prioritize debt:
1. Reckless/Inadvertent: "We didn't know" — highest priority, fix ASAP
2. Reckless/Deliberate: "We didn't have time" — schedule for next sprint
3. Prudent/Inadvertent: "Now we know" — plan systematic fix
4. Prudent/Deliberate: "We chose this" — document and monitor

## Dead Code Detection
- Unused imports and variables
- Unreachable code branches
- Deprecated functions still in codebase
- Feature flags for shipped features
- Commented-out code blocks
- Unused dependencies in package files
- Unused test fixtures and mocks
- Orphaned files not referenced anywhere

## Migration Planning
For major refactorings, you create:
- Step-by-step migration plan with rollback points
- Feature flag strategy for gradual rollout
- Test plan for each migration step
- Risk assessment and mitigation for each step
- Timeline estimate with confidence intervals
- Communication plan for team stakeholders

You never refactor just for aesthetics. Every refactoring must improve readability, maintainability, testability, or performance with measurable evidence.`;

export class RefactorAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      id: 'refactor-agent',
      name: 'Refactor Agent',
      domain: 'refactor',
      version: '1.0.0',
      maxConcurrentTasks: 2,
      timeoutMs: 150_000,
      retryAttempts: 2,
      temperature: 0.2,
    };
    super(config);
  }

  protected defineCapabilities(): AgentCapability[] {
    return [
      {
        name: 'dead_code_detection',
        description: 'Identify and remove unused code: imports, functions, variables, branches',
        confidence: 0.92,
        requiredTools: ['read_file', 'search_content', 'list_files'],
      },
      {
        name: 'pattern_application',
        description: 'Apply design patterns (Strategy, Factory, Observer, etc.) to improve code structure',
        confidence: 0.9,
        requiredTools: ['read_file', 'write_file', 'search_content'],
      },
      {
        name: 'code_smell_detection',
        description: 'Identify code smells: long methods, large classes, duplication, feature envy',
        confidence: 0.91,
        requiredTools: ['read_file', 'search_content'],
      },
      {
        name: 'migration_planning',
        description: 'Plan incremental migration strategies for large-scale refactoring',
        confidence: 0.88,
        requiredTools: ['read_file', 'list_files'],
      },
      {
        name: 'dependency_analysis',
        description: 'Analyze module dependencies, coupling, and suggest decoupling strategies',
        confidence: 0.87,
        requiredTools: ['read_file', 'search_content', 'list_files'],
      },
      {
        name: 'type_improvement',
        description: 'Improve type safety: eliminate any, add proper generics, narrow union types',
        confidence: 0.89,
        requiredTools: ['read_file', 'write_file', 'search_content'],
      },
      {
        name: 'testability_improvement',
        description: 'Improve code testability through dependency injection and interface extraction',
        confidence: 0.86,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'naming_improvement',
        description: 'Improve naming conventions for clarity and consistency',
        confidence: 0.85,
        requiredTools: ['read_file', 'write_file', 'search_content'],
      },
    ];
  }

  protected defineTools(): AgentTool[] {
    return [
      {
        name: 'read_file',
        description: 'Read source code to analyze for refactoring opportunities',
        parameters: { path: 'string' },
        required: true,
      },
      {
        name: 'write_file',
        description: 'Write refactored code with improved structure',
        parameters: { path: 'string', content: 'string' },
        required: true,
      },
      {
        name: 'search_content',
        description: 'Search for code smells, unused imports, duplicates, and anti-patterns',
        parameters: { pattern: 'string', include: 'string' },
        required: true,
      },
      {
        name: 'list_files',
        description: 'List files to understand project structure and find orphaned files',
        parameters: { pattern: 'string' },
        required: false,
      },
      {
        name: 'run_command',
        description: 'Run linters, type checkers, and test suites to verify refactoring safety',
        parameters: { command: 'string', timeout: 'number' },
        required: true,
      },
    ];
  }

  getSystemPrompt(): string {
    return REFACTOR_SYSTEM_PROMPT;
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
      name: 'refactor-output',
      content: `// Refactoring for: ${task.description}\n// Approach: ${approach}\n\n// Original code analysis and refactored version would appear here`,
      language: 'typescript',
    });

    return {
      success: true,
      output: `Refactoring task completed: ${approach}`,
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
      const content = artifact.content;

      if (content.includes('any') && artifact.language === 'typescript') {
        issues.push({
          severity: 'warning',
          message: 'TypeScript "any" type detected; refactoring should improve type safety',
          location: artifact.name,
          fix: 'Replace "any" with proper types or unknown',
        });
      }
      if (content.length > 5000 && !content.includes('\n\n')) {
        suggestions.push('Consider adding section comments for very long files');
      }
    }

    const passed = issues.filter((i) => i.severity === 'error' || i.severity === 'critical').length === 0;
    const score = passed ? Math.max(0.5, 1 - issues.length * 0.1) : 0.3;

    return { passed, score, issues, suggestions };
  }

  private calculateConfidence(task: TaskContext): number {
    const keywords = [
      'refactor', 'clean', 'simplify', 'restructure', 'reorganize',
      'dead code', 'unused', 'remove', 'delete',
      'design pattern', 'pattern', 'abstract', 'extract', 'inline',
      'tech debt', 'technical debt', 'debt', 'smell',
      'duplicate', 'duplication', 'dry',
      'coupling', 'cohesion', 'dependency',
      'migration', 'migrate', 'modernize', 'legacy',
      'type safety', 'strict', 'any type',
      'naming', 'convention', 'consistency',
    ];

    const desc = task.description.toLowerCase();
    const matches = keywords.filter((kw) => desc.includes(kw)).length;
    const base = Math.min(matches / 3, 1.0);

    if (task.domain === 'refactor' || task.domain === 'cleanup') return Math.max(base, 0.7);
    return base;
  }

  private estimateComplexity(task: TaskContext): TaskContext['complexity'] {
    const desc = task.description.toLowerCase();
    if (desc.includes('architecture') || desc.includes('migration') || desc.includes('legacy')) return 'critical';
    if (desc.includes('pattern') || desc.includes('system') || desc.includes('rewrite')) return 'complex';
    if (desc.includes('module') || desc.includes('class') || desc.includes('extract')) return 'moderate';
    if (desc.includes('function') || desc.includes('dead code')) return 'simple';
    return 'trivial';
  }

  private determineRequiredTools(task: TaskContext): string[] {
    const tools = ['read_file'];
    const desc = task.description.toLowerCase();
    if (desc.includes('refactor') || desc.includes('extract') || desc.includes('move')) tools.push('write_file');
    if (desc.includes('dead') || desc.includes('unused') || desc.includes('duplicate') || desc.includes('find')) tools.push('search_content');
    if (desc.includes('test') || desc.includes('verify') || desc.includes('lint')) tools.push('run_command');
    if (desc.includes('project') || desc.includes('structure') || desc.includes('orphan')) tools.push('list_files');
    return tools;
  }

  private estimateTime(complexity: string, task: TaskContext): number {
    const base: Record<string, number> = {
      trivial: 3_000, simple: 10_000, moderate: 30_000, complex: 80_000, critical: 150_000,
    };
    const fileMultiplier = Math.max(1, (task.filePaths?.length || 1) * 0.3);
    return (base[complexity] || 20_000) * fileMultiplier;
  }

  private suggestApproach(task: TaskContext): string {
    const desc = task.description.toLowerCase();
    if (desc.includes('dead code')) return 'Identify unused imports, functions, variables, and files; verify with coverage data and static analysis; remove systematically';
    if (desc.includes('pattern') || desc.includes('strategy') || desc.includes('factory')) return 'Identify the pattern opportunity, extract interface, implement pattern, update callers incrementally';
    if (desc.includes('duplicate')) return 'Identify duplicate code blocks, extract common logic into shared functions, parameterize differences';
    if (desc.includes('extract') || desc.includes('class')) return 'Identify cohesive responsibilities, create new class with clear interface, migrate methods incrementally';
    if (desc.includes('type')) return 'Enable strict mode, eliminate any types, add proper generics, narrow union types, add runtime validation at boundaries';
    if (desc.includes('migration') || desc.includes('legacy')) return 'Apply strangler fig pattern: wrap legacy code, route new features to new code, gradually migrate';
    if (desc.includes('naming')) return 'Audit naming for clarity, consistency, and convention adherence; rename with automated refactoring tools';
    return 'Analyze code for smells, apply appropriate refactorings in small steps with tests, verify no behavior change';
  }

  private identifyRisks(task: TaskContext): string[] {
    const risks: string[] = [];
    const desc = task.description.toLowerCase();
    if (desc.includes('dead code')) risks.push('Dead code might be used via reflection, dynamic imports, or external consumers; verify carefully');
    if (desc.includes('pattern')) risks.push('Over-applying patterns adds complexity; use patterns only where they simplify');
    if (desc.includes('rename') || desc.includes('move')) risks.push('Renaming/moving can break imports across the codebase; ensure all references are updated');
    if (desc.includes('extract')) risks.push('Extracting classes/modules changes import paths; may break build or runtime imports');
    return risks;
  }

  private identifyDependencies(task: TaskContext): string[] {
    const deps: string[] = [];
    const desc = task.description.toLowerCase();
    if (desc.includes('test') || desc.includes('safe')) deps.push('Existing test suite for behavior verification');
    if (desc.includes('lint') || desc.includes('type')) deps.push('Linting and type-checking tools configured');
    return deps;
  }

  private decomposeTask(task: TaskContext): TaskContext[] | undefined {
    if (task.complexity === 'trivial' || task.complexity === 'simple') return undefined;

    const subtasks: TaskContext[] = [];

    if (task.description.toLowerCase().includes('migration') || task.description.toLowerCase().includes('legacy')) {
      subtasks.push(
        { taskId: `${task.taskId}-analysis`, description: `Analyze current codebase and identify migration boundaries`, complexity: 'moderate', domain: 'refactor', parentTaskId: task.taskId },
        { taskId: `${task.taskId}-tests`, description: `Add characterization tests for existing behavior`, complexity: 'moderate', domain: 'qa', parentTaskId: task.taskId },
        { taskId: `${task.taskId}-implement`, description: `Implement incremental refactoring steps`, complexity: 'complex', domain: 'refactor', parentTaskId: task.taskId },
        { taskId: `${task.taskId}-verify`, description: `Verify behavior preservation through test suite`, complexity: 'simple', domain: 'qa', parentTaskId: task.taskId },
      );
    }

    return subtasks.length > 0 ? subtasks : undefined;
  }
}
