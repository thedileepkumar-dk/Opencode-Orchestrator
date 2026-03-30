import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  HealingAttempt,
  SubTask,
  TaskResult,
} from './types.js';

interface TestRunner {
  name: string;
  command: string;
  parseOutput: (stdout: string, stderr: string, exitCode: number) => TestResult;
}

interface TestResult {
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  errors: ParsedError[];
  duration: number;
  rawOutput: string;
}

interface ParsedError {
  file: string;
  line: number;
  column: number;
  message: string;
  code?: string;
  severity: 'error' | 'warning';
}

interface HealingConfig {
  maxRetries: number;
  retryDelayMs: number;
  escalateAfter: number;
  autoFixPatterns: Map<RegExp, string>;
  testRunners: TestRunner[];
}

interface HealingResult {
  success: boolean;
  taskId: string;
  totalAttempts: number;
  attempts: HealingAttempt[];
  finalError?: string;
  escalated: boolean;
}

interface ErrorPattern {
  pattern: RegExp;
  category: string;
  fixStrategy: string;
  confidence: number;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  { pattern: /Cannot find module ['"](.+?)['"]/i, category: 'missing-import', fixStrategy: 'Install missing module or add import path', confidence: 0.9 },
  { pattern: /Type '(.+?)' is not assignable to type '(.+?)'/i, category: 'type-error', fixStrategy: 'Fix type mismatch or add type assertion', confidence: 0.85 },
  { pattern: /Property ['"](.+?)['"] does not exist on type ['"](.+?)['"]/i, category: 'property-error', fixStrategy: 'Add property to type or use optional chaining', confidence: 0.85 },
  { pattern: /Unexpected token/i, category: 'syntax-error', fixStrategy: 'Fix syntax error near the reported location', confidence: 0.8 },
  { pattern: /ReferenceError:\s*(.+?)\s+is not defined/i, category: 'undefined-var', fixStrategy: 'Define variable or add import', confidence: 0.85 },
  { pattern: /TypeError:\s*(.+?)\s+is not a function/i, category: 'not-function', fixStrategy: 'Check if the value is callable before invoking', confidence: 0.8 },
  { pattern: /ENOENT.*no such file or directory/i, category: 'file-not-found', fixStrategy: 'Create missing file or fix path', confidence: 0.9 },
  { pattern: /EACCES.*permission denied/i, category: 'permission', fixStrategy: 'Fix file permissions', confidence: 0.7 },
  { pattern: /SyntaxError.*Unexpected end of JSON input/i, category: 'json-error', fixStrategy: 'Fix JSON syntax', confidence: 0.9 },
  { pattern: /Expected (.+?),? found ['"](.+?)['"]/i, category: 'parse-error', fixStrategy: 'Fix parsing error at reported location', confidence: 0.75 },
  { pattern: /(.+?) is not exported from ['"](.+?)['"]/i, category: 'export-error', fixStrategy: 'Add export to source module or fix import name', confidence: 0.85 },
  { pattern: /Circular dependency/i, category: 'circular-dep', fixStrategy: 'Restructure imports to remove circular dependency', confidence: 0.7 },
];

const DEFAULT_RUNNERS: TestRunner[] = [
  {
    name: 'vitest',
    command: 'npx vitest run --reporter=json 2>&1',
    parseOutput: (stdout, _stderr, exitCode) => parseJsonTestOutput(stdout, exitCode),
  },
  {
    name: 'jest',
    command: 'npx jest --json 2>&1',
    parseOutput: (stdout, _stderr, exitCode) => parseJsonTestOutput(stdout, exitCode),
  },
  {
    name: 'eslint',
    command: 'npx eslint . --format json 2>&1',
    parseOutput: (stdout, _stderr, exitCode) => parseLintOutput(stdout, exitCode),
  },
  {
    name: 'tsc',
    command: 'npx tsc --noEmit 2>&1',
    parseOutput: (stdout, stderr, exitCode) => parseTscOutput(stdout || stderr, exitCode),
  },
];

function parseJsonTestOutput(stdout: string, exitCode: number): TestResult {
  try {
    const json = JSON.parse(stdout);
    const totalTests = json.numTotalTests ?? json.testResults?.reduce((s: number, r: any) => s + (r.testResults?.length ?? 0), 0) ?? 0;
    const passedTests = json.numPassedTests ?? json.testResults?.reduce((s: number, r: any) => s + (r.testResults?.filter((t: any) => t.status === 'passed').length ?? 0), 0) ?? 0;
    const failedTests = json.numFailedTests ?? totalTests - passedTests;
    const duration: number = json.testResults ? json.testResults.reduce((s: number, r: any) => {
      const rt = r.perfStats?.runtime ?? (r.endTime && r.startTime ? r.endTime - r.startTime : 0);
      return s + rt;
    }, 0) : 0;

    const errors: ParsedError[] = [];
    if (json.testResults) {
      for (const suite of json.testResults) {
        for (const test of suite.testResults ?? []) {
          if (test.status === 'failed') {
            for (const msg of test.failureMessages ?? []) {
              const locMatch = msg.match(/at\s+.+\((.+?):(\d+):(\d+)\)/);
              errors.push({
                file: locMatch?.[1] ?? suite.name ?? 'unknown',
                line: parseInt(locMatch?.[2] ?? '0', 10),
                column: parseInt(locMatch?.[3] ?? '0', 10),
                message: msg.split('\n')[0],
                severity: 'error',
              });
            }
          }
        }
      }
    }

    return {
      passed: exitCode === 0,
      totalTests,
      passedTests,
      failedTests,
      errors,
      duration,
      rawOutput: stdout.slice(0, 5000),
    };
  } catch {
    return {
      passed: exitCode === 0,
      totalTests: 0,
      passedTests: 0,
      failedTests: exitCode === 0 ? 0 : 1,
      errors: [{ file: 'unknown', line: 0, column: 0, message: stdout.slice(0, 500), severity: 'error' }],
      duration: 0,
      rawOutput: stdout.slice(0, 5000),
    };
  }
}

function parseLintOutput(stdout: string, exitCode: number): TestResult {
  try {
    const results = JSON.parse(stdout);
    const errors: ParsedError[] = [];
    let totalMessages = 0;

    for (const file of Array.isArray(results) ? results : []) {
      for (const msg of file.messages ?? []) {
        totalMessages++;
        errors.push({
          file: file.filePath ?? 'unknown',
          line: msg.line ?? 0,
          column: msg.column ?? 0,
          message: msg.message ?? '',
          code: msg.ruleId ?? undefined,
          severity: msg.severity === 1 ? 'warning' : 'error',
        });
      }
    }

    const errorCount = errors.filter((e) => e.severity === 'error').length;
    return {
      passed: exitCode === 0 && errorCount === 0,
      totalTests: totalMessages,
      passedTests: totalMessages - errorCount,
      failedTests: errorCount,
      errors,
      duration: 0,
      rawOutput: stdout.slice(0, 5000),
    };
  } catch {
    return {
      passed: exitCode === 0,
      totalTests: 0,
      passedTests: 0,
      failedTests: exitCode === 0 ? 0 : 1,
      errors: [{ file: 'unknown', line: 0, column: 0, message: stdout.slice(0, 500), severity: 'error' }],
      duration: 0,
      rawOutput: stdout.slice(0, 5000),
    };
  }
}

function parseTscOutput(stdout: string, exitCode: number): TestResult {
  const lines = stdout.split('\n').filter(Boolean);
  const errors: ParsedError[] = [];

  for (const line of lines) {
    const match = line.match(/(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)/i);
    if (match) {
      errors.push({
        file: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        message: match[6],
        code: match[5],
        severity: match[4].toLowerCase() as 'error' | 'warning',
      });
    }
  }

  const errorCount = errors.filter((e) => e.severity === 'error').length;
  return {
    passed: exitCode === 0 && errorCount === 0,
    totalTests: errors.length,
    passedTests: errors.length - errorCount,
    failedTests: errorCount,
    errors,
    duration: 0,
    rawOutput: stdout.slice(0, 5000),
  };
}

export class SelfHealing extends EventEmitter {
  private config: HealingConfig;
  private attempts: Map<string, HealingAttempt[]> = new Map();
  private results: Map<string, HealingResult> = new Map();

  constructor(config?: Partial<HealingConfig>) {
    super();
    this.config = {
      maxRetries: config?.maxRetries ?? 3,
      retryDelayMs: config?.retryDelayMs ?? 2000,
      escalateAfter: config?.escalateAfter ?? 3,
      autoFixPatterns: config?.autoFixPatterns ?? new Map(),
      testRunners: config?.testRunners ?? [...DEFAULT_RUNNERS],
    };
  }

  async runChecks(
    task: SubTask,
    executeCommand: (command: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>
  ): Promise<TestResult> {
    const allErrors: ParsedError[] = [];
    let allPassed = true;
    let totalTests = 0;
    let passedTests = 0;
    let totalDuration = 0;
    const rawOutputs: string[] = [];

    for (const runner of this.config.testRunners) {
      this.emit('check:started', { taskId: task.id, runner: runner.name });

      try {
        const { stdout, stderr, exitCode } = await executeCommand(runner.command);
        const result = runner.parseOutput(stdout, stderr, exitCode);

        if (!result.passed) allPassed = false;
        totalTests += result.totalTests;
        passedTests += result.passedTests;
        totalDuration += result.duration;
        allErrors.push(...result.errors);
        rawOutputs.push(`[${runner.name}]\n${result.rawOutput}`);

        this.emit('check:completed', {
          taskId: task.id,
          runner: runner.name,
          passed: result.passed,
          errors: result.errors.length,
        });
      } catch (err) {
        allPassed = false;
        allErrors.push({
          file: 'runner',
          line: 0,
          column: 0,
          message: `Failed to run ${runner.name}: ${err instanceof Error ? err.message : String(err)}`,
          severity: 'error',
        });
        rawOutputs.push(`[${runner.name} ERROR]\n${String(err)}`);
      }
    }

    return {
      passed: allPassed,
      totalTests,
      passedTests,
      failedTests: totalTests - passedTests,
      errors: allErrors,
      duration: totalDuration,
      rawOutput: rawOutputs.join('\n---\n'),
    };
  }

  analyzeErrors(errors: ParsedError[]): { category: string; fixStrategy: string; confidence: number }[] {
    const analyses: { category: string; fixStrategy: string; confidence: number }[] = [];
    const seen = new Set<string>();

    for (const error of errors) {
      for (const pattern of ERROR_PATTERNS) {
        if (pattern.pattern.test(error.message) && !seen.has(pattern.category)) {
          seen.add(pattern.category);
          analyses.push({
            category: pattern.category,
            fixStrategy: pattern.fixStrategy,
            confidence: pattern.confidence,
          });
        }
      }
    }

    analyses.sort((a, b) => b.confidence - a.confidence);
    return analyses;
  }

  async heal(
    task: SubTask,
    errorResult: TestResult,
    assignRetry: (task: SubTask, errorContext: string) => Promise<TaskResult>,
    executeCommand: (command: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>
  ): Promise<HealingResult> {
    const taskId = task.id;
    const existingAttempts = this.attempts.get(taskId) || [];
    const attemptNumber = existingAttempts.length + 1;

    if (attemptNumber > this.config.maxRetries) {
      const result: HealingResult = {
        success: false,
        taskId,
        totalAttempts: attemptNumber - 1,
        attempts: existingAttempts,
        finalError: errorResult.errors.map((e) => e.message).join('\n'),
        escalated: true,
      };
      this.results.set(taskId, result);
      this.emit('heal:escalated', { taskId, attempts: attemptNumber - 1 });
      return result;
    }

    const analysis = this.analyzeErrors(errorResult.errors);
    const errorContext = this.buildErrorContext(errorResult, analysis);

    this.emit('heal:attempt', { taskId, attempt: attemptNumber, errorCount: errorResult.errors.length });

    await this.delay(this.config.retryDelayMs * attemptNumber);

    try {
      const fixResult = await assignRetry(task, errorContext);

      const recheck = await this.runChecks(task, executeCommand);

      const attempt: HealingAttempt = {
        taskId,
        agentId: task.assignedAgent || 'unknown',
        attemptNumber,
        error: errorResult.errors.map((e) => e.message).slice(0, 3).join('; '),
        fixApplied: analysis.map((a) => a.fixStrategy).join('; '),
        success: recheck.passed,
        timestamp: Date.now(),
      };

      existingAttempts.push(attempt);
      this.attempts.set(taskId, existingAttempts);

      if (recheck.passed) {
        const result: HealingResult = {
          success: true,
          taskId,
          totalAttempts: attemptNumber,
          attempts: existingAttempts,
          escalated: false,
        };
        this.results.set(taskId, result);
        this.emit('heal:success', { taskId, attempts: attemptNumber });
        return result;
      }

      return this.heal(task, recheck, assignRetry, executeCommand);
    } catch (err) {
      const attempt: HealingAttempt = {
        taskId,
        agentId: task.assignedAgent || 'unknown',
        attemptNumber,
        error: errorResult.errors.map((e) => e.message).slice(0, 3).join('; '),
        fixApplied: 'failed-to-assign-fix',
        success: false,
        timestamp: Date.now(),
      };
      existingAttempts.push(attempt);
      this.attempts.set(taskId, existingAttempts);

      if (attemptNumber >= this.config.escalateAfter) {
        const result: HealingResult = {
          success: false,
          taskId,
          totalAttempts: attemptNumber,
          attempts: existingAttempts,
          finalError: err instanceof Error ? err.message : String(err),
          escalated: true,
        };
        this.results.set(taskId, result);
        this.emit('heal:escalated', { taskId, attempts: attemptNumber });
        return result;
      }

      return this.heal(task, errorResult, assignRetry, executeCommand);
    }
  }

  getAttempts(taskId: string): HealingAttempt[] {
    return this.attempts.get(taskId) || [];
  }

  getResult(taskId: string): HealingResult | undefined {
    return this.results.get(taskId);
  }

  getAllResults(): HealingResult[] {
    return [...this.results.values()];
  }

  addTestRunner(runner: TestRunner): void {
    this.config.testRunners.push(runner);
  }

  setMaxRetries(max: number): void {
    this.config.maxRetries = max;
  }

  private buildErrorContext(result: TestResult, analysis: { category: string; fixStrategy: string; confidence: number }[]): string {
    const lines: string[] = [];
    lines.push(`Tests failed: ${result.failedTests}/${result.totalTests}`);
    lines.push('');

    if (analysis.length > 0) {
      lines.push('Error analysis:');
      for (const a of analysis) {
        lines.push(`  [${a.category}] (confidence: ${(a.confidence * 100).toFixed(0)}%) ${a.fixStrategy}`);
      }
      lines.push('');
    }

    lines.push('Errors:');
    for (const err of result.errors.slice(0, 10)) {
      lines.push(`  ${err.file}:${err.line}:${err.column} - ${err.message}`);
      if (err.code) lines.push(`    code: ${err.code}`);
    }

    if (result.errors.length > 10) {
      lines.push(`  ... and ${result.errors.length - 10} more errors`);
    }

    return lines.join('\n');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
