import * as fs from 'fs';
import * as path from 'path';
import {
  OrchestratorConfig,
  OrchestratorMode,
  ModelTier,
  LogSeverity,
  MCPServerConfig,
  AgentProfile,
} from './types.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ scope: 'config' });

// ============================================================
// DEFAULT CONFIGURATION
// ============================================================

export const DEFAULT_CONFIG: OrchestratorConfig = {
  mode: OrchestratorMode.AutoPilot,
  maxAgents: 4,
  maxConcurrentTasks: 8,
  defaultModelTier: ModelTier.Standard,
  projectRoot: process.cwd(),
  workingBranch: 'main',
  useWorktrees: true,
  autoMerge: false,
  requireApproval: false,
  logLevel: LogSeverity.Info,
  indexOnStart: true,
  watchFiles: true,
  memoryTTL: 86400000, // 24 hours
  sessionTimeout: 3600000, // 1 hour
  mcpServers: [],
  agentOverrides: {},
  excludePatterns: [
    'node_modules',
    '.git',
    'dist',
    'build',
    '__pycache__',
    '.venv',
    'vendor',
    'target',
  ],
  includePatterns: [],
};

// ============================================================
// CONFIG SCHEMA
// ============================================================

interface SchemaField {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  default?: unknown;
  enum?: string[];
  min?: number;
  max?: number;
  description?: string;
}

const CONFIG_SCHEMA: Record<string, SchemaField> = {
  mode: {
    type: 'string',
    enum: Object.values(OrchestratorMode),
    default: OrchestratorMode.AutoPilot,
    description: 'Orchestration mode',
  },
  maxAgents: {
    type: 'number',
    min: 1,
    max: 32,
    default: 4,
    description: 'Maximum number of concurrent agents',
  },
  maxConcurrentTasks: {
    type: 'number',
    min: 1,
    max: 64,
    default: 8,
    description: 'Maximum concurrent tasks',
  },
  defaultModelTier: {
    type: 'string',
    enum: Object.values(ModelTier),
    default: ModelTier.Standard,
    description: 'Default model tier for agents',
  },
  projectRoot: {
    type: 'string',
    default: '.',
    description: 'Project root directory',
  },
  workingBranch: {
    type: 'string',
    default: 'main',
    description: 'Base branch for work',
  },
  useWorktrees: {
    type: 'boolean',
    default: true,
    description: 'Use git worktrees for agent isolation',
  },
  autoMerge: {
    type: 'boolean',
    default: false,
    description: 'Automatically merge completed agent work',
  },
  requireApproval: {
    type: 'boolean',
    default: false,
    description: 'Require human approval before executing',
  },
  logLevel: {
    type: 'string',
    enum: Object.values(LogSeverity),
    default: LogSeverity.Info,
    description: 'Logging verbosity',
  },
  indexOnStart: {
    type: 'boolean',
    default: true,
    description: 'Index project on startup',
  },
  watchFiles: {
    type: 'boolean',
    default: true,
    description: 'Watch for file changes',
  },
  memoryTTL: {
    type: 'number',
    min: 60000,
    default: 86400000,
    description: 'Memory entry TTL in ms',
  },
  sessionTimeout: {
    type: 'number',
    min: 60000,
    default: 3600000,
    description: 'Session timeout in ms',
  },
  mcpServers: {
    type: 'array',
    default: [],
    description: 'MCP server configurations',
  },
  agentOverrides: {
    type: 'object',
    default: {},
    description: 'Per-agent configuration overrides',
  },
  excludePatterns: {
    type: 'array',
    default: [],
    description: 'File patterns to exclude from indexing',
  },
  includePatterns: {
    type: 'array',
    default: [],
    description: 'Additional file patterns to include',
  },
};

