import Redis from "ioredis";
import type { ConnectionOptions } from "bullmq";
import type {
  RunInfo,
  RunStatus,
  StepInfo,
} from "./types";

/**
 * Manages all workflow run and step state in Redis.
 *
 * Key structure:
 *   {prefix}:run:{runId}              → Hash: workflow metadata + status
 *   {prefix}:run:{runId}:steps        → Hash: step name → JSON { status, result, duration, attempts }
 *   {prefix}:workflow:{workflowId}:runs → Sorted set: recent runIds by timestamp
 *   {prefix}:dedup:{key}              → String with TTL: deduplication lock
 */
export class StateManager {
  private redis: Redis;
  private prefix: string;

  constructor(
    connection: ConnectionOptions,
    prefix: string = "chisel"
  ) {
    if ("url" in connection && connection.url) {
      this.redis = new Redis(connection.url as string);
    } else {
      this.redis = new Redis(connection as any);
    }
    this.prefix = prefix;
  }

  private key(...parts: string[]): string {
    return [this.prefix, ...parts].join(":");
  }

  // ─── Run state ───────────────────────────────────────────────────────

  async createRun(
    runId: string,
    workflowId: string,
    data: unknown
  ): Promise<void> {
    const now = Date.now();
    const runKey = this.key("run", runId);

    await this.redis
      .multi()
      .hset(runKey, {
        id: runId,
        workflowId,
        status: "queued" satisfies RunStatus,
        data: JSON.stringify(data),
        startedAt: String(now),
      })
      .zadd(this.key("workflow", workflowId, "runs"), now, runId)
      .exec();
  }

  async updateRunStatus(
    runId: string,
    status: RunStatus,
    extra?: Record<string, string>
  ): Promise<void> {
    const fields: Record<string, string> = { status, ...extra };
    await this.redis.hset(this.key("run", runId), fields);
  }

  async getRun(runId: string): Promise<RunInfo | null> {
    const runKey = this.key("run", runId);
    const raw = await this.redis.hgetall(runKey);

    if (!raw.id) return null;

    const stepsRaw = await this.redis.hgetall(this.key("run", runId, "steps"));
    const steps: StepInfo[] = Object.entries(stepsRaw).map(([name, json]) => {
      const parsed = JSON.parse(json);
      return { name, ...parsed };
    });

    const completedCount = steps.filter(
      (s) => s.status === "completed"
    ).length;
    const totalCount = steps.length || 1;

    return {
      id: raw.id,
      workflowId: raw.workflowId,
      status: raw.status as RunStatus,
      data: JSON.parse(raw.data || "null"),
      result: raw.result ? JSON.parse(raw.result) : undefined,
      error: raw.error,
      startedAt: raw.startedAt ? Number(raw.startedAt) : undefined,
      completedAt: raw.completedAt ? Number(raw.completedAt) : undefined,
      steps,
      currentStep: raw.currentStep,
      progress: {
        completed: completedCount,
        total: totalCount,
        percentage: Math.round((completedCount / totalCount) * 100),
      },
    };
  }

  async setRunResult(runId: string, result: unknown): Promise<void> {
    await this.redis.hset(this.key("run", runId), {
      status: "completed" satisfies RunStatus,
      result: JSON.stringify(result),
      completedAt: String(Date.now()),
    });
  }

  async setRunError(
    runId: string,
    error: string,
    failedStep?: string
  ): Promise<void> {
    const fields: Record<string, string> = {
      status: "failed" satisfies RunStatus,
      error,
      completedAt: String(Date.now()),
    };
    if (failedStep) fields.failedStep = failedStep;
    await this.redis.hset(this.key("run", runId), fields);
  }

  // ─── Step state ──────────────────────────────────────────────────────

  async updateStep(runId: string, step: StepInfo): Promise<void> {
    await this.redis.hset(
      this.key("run", runId, "steps"),
      step.name,
      JSON.stringify({
        status: step.status,
        result: step.result,
        error: step.error,
        duration: step.duration,
        attempts: step.attempts,
        startedAt: step.startedAt,
      })
    );

    // Also update currentStep on the run
    if (step.status === "running") {
      await this.redis.hset(this.key("run", runId), "currentStep", step.name);
    }
  }

  // ─── Deduplication ───────────────────────────────────────────────────

  async tryDedup(
    dedupKey: string,
    runId: string,
    ttlMs: number
  ): Promise<{ isDuplicate: boolean; existingRunId?: string }> {
    const key = this.key("dedup", dedupKey);
    const result = await this.redis.set(key, runId, "PX", ttlMs, "NX");

    if (result === "OK") {
      return { isDuplicate: false };
    }

    const existingRunId = await this.redis.get(key);
    return { isDuplicate: true, existingRunId: existingRunId ?? undefined };
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────

  async close(): Promise<void> {
    await this.redis.quit();
  }

  getRedis(): Redis {
    return this.redis;
  }
}
