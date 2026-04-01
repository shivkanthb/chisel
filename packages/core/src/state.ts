import Redis from "ioredis";
import type { ConnectionOptions } from "bullmq";
import type {
  ListRunsOptions,
  ListRunsResult,
  RunRetentionPolicy,
  RunInfo,
  RunStatus,
  StepInfo,
  TerminalRunStatus,
} from "./types";

/**
 * Manages all workflow run and step state in Redis.
 *
 * Key structure:
 *   {prefix}:run:{runId}              → Hash: workflow metadata + status
 *   {prefix}:run:{runId}:steps        → Hash: step name → JSON { status, result, duration, attempts, order }
 *   {prefix}:workflow:{workflowId}:runs → Sorted set: recent runIds by timestamp
 *   {prefix}:workflow:{workflowId}:runs:{status} → Sorted set: terminal runIds by completion timestamp
 *   {prefix}:dedup:{key}              → String with TTL: deduplication lock
 */
export class StateManager {
  private redis: Redis;
  private prefix: string;
  private retention: Record<TerminalRunStatus, RunRetentionPolicy | false>;

  constructor(
    connection: ConnectionOptions,
    prefix: string = "chisel",
    retention: Record<TerminalRunStatus, RunRetentionPolicy | false>
  ) {
    if ("url" in connection && connection.url) {
      this.redis = new Redis(connection.url as string);
    } else {
      this.redis = new Redis(connection as any);
    }
    this.prefix = prefix;
    this.retention = retention;
  }

  private key(...parts: string[]): string {
    return [this.prefix, ...parts].join(":");
  }

  private workflowRunsKey(workflowId: string): string {
    return this.key("workflow", workflowId, "runs");
  }

  private terminalRunsKey(
    workflowId: string,
    status: TerminalRunStatus
  ): string {
    return this.key("workflow", workflowId, "runs", status);
  }

  private runKey(runId: string): string {
    return this.key("run", runId);
  }

  private runStepsKey(runId: string): string {
    return this.key("run", runId, "steps");
  }

  private terminalStatuses(): TerminalRunStatus[] {
    return ["completed", "failed", "cancelled"];
  }

  // ─── Run state ───────────────────────────────────────────────────────

  async createRun(
    runId: string,
    workflowId: string,
    data: unknown
  ): Promise<void> {
    const now = Date.now();
    const runKey = this.runKey(runId);

    await this.redis
      .multi()
      .hset(runKey, {
        id: runId,
        workflowId,
        status: "queued" satisfies RunStatus,
        data: JSON.stringify(data),
        startedAt: String(now),
      })
      .zadd(this.workflowRunsKey(workflowId), now, runId)
      .exec();
  }

  async updateRunStatus(
    runId: string,
    status: RunStatus,
    extra?: Record<string, string>
  ): Promise<void> {
    const fields: Record<string, string> = { status, ...extra };
    await this.redis.hset(this.runKey(runId), fields);
  }

