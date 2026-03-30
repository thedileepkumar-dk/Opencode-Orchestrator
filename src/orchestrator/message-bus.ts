import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  AgentMessage,
  MessageType,
  TaskPriority,
} from './types.js';

interface QueuedMessage {
  message: AgentMessage;
  enqueuedAt: number;
  retryCount: number;
  maxRetries: number;
}

interface MessageHandler {
  agentId: string;
  callback: (message: AgentMessage) => void | Promise<void>;
  messageTypes: MessageType[] | '*';
}

interface DeliveryReceipt {
  messageId: string;
  deliveredAt: number;
  acknowledgedAt?: number;
  error?: string;
}

interface BusStats {
  totalSent: number;
  totalDelivered: number;
  totalAcknowledged: number;
  totalFailed: number;
  totalRetries: number;
  averageLatency: number;
}

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export class MessageBus extends EventEmitter {
  private handlers = new Map<string, MessageHandler[]>();
  private priorityQueue: QueuedMessage[] = [];
  private history: AgentMessage[] = [];
  private receipts = new Map<string, DeliveryReceipt>();
  private stats: BusStats = {
    totalSent: 0,
    totalDelivered: 0,
    totalAcknowledged: 0,
    totalFailed: 0,
    totalRetries: 0,
    averageLatency: 0,
  };
  private latencies: number[] = [];
  private processing = false;
  private maxHistorySize: number;
  private processInterval: ReturnType<typeof setInterval> | null;

  constructor(options: { maxHistorySize?: number; processIntervalMs?: number } = {}) {
    super();
    this.maxHistorySize = options.maxHistorySize ?? 10000;
    const intervalMs = options.processIntervalMs ?? 10;
    this.processInterval = setInterval(() => this.processQueue(), intervalMs);
  }

  registerHandler(agentId: string, messageTypes: MessageType[] | '*', callback: (message: AgentMessage) => void | Promise<void>): () => void {
    const handler: MessageHandler = { agentId, callback, messageTypes };
    if (!this.handlers.has(agentId)) {
      this.handlers.set(agentId, []);
    }
    this.handlers.get(agentId)!.push(handler);
    this.emit('handler:registered', { agentId, messageTypes });

    return () => {
      const handlers = this.handlers.get(agentId);
      if (handlers) {
        const idx = handlers.indexOf(handler);
        if (idx !== -1) handlers.splice(idx, 1);
        if (handlers.length === 0) this.handlers.delete(agentId);
      }
    };
  }

  send(
    type: MessageType,
    from: string,
    to: string | '*',
    payload: Record<string, unknown>,
    options: { priority?: TaskPriority; correlationId?: string; maxRetries?: number } = {}
  ): string {
    const message: AgentMessage = {
      id: `msg-${randomUUID().slice(0, 12)}`,
      type,
      from,
      to,
      priority: options.priority ?? 'medium',
      payload,
      timestamp: Date.now(),
      correlationId: options.correlationId,
      delivered: false,
      acknowledged: false,
    };

    this.stats.totalSent++;
    this.addToHistory(message);

    if (to === '*') {
      this.broadcastImmediate(message);
      return message.id;
    }

    const queued: QueuedMessage = {
      message,
      enqueuedAt: Date.now(),
      retryCount: 0,
      maxRetries: options.maxRetries ?? 3,
    };

    this.insertByPriority(queued);
    this.emit('message:queued', { messageId: message.id, type, to, priority: message.priority });
    return message.id;
  }

  acknowledge(messageId: string): void {
    const receipt = this.receipts.get(messageId);
    if (receipt) {
      receipt.acknowledgedAt = Date.now();
      this.stats.totalAcknowledged++;
      const msg = this.history.find((m) => m.id === messageId);
      if (msg) msg.acknowledged = true;
      this.emit('message:acknowledged', { messageId });
    }
  }

  getHistory(filter?: {
    agentId?: string;
    type?: MessageType;
    since?: number;
    correlationId?: string;
  }): AgentMessage[] {
    let result = [...this.history];
    if (filter?.agentId) {
      result = result.filter((m) => m.from === filter.agentId || m.to === filter.agentId || m.to === '*');
    }
    if (filter?.type) {
      result = result.filter((m) => m.type === filter.type);
    }
    if (filter?.since) {
      result = result.filter((m) => m.timestamp >= filter.since!);
    }
    if (filter?.correlationId) {
      result = result.filter((m) => m.correlationId === filter.correlationId);
    }
    return result;
  }

  getStats(): BusStats {
    return { ...this.stats };
  }

  getPendingCount(): number {
    return this.priorityQueue.length;
  }

  getReceipt(messageId: string): DeliveryReceipt | undefined {
    return this.receipts.get(messageId);
  }

  clearHistory(): void {
    this.history = [];
  }

  destroy(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
    this.handlers.clear();
    this.priorityQueue = [];
    this.removeAllListeners();
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.priorityQueue.length === 0) return;
    this.processing = true;

    try {
      while (this.priorityQueue.length > 0) {
        const item = this.priorityQueue.shift()!;
        const delivered = await this.deliverMessage(item.message);

        if (delivered) {
          item.message.delivered = true;
          const latency = Date.now() - item.enqueuedAt;
          this.latencies.push(latency);
          if (this.latencies.length > 1000) this.latencies.shift();
          this.stats.averageLatency = this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
          this.stats.totalDelivered++;

          this.receipts.set(item.message.id, {
            messageId: item.message.id,
            deliveredAt: Date.now(),
          });
          this.emit('message:delivered', { messageId: item.message.id, latency });
        } else {
          item.retryCount++;
          if (item.retryCount <= item.maxRetries) {
            this.stats.totalRetries++;
            this.insertByPriority(item);
            this.emit('message:retry', { messageId: item.message.id, attempt: item.retryCount });
          } else {
            this.stats.totalFailed++;
            this.receipts.set(item.message.id, {
              messageId: item.message.id,
              deliveredAt: 0,
              error: 'max-retries-exceeded',
            });
            this.emit('message:failed', { messageId: item.message.id, reason: 'max-retries-exceeded' });
          }
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private async deliverMessage(message: AgentMessage): Promise<boolean> {
    const targetId = message.to as string;
    const handlers = this.handlers.get(targetId);
    if (!handlers || handlers.length === 0) return false;

    const matching = handlers.filter(
      (h) => h.messageTypes === '*' || h.messageTypes.includes(message.type)
    );
    if (matching.length === 0) return false;

    for (const handler of matching) {
      try {
        await handler.callback(message);
      } catch {
        return false;
      }
    }
    return true;
  }

  private broadcastImmediate(message: AgentMessage): void {
    message.delivered = true;
    this.receipts.set(message.id, { messageId: message.id, deliveredAt: Date.now() });
    this.stats.totalDelivered++;

    for (const [agentId, handlers] of this.handlers) {
      if (agentId === message.from) continue;
      for (const handler of handlers) {
        if (handler.messageTypes === '*' || handler.messageTypes.includes(message.type)) {
          try {
            const result = handler.callback(message);
            if (result instanceof Promise) {
              result.catch(() => {});
            }
          } catch {}
        }
      }
    }
    this.emit('message:broadcast', { messageId: message.id, type: message.type });
  }

  private insertByPriority(item: QueuedMessage): void {
    const weight = PRIORITY_WEIGHT[item.message.priority];
    let inserted = false;
    for (let i = 0; i < this.priorityQueue.length; i++) {
      const existingWeight = PRIORITY_WEIGHT[this.priorityQueue[i].message.priority];
      if (weight > existingWeight) {
        this.priorityQueue.splice(i, 0, item);
        inserted = true;
        break;
      }
    }
    if (!inserted) this.priorityQueue.push(item);
  }

  private addToHistory(message: AgentMessage): void {
    this.history.push(message);
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }
  }
}
