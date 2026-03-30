import { spawn, execFile, ChildProcess } from 'child_process';
import { ProcessOptions, ProcessResult, SpawnedProcess } from '../protocol/types.js';
import { Logger } from './logger.js';

const logger = new Logger({ scope: 'process' });

const DEFAULT_TIMEOUT = 120_000;
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;

export function execCommand(options: ProcessOptions): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
    });

    let stdout = '';
    let stderr = '';
    let killed = false;
    const maxBuffer = options.maxBuffer ?? DEFAULT_MAX_BUFFER;

    if (options.stdin) {
      child.stdin?.write(options.stdin);
      child.stdin?.end();
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < maxBuffer) {
        stdout += chunk.toString();
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < maxBuffer) {
        stderr += chunk.toString();
      }
    });

    const timeout = options.timeout ?? DEFAULT_TIMEOUT;
    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 5000);
    }, timeout);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code ?? -1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        duration: Date.now() - start,
        killed,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        exitCode: -1,
        stdout: stdout.trim(),
        stderr: err.message,
        duration: Date.now() - start,
        killed,
      });
    });
  });
}

export function spawnCommand(options: ProcessOptions): SpawnedProcess {
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (options.stdin) {
    child.stdin?.write(options.stdin);
    child.stdin?.end();
  }

  let killed = false;
  const start = Date.now();

  const promise = new Promise<ProcessResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    const maxBuffer = options.maxBuffer ?? DEFAULT_MAX_BUFFER;

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < maxBuffer) stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < maxBuffer) stderr += chunk.toString();
    });

    const timeout = options.timeout ?? DEFAULT_TIMEOUT;
    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 5000);
    }, timeout);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code ?? -1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        duration: Date.now() - start,
        killed,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        exitCode: -1,
        stdout: stdout.trim(),
        stderr: err.message,
        duration: Date.now() - start,
        killed,
      });
    });
  });

  async function* stdoutIter(): AsyncIterable<string> {
    if (!child.stdout) return;
    for await (const chunk of child.stdout) {
      yield chunk.toString();
    }
  }

  async function* stderrIter(): AsyncIterable<string> {
    if (!child.stderr) return;
    for await (const chunk of child.stderr) {
      yield chunk.toString();
    }
  }

  return {
    pid: child.pid ?? 0,
    kill: (signal?: NodeJS.Signals) => {
      killed = true;
      return child.kill(signal ?? 'SIGTERM');
    },
    promise,
    stdout: stdoutIter(),
    stderr: stderrIter(),
  };
}

export interface ProcessPoolOptions {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  maxWorkers: number;
  timeout?: number;
}

export class ProcessPool {
  private workers: Map<number, ChildProcess> = new Map();
  private queue: Array<{ options: ProcessOptions; resolve: (r: ProcessResult) => void }> = [];
  private options: ProcessPoolOptions;
  private active = 0;

  constructor(options: ProcessPoolOptions) {
    this.options = options;
  }

  async run(options: ProcessOptions): Promise<ProcessResult> {
    if (this.active >= this.options.maxWorkers) {
      return new Promise((resolve) => {
        this.queue.push({ options, resolve });
      });
    }

    this.active++;
    try {
      const result = await execCommand(options);
      return result;
    } finally {
      this.active--;
      this.drain();
    }
  }

  private drain(): void {
    while (this.queue.length > 0 && this.active < this.options.maxWorkers) {
      const item = this.queue.shift()!;
      this.run(item.options).then(item.resolve);
    }
  }

  async shutdown(signal: NodeJS.Signals = 'SIGTERM', gracePeriodMs = 5000): Promise<void> {
    const killPromises: Promise<void>[] = [];

    for (const [pid, child] of this.workers) {
      child.kill(signal);
      killPromises.push(
        new Promise((resolve) => {
          const timer = setTimeout(() => {
            if (!child.killed) child.kill('SIGKILL');
            resolve();
          }, gracePeriodMs);

          child.on('close', () => {
            clearTimeout(timer);
            resolve();
          });
        })
      );
    }

    await Promise.all(killPromises);
    this.workers.clear();
    this.queue = [];
    this.active = 0;
  }

  get running(): number {
    return this.active;
  }

  get pending(): number {
    return this.queue.length;
  }
}

export function gracefulShutdown(
  cleanup: () => Promise<void>,
  timeoutMs = 10000
): void {
  const handler = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    const timer = setTimeout(() => {
      logger.warn('Shutdown timed out, forcing exit');
      process.exit(1);
    }, timeoutMs);

    try {
      await cleanup();
      clearTimeout(timer);
      process.exit(0);
    } catch (err) {
      logger.error('Error during shutdown', { error: err as Error });
      clearTimeout(timer);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => handler('SIGINT'));
  process.on('SIGTERM', () => handler('SIGTERM'));
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err });
    handler('uncaughtException');
  });
}
