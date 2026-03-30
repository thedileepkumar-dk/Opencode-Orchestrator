import { BaseAgent } from './base.js';
import { AgentCapability, AgentStatus, TaskContext, AnalyzeResult } from './types.js';

import { FrontendAgent } from './frontend.js';
import { BackendAgent } from './backend.js';
import { UIUXAgent } from './uiux.js';
import { SecurityAgent } from './security.js';
import { DevOpsAgent } from './devops.js';
import { MobileAgent } from './mobile.js';
import { QAAgent } from './qa.js';
import { MLAgent } from './ml.js';
import { DocsAgent } from './docs.js';
import { PerformanceAgent } from './performance.js';
import { DatabaseAgent } from './database.js';
import { RefactorAgent } from './refactor.js';

export class AgentRegistry {
  private agents: Map<string, BaseAgent>;
  private domainIndex: Map<string, Set<string>>;
  private capabilityIndex: Map<string, Set<string>>;

  constructor() {
    this.agents = new Map();
    this.domainIndex = new Map();
    this.capabilityIndex = new Map();
    this.registerDefaults();
  }

  private registerDefaults(): void {
    const defaultAgents: BaseAgent[] = [
      new FrontendAgent(),
      new BackendAgent(),
      new UIUXAgent(),
      new SecurityAgent(),
      new DevOpsAgent(),
      new MobileAgent(),
      new QAAgent(),
      new MLAgent(),
      new DocsAgent(),
      new PerformanceAgent(),
      new DatabaseAgent(),
      new RefactorAgent(),
    ];

    for (const agent of defaultAgents) {
      this.register(agent);
    }
  }

