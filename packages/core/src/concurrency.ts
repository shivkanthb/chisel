import type Redis from "ioredis";

/**
 * Manages keyed concurrency locks via Redis.
 *
 * For `concurrency: { limit: 1, key: (data) => data.gameId }`:
 * Uses a Redis SET NX to ensure only one job per key runs at a time.
 */
export class ConcurrencyManager {
  private redis: Redis;
  private prefix: string;

  constructor(redis: Redis, prefix: string) {
    this.redis = redis;
    this.prefix = prefix;
  }

  private lockKey(workflowId: string, concurrencyKey: string): string {
    return `${this.prefix}:lock:${workflowId}:${concurrencyKey}`;
  }

  /**
   * Attempt to acquire a keyed concurrency lock.
   * Returns true if the lock was acquired.
   */
  async acquire(
    workflowId: string,
    concurrencyKey: string,
    runId: string,
    ttlMs: number = 300_000
  ): Promise<boolean> {
    const key = this.lockKey(workflowId, concurrencyKey);
    const result = await this.redis.set(key, runId, "PX", ttlMs, "NX");
    return result === "OK";
  }

  /**
   * Release a keyed concurrency lock.
   * Only releases if the lock is still held by the given runId.
   */
  async release(
    workflowId: string,
    concurrencyKey: string,
    runId: string
  ): Promise<void> {
    const key = this.lockKey(workflowId, concurrencyKey);
    // Atomic check-and-delete via Lua script
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await this.redis.eval(script, 1, key, runId);
  }
}
