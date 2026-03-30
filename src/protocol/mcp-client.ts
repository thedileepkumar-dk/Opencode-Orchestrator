import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { Logger } from '../utils/logger.js';
import { MCPServerConfig } from '../protocol/types.js';

const logger = new Logger({ scope: 'mcp-client' });

// ============================================================
// MCP PROTOCOL TYPES
// ============================================================

interface MCPRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: MCPError;
}

interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

interface MCPResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

interface MCPCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  logging?: Record<string, unknown>;
}

interface ServerInfo {
  name: string;
  version: string;
  capabilities: MCPCapabilities;
}

// ============================================================
// MCP CLIENT
// ============================================================

export interface MCPClientOptions {
  name?: string;
  version?: string;
  timeout?: number;
}

export class MCPClient extends EventEmitter {
  private config: MCPServerConfig;
  private options: MCPClientOptions;
  private serverInfo: ServerInfo | null = null;
  private tools: Map<string, MCPTool> = new Map();
  private resources: Map<string, MCPResource> = new Map();
  private requestId = 0;
  private connected = false;
  private childProcess: ChildProcess | null = null;
  private pendingRequests: Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }> = new Map();
  private stdoutBuffer = '';

  constructor(config: MCPServerConfig, options: MCPClientOptions = {}) {
    super();
    this.config = config;
    this.options = {
      name: options.name ?? 'opencode-orchestrator',
      version: options.version ?? '1.0.0',
      timeout: options.timeout ?? config.timeout ?? 30000,
    };
  }

  // ============================================================
  // CONNECTION
  // ============================================================

  async connect(): Promise<ServerInfo> {
    if (this.connected) return this.serverInfo!;

    logger.info(`Connecting to MCP server: ${this.config.name}`);

    if (this.config.transport === 'stdio') {
      await this.connectStdio();
    } else if (this.config.transport === 'sse') {
      await this.connectSSE();
    } else {
      throw new Error(`Unsupported transport: ${this.config.transport}`);
    }

    // Initialize
    const initResult = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
        resources: {},
      },
      clientInfo: {
        name: this.options.name,
        version: this.options.version,
      },
    });

    this.serverInfo = initResult as ServerInfo;
    this.connected = true;

    // Send initialized notification
    await this.sendNotification('notifications/initialized', {});

    // Load tools and resources
    await this.refreshTools();
    await this.refreshResources();

    logger.info(`Connected to ${this.config.name}: ${this.tools.size} tools, ${this.resources.size} resources`);
    this.emit('connected', this.serverInfo);

    return this.serverInfo;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;

    // Cancel pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Client disconnected'));
    }
    this.pendingRequests.clear();

    // Kill process
    if (this.childProcess) {
      this.childProcess.kill('SIGTERM');
      this.childProcess = null;
    }

    this.connected = false;
    this.serverInfo = null;
    this.tools.clear();
    this.resources.clear();

    logger.info(`Disconnected from ${this.config.name}`);
    this.emit('disconnected');
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ============================================================
  // TOOLS
  // ============================================================

  async refreshTools(): Promise<MCPTool[]> {
    try {
      const result = await this.sendRequest('tools/list', {});
      const tools = ((result as any)?.tools || []) as MCPTool[];
      this.tools.clear();
      for (const tool of tools) {
        this.tools.set(tool.name, tool);
      }
      return tools;
    } catch (err) {
      logger.warn('Failed to list tools', { error: err as Error });
      return [];
    }
  }

  listTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  getTool(name: string): MCPTool | undefined {
    return this.tools.get(name);
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.connected) {
      throw new Error('Not connected to MCP server');
    }

    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}. Available: ${Array.from(this.tools.keys()).join(', ')}`);
    }

    logger.debug(`Calling tool: ${name}`, { args });

    const result = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    });

    return (result as any)?.content;
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  // ============================================================
  // RESOURCES
  // ============================================================

  async refreshResources(): Promise<MCPResource[]> {
    try {
      const result = await this.sendRequest('resources/list', {});
      const resources = ((result as any)?.resources || []) as MCPResource[];
      this.resources.clear();
      for (const resource of resources) {
        this.resources.set(resource.uri, resource);
      }
      return resources;
    } catch (err) {
      logger.warn('Failed to list resources', { error: err as Error });
      return [];
    }
  }

  listResources(): MCPResource[] {
    return Array.from(this.resources.values());
  }

  async readResource(uri: string): Promise<MCPResourceContent[]> {
    if (!this.connected) {
      throw new Error('Not connected to MCP server');
    }

    const result = await this.sendRequest('resources/read', { uri });
    return ((result as any)?.contents || []) as MCPResourceContent[];
  }

  async subscribeToResource(uri: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to MCP server');
    }
    await this.sendRequest('resources/subscribe', { uri });
  }

  async unsubscribeFromResource(uri: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to MCP server');
    }
    await this.sendRequest('resources/unsubscribe', { uri });
  }

  // ============================================================
  // PROMPTS
  // ============================================================

  async listPrompts(): Promise<Array<{ name: string; description: string; arguments?: Array<{ name: string; description: string; required: boolean }> }>> {
    try {
      const result = await this.sendRequest('prompts/list', {});
      return ((result as any)?.prompts || []);
    } catch {
      return [];
    }
  }

  async getPrompt(name: string, args: Record<string, string> = {}): Promise<{ messages: Array<{ role: string; content: { type: string; text: string } }> }> {
    const result = await this.sendRequest('prompts/get', { name, arguments: args });
    return result as any;
  }

  // ============================================================
  // REQUEST/RESPONSE TRANSPORT
  // ============================================================

  private async connectStdio(): Promise<void> {
    if (!this.config.command) {
      throw new Error('No command specified for stdio transport');
    }

    this.childProcess = spawn(this.config.command, this.config.args || [], {
      cwd: process.cwd(),
      env: { ...process.env, ...this.config.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (!this.childProcess.stdout || !this.childProcess.stderr || !this.childProcess.stdin) {
      throw new Error('Failed to create stdio streams');
    }

    // Process stdout line by line (JSON-RPC messages)
    this.childProcess.stdout.on('data', (chunk: Buffer) => {
      this.stdoutBuffer += chunk.toString();
      this.processStdoutBuffer();
    });

    // Process stderr for logging
    this.childProcess.stderr.on('data', (chunk: Buffer) => {
      logger.debug(`MCP stderr: ${chunk.toString().trim()}`);
    });

    // Handle process exit
    this.childProcess.on('close', (code) => {
      if (code !== 0 && code !== null) {
        this.connected = false;
        this.emit('error', new Error(`MCP server exited with code ${code}`));
      }
    });

    this.childProcess.on('error', (err) => {
      this.connected = false;
      this.emit('error', err);
    });
  }

  private async connectSSE(): Promise<void> {
    if (!this.config.url) {
      throw new Error('No URL specified for SSE transport');
    }
    // SSE transport would use fetch with EventSource
    // For now, we log a warning
    logger.warn('SSE transport not fully implemented, using HTTP fallback');
  }

  private processStdoutBuffer(): void {
    const lines = this.stdoutBuffer.split('\n');
    this.stdoutBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const msg = JSON.parse(trimmed);
        if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
          // Response to a pending request
          const pending = this.pendingRequests.get(msg.id)!;
          this.pendingRequests.delete(msg.id);
          clearTimeout(pending.timer);

          if (msg.error) {
            pending.reject(new Error(`MCP Error ${msg.error.code}: ${msg.error.message}`));
          } else {
            pending.resolve(msg.result);
          }
        } else if (msg.method) {
          // Notification or server-initiated request
          this.handleServerMessage(msg);
        }
      } catch {
        // Not JSON, ignore (might be server logging)
        logger.debug(`MCP stdout: ${trimmed}`);
      }
    }
  }

  private handleServerMessage(msg: { method: string; params?: Record<string, unknown> }): void {
    switch (msg.method) {
      case 'notifications/tools/list_changed':
        this.refreshTools();
        this.emit('toolsChanged');
        break;
      case 'notifications/resources/list_changed':
        this.refreshResources();
        this.emit('resourcesChanged');
        break;
      case 'notifications/resources/updated':
        this.emit('resourceUpdated', msg.params);
        break;
      case 'notifications/message':
        this.emit('serverMessage', msg.params);
        break;
      default:
        logger.debug(`Unknown server message: ${msg.method}`);
    }
  }

  private sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = ++this.requestId;
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, this.options.timeout!);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.writeMessage(request);
    });
  }

  private async sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
    const notification = {
      jsonrpc: '2.0' as const,
      method,
      params,
    };
    this.writeMessage(notification);
  }

  private writeMessage(msg: object): void {
    if (this.childProcess && this.childProcess.stdin) {
      const json = JSON.stringify(msg) + '\n';
      this.childProcess.stdin.write(json);
    }
  }
}

// ============================================================
// MCP CLIENT MANAGER
// ============================================================

export class MCPClientManager extends EventEmitter {
  private clients: Map<string, MCPClient> = new Map();
  private configs: MCPServerConfig[];

  constructor(configs: MCPServerConfig[]) {
    super();
    this.configs = configs;
  }

  async connectAll(): Promise<void> {
    const results = await Promise.allSettled(
      this.configs.map((config) => this.connectServer(config))
    );

    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'rejected') {
        logger.warn(`Failed to connect to ${this.configs[i].name}: ${(results[i] as PromiseRejectedResult).reason}`);
      }
    }
  }

  async connectServer(config: MCPServerConfig): Promise<MCPClient> {
    const client = new MCPClient(config);
    client.on('error', (err) => logger.error(`MCP ${config.name} error`, { error: err }));
    client.on('disconnected', () => this.emit('serverDisconnected', config.name));

    await client.connect();
    this.clients.set(config.name, client);
    this.emit('serverConnected', config.name);
    return client;
  }

  async disconnectAll(): Promise<void> {
    await Promise.all(
      Array.from(this.clients.values()).map((c) => c.disconnect())
    );
    this.clients.clear();
  }

  getClient(name: string): MCPClient | undefined {
    return this.clients.get(name);
  }

  getAllClients(): MCPClient[] {
    return Array.from(this.clients.values());
  }

  listAllTools(): Array<{ server: string; tool: MCPTool }> {
    const tools: Array<{ server: string; tool: MCPTool }> = [];
    for (const [server, client] of this.clients) {
      for (const tool of client.listTools()) {
        tools.push({ server, tool });
      }
    }
    return tools;
  }

  async callTool(server: string, tool: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const client = this.clients.get(server);
    if (!client) {
      throw new Error(`MCP server not found: ${server}`);
    }
    return client.callTool(tool, args);
  }

  async callAnyTool(toolName: string, args: Record<string, unknown> = {}): Promise<{ server: string; result: unknown }> {
    for (const [server, client] of this.clients) {
      if (client.hasTool(toolName)) {
        const result = await client.callTool(toolName, args);
        return { server, result };
      }
    }
    throw new Error(`Tool ${toolName} not found on any server`);
  }

  getConnectedServers(): string[] {
    return Array.from(this.clients.entries())
      .filter(([_, c]) => c.isConnected())
      .map(([name]) => name);
  }

  async disconnectServer(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (client) {
      await client.disconnect();
      this.clients.delete(name);
    }
  }
}

export { MCPTool, MCPResource, MCPResourceContent, MCPCapabilities, ServerInfo };
export default MCPClient;
