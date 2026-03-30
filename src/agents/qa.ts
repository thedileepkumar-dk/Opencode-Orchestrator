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

const QA_SYSTEM_PROMPT = `You are a Senior QA Engineer with 13+ years of experience in test strategy, automation, and quality advocacy across web, mobile, and backend systems.

## Your Expertise
You have deep mastery across the testing landscape:
- Unit testing: Jest, Vitest, Mocha, pytest, JUnit, Go testing
- Component testing: Testing Library (React/Vue/Svelte), Storybook interaction tests
- E2E testing: Playwright (preferred), Cypress, Detox (mobile), Appium
- API testing: Supertest, Postman/Newman, REST Assured, Pact (contract testing)
- Performance testing: k6, Artillery, Locust, Lighthouse CI
- Visual regression: Chromatic, Percy, Playwright screenshots
- Mutation testing: Stryker (JS/TS), mutmut (Python), pitest (Java)
- Coverage: Istanbul/nyc, c8, coverage.py, JaCoCo

## Your Testing Philosophy
You follow the test pyramid with pragmatic adjustments:
1. Unit tests (70%): fast, isolated, deterministic — test business logic and pure functions
2. Integration tests (20%): test component boundaries, API contracts, database interactions
3. E2E tests (10%): test critical user journeys, smoke tests for deployment verification
4. Supplement with: contract tests for microservices, property-based tests for parsers/algorithms

## Test Design Strategy
For every feature, you create:
- Happy path tests: expected inputs produce expected outputs
- Edge case tests: boundary values, empty inputs, maximum sizes
- Error path tests: invalid inputs, network failures, timeouts
- Regression tests: previously fixed bugs with their reproduction steps
- Accessibility tests: ARIA assertions, keyboard navigation verification

## Test Quality Metrics
You track and optimize for:
- Code coverage: line, branch, function — target 80%+ for critical paths
- Mutation score: target 70%+ for core business logic
- Test execution time: parallelize, shard, cache dependencies
- Flakiness rate: identify and fix or quarantine flaky tests
- Test-to-code ratio: ensure adequate coverage without test bloat

## Flaky Test Detection & Resolution
You diagnose flakiness systematically:
1. Timing issues: add proper waits, use waitFor, avoid arbitrary timeouts
2. Shared state: isolate tests, reset mocks, use fresh fixtures
3. External dependencies: mock or stub network, database, file system
4. Race conditions: use proper async patterns, avoid fire-and-forget
5. Non-deterministic data: use fixed seeds, deterministic factories

## E2E Testing Best Practices
- Page Object Model or App Actions pattern for maintainability
- Data-testid selectors over CSS/XPath for stability
- Custom fixtures for test data setup and teardown
- Parallel execution with proper isolation
- Retry logic for known flaky environments
- Screenshot and video capture on failure
- Trace recording for debugging

## Test Data Management
- Factory patterns (fishery, factory.ts) for test data generation
- Database seeding with idempotent operations
- Snapshot testing for complex output verification
- Faker.js / faker for realistic random data
- Fixtures for deterministic test inputs

## Code Style
- Arrange-Act-Assert pattern for test structure
- Descriptive test names: "should [expected behavior] when [condition]"
- One assertion concept per test (multiple .expect calls OK if related)
- Mock at the boundary, not inside the unit under test
- Prefer integration tests over heavily mocked unit tests

You produce tests that are readable, maintainable, fast, and actually catch bugs. You never write tests that pass when the code is broken.`;

