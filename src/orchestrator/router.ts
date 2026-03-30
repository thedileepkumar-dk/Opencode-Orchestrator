import { EventEmitter } from 'events';
import type {
  AgentProfile,
  TaskDomain,
  ModelTier,
  SubTask,
} from './types.js';

interface RoutingDecision {
  agentId: string;
  reason: string;
  modelTier: ModelTier;
  fallbackAgents: string[];
}

interface AgentMetrics {
  totalAssigned: number;
  totalCompleted: number;
  totalFailed: number;
  totalDuration: number;
  lastAssignedAt: number;
}

interface RoutingRule {
  domain: TaskDomain;
  preferredCapabilities: string[];
  minSuccessRate: number;
}

const DEFAULT_ROUTING_RULES: RoutingRule[] = [
  { domain: 'frontend', preferredCapabilities: ['react', 'vue', 'angular', 'css', 'html', 'jsx', 'tsx'], minSuccessRate: 0.7 },
  { domain: 'backend', preferredCapabilities: ['api', 'node', 'express', 'graphql', 'rest', 'auth'], minSuccessRate: 0.7 },
  { domain: 'database', preferredCapabilities: ['sql', 'prisma', 'sequelize', 'migration', 'schema'], minSuccessRate: 0.8 },
  { domain: 'security', preferredCapabilities: ['security', 'auth', 'encryption', 'vulnerability'], minSuccessRate: 0.85 },
  { domain: 'devops', preferredCapabilities: ['docker', 'kubernetes', 'ci/cd', 'terraform', 'deploy'], minSuccessRate: 0.7 },
  { domain: 'testing', preferredCapabilities: ['jest', 'vitest', 'cypress', 'playwright', 'test'], minSuccessRate: 0.6 },
  { domain: 'docs', preferredCapabilities: ['documentation', 'jsdoc', 'markdown', 'readme'], minSuccessRate: 0.5 },
  { domain: 'performance', preferredCapabilities: ['optimization', 'profiling', 'caching', 'bundling'], minSuccessRate: 0.7 },
  { domain: 'refactor', preferredCapabilities: ['refactor', 'clean-code', 'patterns', 'architecture'], minSuccessRate: 0.7 },
  { domain: 'uiux', preferredCapabilities: ['design', 'css', 'animation', 'accessibility', 'theme'], minSuccessRate: 0.6 },
  { domain: 'ml', preferredCapabilities: ['python', 'pytorch', 'tensorflow', 'model', 'data'], minSuccessRate: 0.75 },
  { domain: 'mobile', preferredCapabilities: ['react-native', 'flutter', 'ios', 'android'], minSuccessRate: 0.7 },
  { domain: 'general', preferredCapabilities: [], minSuccessRate: 0.5 },
];

export class AgentRouter extends EventEmitter {
  private agents = new Map<string, AgentProfile>();
  private metrics = new Map<string, AgentMetrics>();
  private routingRules = new Map<TaskDomain, RoutingRule>();
  private cooldowns = new Map<string, number>();

  constructor() {
    super();
    for (const rule of DEFAULT_ROUTING_RULES) {
      this.routingRules.set(rule.domain, rule);
    }
  }