  async getRun(runId: string): Promise<RunInfo | null> {
    const runKey = this.runKey(runId);
    const raw = await this.redis.hgetall(runKey);

    if (!raw.id) return null;

    const stepsRaw = await this.redis.hgetall(this.runStepsKey(runId));
    const steps: StepInfo[] = Object.entries(stepsRaw)
      .map(([name, json]) => {
        const parsed = JSON.parse(json);
        return { name, ...parsed };
      })
      .sort((a, b) => {
        if (a.order != null && b.order != null) {
          return a.order - b.order;
        }
        if (a.order != null) return -1;
        if (b.order != null) return 1;
        return (a.startedAt ?? 0) - (b.startedAt ?? 0);
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

  async setRunResult(
    runId: string,
    workflowId: string,
    result: unknown
  ): Promise<void> {
    await this.setRunTerminalState(runId, workflowId, "completed", {
      result: JSON.stringify(result),
    });
  }

  async setRunError(
    runId: string,
    workflowId: string,
    error: string,
    failedStep?: string
  ): Promise<void> {
    const fields: Record<string, string> = {
      error,
    };
    if (failedStep) fields.failedStep = failedStep;
    await this.setRunTerminalState(runId, workflowId, "failed", fields);
  }

  async setRunCancelled(runId: string, workflowId: string): Promise<void> {
    await this.setRunTerminalState(runId, workflowId, "cancelled");
  }

  // ─── Step state ──────────────────────────────────────────────────────

  async updateStep(runId: string, step: StepInfo): Promise<void> {
    const runKey = this.runKey(runId);
    const stepsKey = this.runStepsKey(runId);

    let order = step.order;
    if (order == null) {
      const existing = await this.redis.hget(stepsKey, step.name);
      if (existing) {
        order = (JSON.parse(existing) as StepInfo).order;
      }
    }
    if (order == null) {
      order = await this.redis.hincrby(runKey, "stepOrderCounter", 1);
    }

    await this.redis.hset(
      stepsKey,
      step.name,
      JSON.stringify({
        status: step.status,
        result: step.result,
        error: step.error,
        duration: step.duration,
        attempts: step.attempts,
        startedAt: step.startedAt,
        order,
      })
    );

    // Also update currentStep on the run
    if (step.status === "running" || step.status === "sleep") {
      await this.redis.hset(runKey, "currentStep", step.name);
    }
  }

  // ─── List runs ─────────────────────────────────────────────────────

  async listRuns(
    workflowId: string,
    options: ListRunsOptions = {}
  ): Promise<ListRunsResult> {
    const { limit = 50, order = "desc", cursor, status } = options;
    const key = this.workflowRunsKey(workflowId);
    const fetchCount = limit + 1;

    let runIds: string[];
    if (order === "desc") {
      const max = cursor ? String(cursor - 1) : "+inf";
      runIds = await this.redis.zrevrangebyscore(
        key, max, "-inf", "LIMIT", 0, fetchCount
      );
    } else {
      const min = cursor ? String(cursor + 1) : "-inf";
      runIds = await this.redis.zrangebyscore(
        key, min, "+inf", "LIMIT", 0, fetchCount
      );
    }

    const hasMore = runIds.length > limit;
    if (hasMore) runIds = runIds.slice(0, limit);

    const runs = (await Promise.all(runIds.map((id) => this.getRun(id))))
      .filter((r): r is RunInfo => r !== null);

    const filtered = status ? runs.filter((r) => r.status === status) : runs;

    const lastRun = filtered[filtered.length - 1];
    const nextCursor = hasMore && lastRun?.startedAt ? lastRun.startedAt : null;

    return { runs: filtered, nextCursor };
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

  async clearTerminalRunIndexes(
    runId: string,
    workflowId: string
  ): Promise<void> {
    const multi = this.redis.multi();
    for (const status of this.terminalStatuses()) {
      multi.zrem(this.terminalRunsKey(workflowId, status), runId);
    }
    await multi.exec();
  }

  private async setRunTerminalState(
    runId: string,
    workflowId: string,
    status: TerminalRunStatus,
    extra: Record<string, string> = {}
  ): Promise<void> {
    const completedAt = Date.now();
    await this.redis
      .multi()
      .hset(this.runKey(runId), {
        status,
        completedAt: String(completedAt),
        ...extra,
      })
      .zadd(this.terminalRunsKey(workflowId, status), completedAt, runId)
      .exec();

    await this.pruneTerminalRuns(workflowId, status);
  }

  private async pruneTerminalRuns(
    workflowId: string,
    status: TerminalRunStatus
  ): Promise<void> {
    const policy = this.retention[status];
    if (!policy) return;

    const statusKey = this.terminalRunsKey(workflowId, status);
    const runIdsToPrune = new Set<string>();

    if (policy.age != null) {
      const cutoff = Date.now() - policy.age * 1000;
      const expiredRunIds = await this.redis.zrangebyscore(
        statusKey,
        "-inf",
        cutoff
      );
      for (const runId of expiredRunIds) {
        runIdsToPrune.add(runId);
      }
    }

    if (policy.count != null) {
      const total = await this.redis.zcard(statusKey);
      const excess = total - policy.count;
      if (excess > 0) {
        const overflowRunIds = await this.redis.zrange(statusKey, 0, excess - 1);
        for (const runId of overflowRunIds) {
          runIdsToPrune.add(runId);
        }
      }
    }

    if (runIdsToPrune.size === 0) return;

    const multi = this.redis.multi();
    for (const runId of runIdsToPrune) {
      multi.del(this.runKey(runId));
      multi.del(this.runStepsKey(runId));
      multi.zrem(this.workflowRunsKey(workflowId), runId);
      for (const terminalStatus of this.terminalStatuses()) {
        multi.zrem(this.terminalRunsKey(workflowId, terminalStatus), runId);
      }
    }
    await multi.exec();
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────

  async close(): Promise<void> {
    await this.redis.quit();
  }

  getRedis(): Redis {
    return this.redis;
  }
}