// ============================================================
// VALIDATION
// ============================================================

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export function validateConfig(config: Partial<OrchestratorConfig>): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [key, value] of Object.entries(config)) {
    const schema = CONFIG_SCHEMA[key];
    if (!schema) {
      errors.push({ field: key, message: `Unknown configuration field`, value });
      continue;
    }

    // Type check
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (schema.type !== actualType && value !== undefined && value !== null) {
      errors.push({ field: key, message: `Expected ${schema.type}, got ${actualType}`, value });
      continue;
    }

    // Enum check
    if (schema.enum && !schema.enum.includes(value as string)) {
      errors.push({
        field: key,
        message: `Invalid value. Must be one of: ${schema.enum.join(', ')}`,
        value,
      });
    }

    // Min/max for numbers
    if (schema.type === 'number' && typeof value === 'number') {
      if (schema.min !== undefined && value < schema.min) {
        errors.push({ field: key, message: `Must be >= ${schema.min}`, value });
      }
      if (schema.max !== undefined && value > schema.max) {
        errors.push({ field: key, message: `Must be <= ${schema.max}`, value });
      }
    }
  }

  // Validate MCP server configs
  if (config.mcpServers) {
    for (let i = 0; i < config.mcpServers.length; i++) {
      const server = config.mcpServers[i];
      if (!server.name) {
        errors.push({ field: `mcpServers[${i}].name`, message: 'MCP server name is required' });
      }
      if (!server.transport) {
        errors.push({ field: `mcpServers[${i}].transport`, message: 'MCP server transport is required' });
      }
      if (server.transport === 'sse' && !server.url) {
        errors.push({ field: `mcpServers[${i}].url`, message: 'URL required for SSE transport' });
      }
      if (server.transport === 'stdio' && !server.command) {
        errors.push({ field: `mcpServers[${i}].command`, message: 'Command required for stdio transport' });
      }
    }
  }

  return errors;
}

// ============================================================
// CONFIG LOADER
// ============================================================