  registerAgent(profile: AgentProfile): void {
    this.agents.set(profile.id, { ...profile });
    if (!this.metrics.has(profile.id)) {
      this.metrics.set(profile.id, {
        totalAssigned: 0,
        totalCompleted: 0,
        totalFailed: 0,
        totalDuration: 0,
        lastAssignedAt: 0,
      });
    }
    this.emit('agent:registered', profile);
  }

  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId);
    this.metrics.delete(agentId);
    this.cooldowns.delete(agentId);
    this.emit('agent:unregistered', agentId);
  }

  updateAgentAvailability(agentId: string, available: boolean): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.available = available;
      agent.lastActiveAt = Date.now();
      this.emit('agent:availability', { agentId, available });
    }
  }

  recordTaskComplete(agentId: string, success: boolean, duration: number): void {
    const agent = this.agents.get(agentId);
    const metric = this.metrics.get(agentId);
    if (!agent || !metric) return;

    agent.totalTasks++;
    if (success) {
      agent.successRate = (agent.successRate * (agent.totalTasks - 1) + 1) / agent.totalTasks;
      metric.totalCompleted++;
    } else {
      agent.successRate = (agent.successRate * (agent.totalTasks - 1)) / agent.totalTasks;
      metric.totalFailed++;
      if (agent.successRate < 0.3 && agent.totalTasks > 5) {
        this.cooldowns.set(agentId, Date.now() + 60000);
        this.emit('agent:cooldown', { agentId, until: Date.now() + 60000 });
      }
    }
    metric.totalDuration += duration;
    agent.averageDuration = metric.totalDuration / (metric.totalCompleted + metric.totalFailed);
    agent.currentTasks = Math.max(0, agent.currentTasks - 1);
    this.emit('agent:task-recorded', { agentId, success, duration });
  }

  routeTask(task: SubTask): RoutingDecision {
    const rule = this.routingRules.get(task.domain) || this.routingRules.get('general')!;
    const candidates = this.getCandidates(task, rule);

    if (candidates.length === 0) {
      const fallback = this.getFallbackAgent(task);
      if (fallback) {
        return {
          agentId: fallback.id,
          reason: 'fallback-no-candidates',
          modelTier: task.requiredModelTier,
          fallbackAgents: [],
        };
      }
      return {
        agentId: 'default',
        reason: 'no-agent-available',
        modelTier: task.requiredModelTier,
        fallbackAgents: [],
      };
    }

    const scored = candidates.map((agent) => ({
      agent,
      score: this.scoreAgent(agent, task, rule),
    }));
    scored.sort((a, b) => b.score - a.score);

    const selected = scored[0].agent;
    const fallbacks = scored.slice(1, 4).map((s) => s.agent.id);

    selected.currentTasks++;
    const metric = this.metrics.get(selected.id)!;
    metric.totalAssigned++;
    metric.lastAssignedAt = Date.now();

    this.emit('task:routed', {
      taskId: task.id,
      agentId: selected.id,
      score: scored[0].score,
      fallbacks,
    });

    return {
      agentId: selected.id,
      reason: `score:${scored[0].score.toFixed(2)}`,
      modelTier: this.resolveModelTier(task.requiredModelTier, selected),
      fallbackAgents: fallbacks,
    };
  }

  getAgent(agentId: string): AgentProfile | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): AgentProfile[] {
    return [...this.agents.values()];
  }

  getAgentMetrics(agentId: string): AgentMetrics | undefined {
    return this.metrics.get(agentId);
  }

  getWorkloadDistribution(): Map<string, { current: number; max: number; utilization: number }> {
    const dist = new Map<string, { current: number; max: number; utilization: number }>();
    for (const [id, agent] of this.agents) {
      dist.set(id, {
        current: agent.currentTasks,
        max: agent.maxConcurrentTasks,
        utilization: agent.maxConcurrentTasks > 0 ? agent.currentTasks / agent.maxConcurrentTasks : 0,
      });
    }
    return dist;
  }

  setRoutingRule(domain: TaskDomain, rule: RoutingRule): void {
    this.routingRules.set(domain, rule);
  }

  private getCandidates(task: SubTask, rule: RoutingRule): AgentProfile[] {
    const now = Date.now();
    const candidates: AgentProfile[] = [];

    for (const agent of this.agents.values()) {
      if (!agent.available) continue;
      if (agent.currentTasks >= agent.maxConcurrentTasks) continue;
      if (agent.successRate < rule.minSuccessRate) continue;

      const cooldownUntil = this.cooldowns.get(agent.id);
      if (cooldownUntil && now < cooldownUntil) continue;
      if (cooldownUntil && now >= cooldownUntil) this.cooldowns.delete(agent.id);

      if (agent.domain === task.domain || agent.domain === 'general') {
        candidates.push(agent);
      }
    }

    return candidates;
  }

  private scoreAgent(agent: AgentProfile, task: SubTask, rule: RoutingRule): number {
    let score = 0;

    if (agent.domain === task.domain) score += 40;

    const capabilityOverlap = rule.preferredCapabilities.filter((cap) =>
      agent.capabilities.some((ac) => ac.toLowerCase().includes(cap.toLowerCase()))
    ).length;
    score += capabilityOverlap * 10;

    score += agent.successRate * 20;

    const workloadRatio = agent.maxConcurrentTasks > 0
      ? 1 - agent.currentTasks / agent.maxConcurrentTasks
      : 0;
    score += workloadRatio * 15;

    if (agent.averageDuration > 0) {
      score += Math.max(0, 10 - agent.averageDuration / 1000);
    }

    const tierMatch = this.tierMatchScore(task.requiredModelTier, agent.modelTier);
    score += tierMatch * 5;

    return score;
  }

  private tierMatchScore(required: ModelTier, agentTier: ModelTier): number {
    const tiers: ModelTier[] = ['cheap', 'standard', 'powerful', 'reasoning'];
    const reqIdx = tiers.indexOf(required);
    const agentIdx = tiers.indexOf(agentTier);
    if (agentIdx < reqIdx) return 0;
    if (agentIdx === reqIdx) return 2;
    return 1;
  }

  private resolveModelTier(required: ModelTier, agent: AgentProfile): ModelTier {
    const tiers: ModelTier[] = ['cheap', 'standard', 'powerful', 'reasoning'];
    const reqIdx = tiers.indexOf(required);
    const agentIdx = tiers.indexOf(agent.modelTier);
    return agentIdx >= reqIdx ? agent.modelTier : required;
  }

  private getFallbackAgent(task: SubTask): AgentProfile | undefined {
    const now = Date.now();
    let best: AgentProfile | undefined;
    let bestScore = -1;

    for (const agent of this.agents.values()) {
      if (!agent.available) continue;
      if (agent.currentTasks >= agent.maxConcurrentTasks) continue;

      const cooldownUntil = this.cooldowns.get(agent.id);
      if (cooldownUntil && now < cooldownUntil) continue;

      const score = agent.successRate * 10 + (1 - agent.currentTasks / Math.max(agent.maxConcurrentTasks, 1)) * 5;
      if (score > bestScore) {
        bestScore = score;
        best = agent;
      }
    }

    return best;
  }
}
