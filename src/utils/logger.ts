import { LogSeverity } from '../protocol/types.js';

export interface LogEntry {
  timestamp: string;
  level: LogSeverity;
  message: string;
  scope?: string;
  agent?: string;
  data?: Record<string, unknown>;
  error?: { name: string; message: string; stack?: string };
}

export interface LoggerOptions {
  level: LogSeverity;
  pretty: boolean;
  scope?: string;
  agent?: string;
  onLog?: (entry: LogEntry) => void;
}

const LEVEL_PRIORITY: Record<LogSeverity, number> = {
  [LogSeverity.Debug]: 0,
  [LogSeverity.Info]: 1,
  [LogSeverity.Warn]: 2,
  [LogSeverity.Error]: 3,
};

const LEVEL_COLORS: Record<LogSeverity, string> = {
  [LogSeverity.Debug]: '\x1b[90m',
  [LogSeverity.Info]: '\x1b[36m',
  [LogSeverity.Warn]: '\x1b[33m',
  [LogSeverity.Error]: '\x1b[31m',
};

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

export class Logger {
  private level: LogSeverity;
  private pretty: boolean;
  private scope: string | undefined;
  private agent: string | undefined;
  private onLog: ((entry: LogEntry) => void) | undefined;
  private static globalListeners: Array<(entry: LogEntry) => void> = [];

  constructor(options: Partial<LoggerOptions> = {}) {
    this.level = options.level ?? LogSeverity.Info;
    this.pretty = options.pretty ?? process.stdout.isTTY === true;
    this.scope = options.scope;
    this.agent = options.agent;
    this.onLog = options.onLog;
  }

  static onLog(listener: (entry: LogEntry) => void): () => void {
    Logger.globalListeners.push(listener);
    return () => {
      const idx = Logger.globalListeners.indexOf(listener);
      if (idx >= 0) Logger.globalListeners.splice(idx, 1);
    };
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log(LogSeverity.Debug, message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log(LogSeverity.Info, message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log(LogSeverity.Warn, message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log(LogSeverity.Error, message, data);
  }

  withScope(scope: string): Logger {
    return new Logger({
      level: this.level,
      pretty: this.pretty,
      scope: this.scope ? `${this.scope}:${scope}` : scope,
      agent: this.agent,
      onLog: this.onLog,
    });
  }

  withAgent(agent: string): Logger {
    return new Logger({
      level: this.level,
      pretty: this.pretty,
      scope: this.scope,
      agent,
      onLog: this.onLog,
    });
  }

  setLevel(level: LogSeverity): void {
    this.level = level;
  }

  private log(level: LogSeverity, message: string, data?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.level]) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      scope: this.scope,
      agent: this.agent,
      data,
    };

    if (data?.error instanceof Error) {
      entry.error = {
        name: data.error.name,
        message: data.error.message,
        stack: data.error.stack,
      };
      const { error: _, ...rest } = data;
      entry.data = Object.keys(rest).length > 0 ? rest : undefined;
    }

    if (this.onLog) this.onLog(entry);
    for (const listener of Logger.globalListeners) listener(entry);

    if (this.pretty) {
      this.prettyPrint(entry);
    } else {
      this.jsonPrint(entry);
    }
  }

  private prettyPrint(entry: LogEntry): void {
    const color = LEVEL_COLORS[entry.level];
    const levelStr = entry.level.toUpperCase().padEnd(5);
    const ts = entry.timestamp.slice(11, 23);
    const scopeStr = entry.scope ? ` ${DIM}${entry.scope}${RESET}` : '';
    const agentStr = entry.agent ? ` ${BOLD}[${entry.agent}]${RESET}` : '';

    let line = `${DIM}${ts}${RESET} ${color}${levelStr}${RESET}${scopeStr}${agentStr} ${entry.message}`;

    if (entry.data) {
      line += ` ${DIM}${JSON.stringify(entry.data)}${RESET}`;
    }

    if (entry.error) {
      line += `\n  ${color}${entry.error.name}: ${entry.error.message}${RESET}`;
      if (entry.error.stack) {
        line += `\n${DIM}${entry.error.stack}${RESET}`;
      }
    }

    const stream = entry.level === LogSeverity.Error ? process.stderr : process.stdout;
    stream.write(line + '\n');
  }

  private jsonPrint(entry: LogEntry): void {
    const json = JSON.stringify(entry);
    const stream = entry.level === LogSeverity.Error ? process.stderr : process.stdout;
    stream.write(json + '\n');
  }
}

export const defaultLogger = new Logger();