export class ConfigLoader {
  private projectRoot: string;

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot ?? process.cwd();
  }

  async load(): Promise<OrchestratorConfig> {
    let fileConfig: Partial<OrchestratorConfig> = {};

    // Try JSON config
    const jsonPath = path.join(this.projectRoot, '.opencode-orchestrator.json');
    if (fs.existsSync(jsonPath)) {
      fileConfig = await this.loadJSON(jsonPath);
      logger.info(`Loaded config from ${jsonPath}`);
    }

    // Try YAML config (fallback)
    const yamlPath = path.join(this.projectRoot, '.opencode-orchestrator.yaml');
    if (Object.keys(fileConfig).length === 0 && fs.existsSync(yamlPath)) {
      fileConfig = await this.loadYAML(yamlPath);
      logger.info(`Loaded config from ${yamlPath}`);
    }

    // Apply environment overrides
    const envConfig = this.loadFromEnv();

    // Merge: defaults <- file <- env
    const config = this.merge(DEFAULT_CONFIG, fileConfig, envConfig);

    // Validate
    const errors = validateConfig(config);
    if (errors.length > 0) {
      for (const err of errors) {
        logger.warn(`Config validation: ${err.field} - ${err.message}`);
      }
    }

    // Resolve project root
    config.projectRoot = path.resolve(this.projectRoot, config.projectRoot || '.');

    return config;
  }

  private async loadJSON(filePath: string): Promise<Partial<OrchestratorConfig>> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (err) {
      logger.error(`Failed to load JSON config: ${filePath}`, { error: err as Error });
      return {};
    }
  }

  private async loadYAML(filePath: string): Promise<Partial<OrchestratorConfig>> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return this.parseSimpleYAML(content);
    } catch (err) {
      logger.error(`Failed to load YAML config: ${filePath}`, { error: err as Error });
      return {};
    }
  }

  private loadFromEnv(): Partial<OrchestratorConfig> {
    const config: Partial<OrchestratorConfig> = {};

    const envMap: Record<string, { key: string; parser: (v: string) => unknown }> = {
      ORCHESTRATOR_MODE: { key: 'mode', parser: String },
      ORCHESTRATOR_MAX_AGENTS: { key: 'maxAgents', parser: Number },
      ORCHESTRATOR_MAX_CONCURRENT: { key: 'maxConcurrentTasks', parser: Number },
      ORCHESTRATOR_MODEL_TIER: { key: 'defaultModelTier', parser: String },
      ORCHESTRATOR_PROJECT_ROOT: { key: 'projectRoot', parser: String },
      ORCHESTRATOR_WORKING_BRANCH: { key: 'workingBranch', parser: String },
      ORCHESTRATOR_USE_WORKTREES: { key: 'useWorktrees', parser: (v) => v === 'true' },
      ORCHESTRATOR_AUTO_MERGE: { key: 'autoMerge', parser: (v) => v === 'true' },
      ORCHESTRATOR_REQUIRE_APPROVAL: { key: 'requireApproval', parser: (v) => v === 'true' },
      ORCHESTRATOR_LOG_LEVEL: { key: 'logLevel', parser: String },
      ORCHESTRATOR_INDEX_ON_START: { key: 'indexOnStart', parser: (v) => v === 'true' },
      ORCHESTRATOR_WATCH_FILES: { key: 'watchFiles', parser: (v) => v === 'true' },
      ORCHESTRATOR_MEMORY_TTL: { key: 'memoryTTL', parser: Number },
      ORCHESTRATOR_SESSION_TIMEOUT: { key: 'sessionTimeout', parser: Number },
    };

    for (const [envKey, { key, parser }] of Object.entries(envMap)) {
      const value = process.env[envKey];
      if (value !== undefined) {
        (config as any)[key] = parser(value);
      }
    }

    return config;
  }

  private merge(...configs: Partial<OrchestratorConfig>[]): OrchestratorConfig {
    const result: Record<string, unknown> = {};

    for (const config of configs) {
      for (const [key, value] of Object.entries(config)) {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            result[key] = value; // Replace arrays entirely
          } else if (typeof value === 'object' && !Array.isArray(value) && typeof result[key] === 'object') {
            result[key] = { ...(result[key] as object), ...(value as object) };
          } else {
            result[key] = value;
          }
        }
      }
    }

    return result as unknown as OrchestratorConfig;
  }

  private parseSimpleYAML(content: string): Partial<OrchestratorConfig> {
    // Simple YAML parser for flat/nested config
    const result: Record<string, unknown> = {};
    const lines = content.split('\n');
    let currentKey = '';
    let currentArray: unknown[] | null = null;
    let currentObject: Record<string, unknown> | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Array item
      if (trimmed.startsWith('- ')) {
        const value = trimmed.slice(2).trim().replace(/^["']|["']$/g, '');
        if (currentArray) {
          currentArray.push(value);
        } else if (currentObject && currentKey) {
          currentArray = [value];
          (currentObject as any)[currentKey] = currentArray;
        } else {
          currentArray = [value];
          (result as any)[currentKey] = currentArray;
        }
        continue;
      }

      currentArray = null;

      // Key-value pair
      const match = trimmed.match(/^(\w[\w_]*):\s*(.+)?$/);
      if (match) {
        const key = match[1];
        let value: unknown = match[2]?.trim().replace(/^["']|["']$/g, '');

        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (value !== undefined && !isNaN(Number(value))) value = Number(value);

        if (value !== undefined) {
          if (currentObject) {
            currentObject[key] = value;
          } else {
            result[key] = value;
          }
        } else {
          // Nested object
          currentKey = key;
          currentObject = {};
          result[key] = currentObject;
        }
      }
    }

    return result as Partial<OrchestratorConfig>;
  }

  async save(config: Partial<OrchestratorConfig>, format: 'json' | 'yaml' = 'json'): Promise<string> {
    const filePath = format === 'json'
      ? path.join(this.projectRoot, '.opencode-orchestrator.json')
      : path.join(this.projectRoot, '.opencode-orchestrator.yaml');

    if (format === 'json') {
      await fs.promises.writeFile(filePath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    } else {
      const yaml = this.toSimpleYAML(config);
      await fs.promises.writeFile(filePath, yaml, 'utf-8');
    }

    logger.info(`Config saved to ${filePath}`);
    return filePath;
  }

  private toSimpleYAML(obj: Record<string, unknown>, indent = 0): string {
    const lines: string[] = [];
    const pad = '  '.repeat(indent);

    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        lines.push(`${pad}${key}:`);
        for (const item of value) {
          lines.push(`${pad}  - ${typeof item === 'string' ? `"${item}"` : item}`);
        }
      } else if (typeof value === 'object' && value !== null) {
        lines.push(`${pad}${key}:`);
        lines.push(this.toSimpleYAML(value as Record<string, unknown>, indent + 1));
      } else {
        const val = typeof value === 'string' ? `"${value}"` : value;
        lines.push(`${pad}${key}: ${val}`);
      }
    }

    return lines.join('\n') + '\n';
  }

  static getSchema(): Record<string, SchemaField> {
    return { ...CONFIG_SCHEMA };
  }

  static generateDefaultConfig(): string {
    return JSON.stringify(DEFAULT_CONFIG, null, 2);
  }
}

export { OrchestratorConfig, MCPServerConfig };
export default ConfigLoader;