  register(agent: BaseAgent): void {
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent with id "${agent.id}" is already registered`);
    }

    this.agents.set(agent.id, agent);

    if (!this.domainIndex.has(agent.domain)) {
      this.domainIndex.set(agent.domain, new Set());
    }
    this.domainIndex.get(agent.domain)!.add(agent.id);

    for (const capability of agent.capabilities) {
      if (!this.capabilityIndex.has(capability.name)) {
        this.capabilityIndex.set(capability.name, new Set());
      }
      this.capabilityIndex.get(capability.name)!.add(agent.id);
    }
  }

  unregister(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    this.agents.delete(agentId);

    const domainSet = this.domainIndex.get(agent.domain);
    if (domainSet) {
      domainSet.delete(agentId);
      if (domainSet.size === 0) this.domainIndex.delete(agent.domain);
    }

    for (const capability of agent.capabilities) {
      const capSet = this.capabilityIndex.get(capability.name);
      if (capSet) {
        capSet.delete(agentId);
        if (capSet.size === 0) this.capabilityIndex.delete(capability.name);
      }
    }

    return true;
  }

  getById(agentId: string): BaseAgent | undefined {
    return this.agents.get(agentId);
  }

  getByDomain(domain: string): BaseAgent[] {
    const agentIds = this.domainIndex.get(domain);
    if (!agentIds) return [];
    return Array.from(agentIds)
      .map((id) => this.agents.get(id)!)
      .filter(Boolean);
  }

  getByCapability(capabilityName: string): BaseAgent[] {
    const agentIds = this.capabilityIndex.get(capabilityName);
    if (!agentIds) return [];
    return Array.from(agentIds)
      .map((id) => this.agents.get(id)!)
      .filter(Boolean);
  }

  getAvailable(): BaseAgent[] {
    return Array.from(this.agents.values()).filter((agent) => agent.isAvailable());
  }

  getByStatus(status: AgentStatus): BaseAgent[] {
    return Array.from(this.agents.values()).filter((agent) => agent.getStatus() === status);
  }

  getAll(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  getDomains(): string[] {
    return Array.from(this.domainIndex.keys());
  }

  getCapabilities(): string[] {
    return Array.from(this.capabilityIndex.keys());
  }

  async findBestAgent(task: TaskContext): Promise<{ agent: BaseAgent; analysis: AnalyzeResult } | null> {
    const candidates: { agent: BaseAgent; analysis: AnalyzeResult }[] = [];

    const available = this.getAvailable();
    if (available.length === 0) return null;

    const analysisPromises = available.map(async (agent) => {
      try {
        const analysis = await agent.analyze(task);
        return { agent, analysis };
      } catch {
        return null;
      }
    });

    const results = await Promise.allSettled(analysisPromises);

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value && result.value.analysis.canHandle) {
        candidates.push(result.value);
      }
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
      if (a.analysis.confidence !== b.analysis.confidence) {
        return b.analysis.confidence - a.analysis.confidence;
      }
      const successDiff = b.agent.getSuccessRate() - a.agent.getSuccessRate();
      if (Math.abs(successDiff) > 0.05) return successDiff;
      return a.analysis.estimatedTimeMs - b.analysis.estimatedTimeMs;
    });

    return candidates[0];
  }

  async findAgentsForCapabilities(requiredCapabilities: string[]): Promise<BaseAgent[]> {
    const scored = new Map<string, number>();

    for (const cap of requiredCapabilities) {
      const agents = this.getByCapability(cap);
      for (const agent of agents) {
        const confidence = agent.getCapabilityConfidence(cap);
        const current = scored.get(agent.id) || 0;
        scored.set(agent.id, current + confidence);
      }
    }

    return Array.from(scored.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => this.agents.get(id)!)
      .filter((agent) => agent && agent.isAvailable());
  }

  getPoolStats(): {
    total: number;
    available: number;
    busy: number;
    error: number;
    disabled: number;
    byDomain: Record<string, number>;
  } {
    const agents = Array.from(this.agents.values());
    const byDomain: Record<string, number> = {};

    for (const agent of agents) {
      byDomain[agent.domain] = (byDomain[agent.domain] || 0) + 1;
    }

    return {
      total: agents.length,
      available: agents.filter((a) => a.getStatus() === 'idle').length,
      busy: agents.filter((a) => ['analyzing', 'executing', 'verifying'].includes(a.getStatus())).length,
      error: agents.filter((a) => a.getStatus() === 'error').length,
      disabled: agents.filter((a) => a.getStatus() === 'disabled').length,
      byDomain,
    };
  }

  getMetricsSummary(): {
    agentId: string;
    name: string;
    domain: string;
    totalTasks: number;
    successRate: number;
    avgExecutionTimeMs: number;
    totalTokens: number;
  }[] {
    return this.getAll().map((agent) => {
      const metrics = agent.getMetrics();
      return {
        agentId: agent.id,
        name: agent.name,
        domain: agent.domain,
        totalTasks: metrics.totalTasks,
        successRate: agent.getSuccessRate(),
        avgExecutionTimeMs: metrics.averageExecutionTimeMs,
        totalTokens: metrics.totalTokensUsed,
      };
    });
  }

  resetAllMetrics(): void {
    for (const agent of this.agents.values()) {
      agent.resetMetrics();
    }
  }

  disableAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    agent.setStatus('disabled');
    return true;
  }

  enableAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    if (agent.getStatus() === 'disabled') {
      agent.setStatus('idle');
    }
    return true;
  }

  abortAll(): number {
    let count = 0;
    for (const agent of this.agents.values()) {
      if (['analyzing', 'executing', 'verifying'].includes(agent.getStatus())) {
        agent.setStatus('idle');
        count++;
      }
    }
    return count;
  }

  toJSON(): object {
    return {
      totalAgents: this.agents.size,
      domains: this.getDomains(),
      capabilities: this.getCapabilities(),
      agents: this.getAll().map((a) => a.toJSON()),
      poolStats: this.getPoolStats(),
    };
  }
}

export { BaseAgent } from './base.js';
export * from './types.js';
export { FrontendAgent } from './frontend.js';
export { BackendAgent } from './backend.js';
export { UIUXAgent } from './uiux.js';
export { SecurityAgent } from './security.js';
export { DevOpsAgent } from './devops.js';
export { MobileAgent } from './mobile.js';
export { QAAgent } from './qa.js';
export { MLAgent } from './ml.js';
export { DocsAgent } from './docs.js';
export { PerformanceAgent } from './performance.js';
export { DatabaseAgent } from './database.js';
export { RefactorAgent } from './refactor.js';

export const defaultRegistry = new AgentRegistry();