export class QAAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      id: 'qa-agent',
      name: 'QA/Test Agent',
      domain: 'qa',
      version: '1.0.0',
      maxConcurrentTasks: 3,
      timeoutMs: 150_000,
      retryAttempts: 2,
      temperature: 0.2,
    };
    super(config);
  }

  protected defineCapabilities(): AgentCapability[] {
    return [
      {
        name: 'test_generation',
        description: 'Generate unit, integration, and E2E tests with proper assertions',
        confidence: 0.95,
        requiredTools: ['read_file', 'write_file', 'search_content'],
      },
      {
        name: 'coverage_analysis',
        description: 'Analyze test coverage and identify untested code paths',
        confidence: 0.91,
        requiredTools: ['read_file', 'run_command', 'search_content'],
      },
      {
        name: 'flaky_test_detection',
        description: 'Detect and fix flaky tests through pattern analysis and isolation',
        confidence: 0.88,
        requiredTools: ['read_file', 'search_content', 'run_command'],
      },
      {
        name: 'e2e_testing',
        description: 'Create end-to-end tests with Playwright or Cypress',
        confidence: 0.9,
        requiredTools: ['read_file', 'write_file', 'run_command'],
      },
      {
        name: 'api_testing',
        description: 'Write API contract tests, integration tests, and schema validation',
        confidence: 0.92,
        requiredTools: ['read_file', 'write_file', 'run_command'],
      },
      {
        name: 'mutation_testing',
        description: 'Run mutation testing to assess test suite quality',
        confidence: 0.83,
        requiredTools: ['read_file', 'run_command'],
      },
      {
        name: 'test_strategy',
        description: 'Design test strategies and test plans for features or systems',
        confidence: 0.89,
        requiredTools: ['read_file', 'list_files'],
      },
      {
        name: 'visual_regression',
        description: 'Set up visual regression testing with screenshot comparison',
        confidence: 0.85,
        requiredTools: ['read_file', 'write_file', 'run_command'],
      },
    ];
  }

  protected defineTools(): AgentTool[] {
    return [
      {
        name: 'read_file',
        description: 'Read source code to understand what to test',
        parameters: { path: 'string' },
        required: true,
      },
      {
        name: 'write_file',
        description: 'Write test files, fixtures, and test utilities',
        parameters: { path: 'string', content: 'string' },
        required: true,
      },
      {
        name: 'search_content',
        description: 'Search for existing tests, test patterns, and untested functions',
        parameters: { pattern: 'string', include: 'string' },
        required: true,
      },
      {
        name: 'list_files',
        description: 'List test files and understand test directory structure',
        parameters: { pattern: 'string' },
        required: false,
      },
      {
        name: 'run_command',
        description: 'Run test suites, linters, and coverage reports',
        parameters: { command: 'string', timeout: 'number' },
        required: true,
      },
    ];
  }

  getSystemPrompt(): string {
    return QA_SYSTEM_PROMPT;
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
      type: 'test',
      name: 'test-implementation',
      content: `// Test implementation for: ${task.description}\n// Approach: ${approach}\n\ndescribe('TODO', () => {\n  it('should work', () => {\n    // Arrange\n    // Act\n    // Assert\n  });\n});`,
      language: 'typescript',
    });

    return {
      success: true,
      output: `QA task completed: ${approach}`,
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
      if (artifact.type === 'test') {
        const content = artifact.content;

        if (!content.includes('describe(') && !content.includes('test(') && !content.includes('it(')) {
          issues.push({
            severity: 'error',
            message: 'Test file missing test structure (describe/it blocks)',
            location: artifact.name,
            fix: 'Add proper test framework structure',
          });
        }
        if (content.includes('.only(')) {
          issues.push({
            severity: 'warning',
            message: 'Test contains .only which will skip other tests',
            location: artifact.name,
            fix: 'Remove .only before committing',
          });
        }
        if (content.includes('.skip(')) {
          suggestions.push(`Test ${artifact.name} contains .skip — ensure this is intentional`);
        }
        if (content.includes('setTimeout') && !content.includes('jest.advanceTimersByTime')) {
          suggestions.push('Consider using fake timers instead of real setTimeout in tests');
        }
      }
    }

    const passed = issues.filter((i) => i.severity === 'error' || i.severity === 'critical').length === 0;
    const score = passed ? Math.max(0.6, 1 - issues.length * 0.1) : 0.3;

    return { passed, score, issues, suggestions };
  }

  private calculateConfidence(task: TaskContext): number {
    const keywords = [
      'test', 'spec', 'jest', 'vitest', 'mocha', 'pytest', 'junit',
      'playwright', 'cypress', 'e2e', 'end-to-end', 'integration',
      'unit test', 'coverage', 'mutation', 'flaky', 'assertion',
      'mock', 'stub', 'spy', 'fixture', 'factory', 'seed',
      'qa', 'quality', 'regression', 'smoke', 'sanity',
      'tdd', 'bdd', 'assert', 'expect', 'should',
    ];

    const desc = task.description.toLowerCase();
    const matches = keywords.filter((kw) => desc.includes(kw)).length;
    const base = Math.min(matches / 3, 1.0);

    if (task.domain === 'qa' || task.domain === 'test') return Math.max(base, 0.7);
    return base;
  }

  private estimateComplexity(task: TaskContext): TaskContext['complexity'] {
    const desc = task.description.toLowerCase();
    if (desc.includes('strategy') || desc.includes('full') || desc.includes('system')) return 'critical';
    if (desc.includes('e2e') || desc.includes('integration') || desc.includes('mutation')) return 'complex';
    if (desc.includes('component') || desc.includes('api') || desc.includes('feature')) return 'moderate';
    if (desc.includes('unit') || desc.includes('function') || desc.includes('utility')) return 'simple';
    return 'trivial';
  }

  private determineRequiredTools(task: TaskContext): string[] {
    const tools = ['read_file', 'write_file'];
    const desc = task.description.toLowerCase();
    if (desc.includes('existing') || desc.includes('find') || desc.includes('coverage')) tools.push('search_content');
    if (desc.includes('run') || desc.includes('execute') || desc.includes('coverage') || desc.includes('mutation')) tools.push('run_command');
    return tools;
  }

  private estimateTime(complexity: string, task: TaskContext): number {
    const base: Record<string, number> = {
      trivial: 3_000, simple: 10_000, moderate: 30_000, complex: 60_000, critical: 120_000,
    };
    const fileMultiplier = Math.max(1, (task.filePaths?.length || 1) * 0.4);
    return (base[complexity] || 20_000) * fileMultiplier;
  }

  private suggestApproach(task: TaskContext): string {
    const desc = task.description.toLowerCase();
    if (desc.includes('e2e') || desc.includes('playwright')) return 'Write Playwright E2E tests with page objects, data-testid selectors, and trace recording on failure';
    if (desc.includes('unit')) return 'Write unit tests with Arrange-Act-Assert pattern, proper mocking at boundaries, and edge case coverage';
    if (desc.includes('api')) return 'Create API tests with Supertest: happy path, error responses, schema validation, and contract verification';
    if (desc.includes('coverage')) return 'Run coverage analysis, identify untested branches, and generate targeted tests for critical paths';
    if (desc.includes('flaky')) return 'Diagnose flaky tests: check timing, shared state, external deps, race conditions; fix or quarantine';
    if (desc.includes('mutation')) return 'Run Stryker mutation testing, analyze surviving mutants, and add tests to kill weak mutation targets';
    return 'Analyze code paths, create comprehensive test suite with proper isolation, fixtures, and assertions';
  }

  private identifyRisks(task: TaskContext): string[] {
    const risks: string[] = [];
    const desc = task.description.toLowerCase();
    if (desc.includes('e2e')) risks.push('E2E tests are slower and more fragile; keep the suite focused on critical paths');
    if (desc.includes('mock')) risks.push('Over-mocking can create tests that pass with broken code; prefer integration tests');
    if (desc.includes('snapshot')) risks.push('Snapshot tests can become update-all-when-changed noise; use sparingly');
    return risks;
  }

  private identifyDependencies(task: TaskContext): string[] {
    const deps: string[] = [];
    const desc = task.description.toLowerCase();
    if (desc.includes('e2e') || desc.includes('playwright')) deps.push('Playwright installed with browsers');
    if (desc.includes('cypress')) deps.push('Cypress installed and configured');
    if (desc.includes('api')) deps.push('Test server or mock server available');
    return deps;
  }

  private decomposeTask(task: TaskContext): TaskContext[] | undefined {
    if (task.complexity === 'trivial' || task.complexity === 'simple') return undefined;

    const subtasks: TaskContext[] = [];
    const desc = task.description.toLowerCase();

    if (desc.includes('feature') || desc.includes('full')) {
      subtasks.push(
        { taskId: `${task.taskId}-unit`, description: `Write unit tests for ${task.description}`, complexity: 'moderate', domain: 'qa', parentTaskId: task.taskId },
        { taskId: `${task.taskId}-integration`, description: `Write integration tests for ${task.description}`, complexity: 'moderate', domain: 'qa', parentTaskId: task.taskId },
        { taskId: `${task.taskId}-e2e`, description: `Write E2E smoke tests for ${task.description}`, complexity: 'simple', domain: 'qa', parentTaskId: task.taskId },
      );
    }

    return subtasks.length > 0 ? subtasks : undefined;
  }
}
