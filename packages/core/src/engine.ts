import { Queue, Worker, DelayedError, type ConnectionOptions, UnrecoverableError } from "bullmq";
import { ConcurrencyManager } from "./concurrency";
import { createWorkflowContext, generateRunId, isSleepInterrupt } from "./context";
import { isFatalError, WorkflowTimeoutError } from "./errors";
import { createScopedLogger } from "./logger";
import { StateManager } from "./state";
import type {
  BackoffConfig,
  ChiselJobData,
  EngineConfig,
  EngineEventName,
  EngineEvents,
  HealthInfo,
  ListRunsOptions,
  ListRunsResult,
  Logger,
  RunRetentionConfig,
  RunRetentionPolicy,
  RunInfo,
  TerminalRunStatus,
  AnyTriggerBatchItem,
  TriggerOptions,
  Workflow,
  WorkflowInfo,
} from "./types";

type EventHandler<T> = (payload: T) => void;

const DEFAULT_RUN_RETENTION: Record<TerminalRunStatus, RunRetentionPolicy> = {
  completed: { age: 7 * 24 * 60 * 60, count: 10_000 },
  failed: { age: 30 * 24 * 60 * 60, count: 10_000 },
  cancelled: { age: 7 * 24 * 60 * 60, count: 10_000 },
};

/**
 * Strip credentials from a connection config so it's safe to expose (health()).
 * Returns host/port only — never the password.
 */
export function redactConnection(
  connection: EngineConfig["connection"]
): { host: string; port?: number } {
  if ("url" in connection) {
    try {
      const u = new URL(connection.url);
      return { host: u.hostname, port: u.port ? Number(u.port) : 6379 };
    } catch {
      return { host: "redacted" };
    }
  }
  return { host: connection.host, port: connection.port };
}

export class Engine {
  private config: EngineConfig;
  private workflows = new Map<string, Workflow<any, any>>();
  private queues = new Map<string, Queue>();
  private workers = new Map<string, Worker>();
  private state: StateManager;
  private concurrency: ConcurrencyManager;
  private logger: Logger;
  private prefix: string;
  private connection: ConnectionOptions;
  private started = false;

  // Track active AbortControllers so cancelRun can abort in-flight work
  private activeAbortControllers = new Map<string, AbortController>();

  private eventHandlers = new Map<string, Set<EventHandler<any>>>();

  constructor(config: EngineConfig) {
    this.config = config;
    this.prefix = config.prefix ?? "chisel";
    this.logger =
      config.logger ??
      ({
        info: console.log,
        warn: console.warn,
        error: console.error,
        debug: () => {},
      } satisfies Logger);

    // Resolve connection options
    if ("url" in config.connection) {
      this.connection = { url: config.connection.url } as ConnectionOptions;
    } else {
      this.connection = {
        host: config.connection.host,
        port: config.connection.port,
        password: config.connection.password,
        db: config.connection.db,
      };
    }

    this.state = new StateManager(
      this.connection,
      this.prefix,
      this.resolveRunRetention(config.retention)
    );
    this.concurrency = new ConcurrencyManager(
      this.state.getRedis(),
      this.prefix
    );
  }

  /**
   * Register a workflow with the engine.
   * Can be called before or after start().
   */
  register<TInput, TOutput>(workflow: Workflow<TInput, TOutput>): this {
    if (this.workflows.has(workflow.id)) {
      throw new Error(`Workflow "${workflow.id}" is already registered`);
    }
    this.workflows.set(workflow.id, workflow);

    // If engine is already running, spin up queue + worker immediately
    if (this.started) {
      this.setupWorkflow(workflow.id, workflow);
    }

    return this;
  }

  /**
   * Start processing all registered workflows.
   * Creates BullMQ queues and workers.
   */
  async start(): Promise<void> {
    if (this.started) {
      throw new Error("Engine is already started");
    }

    for (const [id, workflow] of this.workflows) {
      this.setupWorkflow(id, workflow);
    }

    this.started = true;
    this.logger.info("Engine started", {
      workflows: Array.from(this.workflows.keys()),
    });
  }

  private setupWorkflow(id: string, workflow: Workflow<any, any>): void {
    if (this.queues.has(id)) return; // already set up

    const queueName = this.queueName(id);

    const queue = new Queue(queueName, {
      connection: this.connection,
      prefix: this.prefix,
      defaultJobOptions: {
        removeOnComplete: this.config.defaults?.removeOnComplete ?? {
          age: 3600,
          count: 200,
        },
        removeOnFail: this.config.defaults?.removeOnFail ?? {
          age: 86400,
          count: 1000,
        },
      },
    });
    this.queues.set(id, queue);

    const workerOpts: any = {
      connection: this.connection,
      prefix: this.prefix,
      concurrency: workflow.config.concurrency?.limit ?? 5,
    };

    if (workflow.config.rateLimit) {
      workerOpts.limiter = {
        max: workflow.config.rateLimit.max,
        duration: workflow.config.rateLimit.duration,
      };
    }

    const { retries, backoff } = this.resolveRetryConfig(workflow);

    const worker = new Worker<ChiselJobData>(
      queueName,
      async (job) => this.processJob(workflow, job),
      {
        ...workerOpts,
        settings: {
          backoffStrategy: (attemptsMade: number) => {
            if (backoff.type === "fixed") return backoff.delay;
            return backoff.delay * Math.pow(2, attemptsMade - 1);
          },
        },
      }
    );

    worker.on("failed", (job, err) => {
      if (!job) return;
      const meta = job.data.__chisel;
      if (!meta) return;

      // Don't override status for UnrecoverableError (FatalError) —
      // processJob already set the run to failed.
      if (err instanceof UnrecoverableError) return;

      // If more BullMQ retries remain, set status back to queued
      if (job.attemptsMade < retries) {
        this.state.updateRunStatus(meta.runId, "queued").catch(() => {});
      }
    });

    this.workers.set(id, worker);
  }

  /**
   * Gracefully stop all workers and close connections.
   */
  async stop(): Promise<void> {
    if (!this.started) return;

    // Abort all in-flight workflows
    for (const [, ac] of this.activeAbortControllers) {
      ac.abort();
    }
    this.activeAbortControllers.clear();

    // Close workers first (waits for in-flight jobs)
    const workerCloses = Array.from(this.workers.values()).map((w) =>
      w.close()
    );
    await Promise.all(workerCloses);

    // Close queues
    const queueCloses = Array.from(this.queues.values()).map((q) => q.close());
    await Promise.all(queueCloses);

    // Close state manager (Redis connection)
    await this.state.close();

    this.workers.clear();
    this.queues.clear();
    this.started = false;
    this.logger.info("Engine stopped");
  }

  /**
   * Shared trigger preparation: validates, deduplicates, creates run state,
   * and builds the jobData + queue options. Returns null if deduplicated.
   */
  private async prepareTrigger(
    workflowId: string,
    data: unknown,
    options?: TriggerOptions
  ): Promise<{
    runId: string;
    queue: Queue;
    jobData: ChiselJobData;
    jobOpts: any;
  } | { runId: string; deduplicated: true }> {
    const queue = this.queues.get(workflowId);
    if (!queue) {
      throw new Error(
        `Workflow "${workflowId}" is not registered or engine is not started`
      );
    }

    const wf = this.workflows.get(workflowId);
    if (wf?.config.input) {
      wf.config.input.parse(data);
    }

    const runId = generateRunId();

    if (options?.deduplication) {
      const { isDuplicate, existingRunId } = await this.state.tryDedup(
        options.deduplication.key,
        runId,
        options.deduplication.ttl
      );
      if (isDuplicate) {
        return { runId: existingRunId ?? runId, deduplicated: true };
      }
    }

    let delay: number | undefined = options?.delay;
    if (options?.runAt) {
      delay = Math.max(0, options.runAt.getTime() - Date.now());
    }

    await this.state.createRun(runId, workflowId, data);

    const { retries, backoff } = this.resolveRetryConfig(wf);

    return {
      runId,
      queue,
      jobData: {
        input: data,
        __chisel: {
          runId,
          workflowId,
          completedSteps: {},
          parallelGroup: null,
          stepIndex: 0,
        },
      },
      jobOpts: {
        jobId: runId,
        delay,
        priority: options?.priority ?? wf?.config.priority,
        attempts: retries + 1,
        backoff: {
          type: backoff.type === "exponential" ? "exponential" : "fixed",
          delay: backoff.delay,
        },
      },
    };
  }

  /**
   * Trigger a workflow run.
   */
  async trigger<TInput>(
    workflow: Workflow<TInput, unknown> | string,
    data: TInput,
    options?: TriggerOptions
  ): Promise<{ runId: string }> {
    const workflowId =
      typeof workflow === "string" ? workflow : workflow.id;
    const prepared = await this.prepareTrigger(workflowId, data, options);
    if ("deduplicated" in prepared) return { runId: prepared.runId };

    await prepared.queue.add(workflowId, prepared.jobData, prepared.jobOpts);
    return { runId: prepared.runId };
  }

  /**
   * Trigger multiple workflows in a single Redis round-trip per queue.
   */
  async triggerBatch(
    items: AnyTriggerBatchItem[]
  ): Promise<Array<{ runId: string }>> {
    const results: Array<{ runId: string }> = [];
    const queueJobs = new Map<string, Array<{ name: string; data: ChiselJobData; opts: any }>>();

    for (const item of items) {
      const workflowId =
        typeof item.workflow === "string" ? item.workflow : item.workflow.id;
      const prepared = await this.prepareTrigger(workflowId, item.data, item.options);
      results.push({ runId: prepared.runId });
      if ("deduplicated" in prepared) continue;

      if (!queueJobs.has(workflowId)) queueJobs.set(workflowId, []);
      queueJobs.get(workflowId)!.push({
        name: workflowId,
        data: prepared.jobData,
        opts: prepared.jobOpts,
      });
    }

    for (const [workflowId, jobs] of queueJobs) {
      const queue = this.queues.get(workflowId)!;
      await queue.addBulk(jobs);
    }

    return results;
  }

  /**
   * Get information about a workflow run.
   */
  async getRun(runId: string): Promise<RunInfo | null> {
    return this.state.getRun(runId);
  }

  /**
   * List runs for a workflow with cursor-based pagination.
   */
  async listRuns(
    workflowId: string,
    options?: ListRunsOptions
  ): Promise<ListRunsResult> {
    return this.state.listRuns(workflowId, options);
  }

  /**
   * List all registered workflows with their config metadata.
   */
  listWorkflows(): WorkflowInfo[] {
    return Array.from(this.workflows.entries()).map(([id, wf]) => ({
      id,
      concurrency: wf.config.concurrency?.limit ?? 5,
      retries: wf.config.retries ?? this.config.defaults?.retries ?? 3,
      timeout: wf.config.timeout ?? this.config.defaults?.timeout,
      priority: wf.config.priority,
      rateLimit: wf.config.rateLimit,
      hasInput: !!wf.config.input,
    }));
  }

  /**
   * Cancel a running workflow.
   */
  async cancelRun(runId: string): Promise<void> {
    const run = await this.state.getRun(runId);
    if (!run) {
      throw new Error(`Run "${runId}" not found`);
    }

    // Abort the in-flight AbortController if this run is currently executing
    const ac = this.activeAbortControllers.get(runId);
    if (ac) {
      ac.abort();
      this.activeAbortControllers.delete(runId);
    }

    // Try to remove the job from the queue
    const queue = this.queues.get(run.workflowId);
    if (queue) {
      const job = await queue.getJob(runId);
      if (job) {
        await job.moveToFailed(
          new Error("Workflow cancelled"),
          "0",
          true
        );
      }
    }

    await this.state.setRunCancelled(runId, run.workflowId);
  }

  /**
   * Retry a failed workflow from the failed step.
   */
  async retryRun(runId: string): Promise<void> {
    const run = await this.state.getRun(runId);
    if (!run) {
      throw new Error(`Run "${runId}" not found`);
    }
    if (run.status !== "failed") {
      throw new Error(`Run "${runId}" is not in failed state`);
    }

    const queue = this.queues.get(run.workflowId);
    if (queue) {
      const job = await queue.getJob(runId);
      if (job) {
        await job.retry("failed");
        await this.state.clearTerminalRunIndexes(runId, run.workflowId);
        await this.state.updateRunStatus(runId, "queued");
      }
    }
  }

  /**
   * Get engine health information.
   */
  async health(): Promise<HealthInfo> {
    let connected = false;
    try {
      await this.state.getRedis().ping();
      connected = true;
    } catch {
      connected = false;
    }

    return {
      connected,
      redis: redactConnection(this.config.connection),
      workers: this.workers.size,
      queues: Array.from(this.queues.keys()),
    };
  }

  /**
   * Subscribe to engine events.
   */
  on<E extends EngineEventName>(
    event: E,
    handler: EventHandler<EngineEvents[E]>
  ): this {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return this;
  }

  /**
   * Remove an event handler.
   */
  off<E extends EngineEventName>(
    event: E,
    handler: EventHandler<EngineEvents[E]>
  ): this {
    this.eventHandlers.get(event)?.delete(handler);
    return this;
  }

  emit<E extends EngineEventName>(
    event: E,
    payload: EngineEvents[E]
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(payload);
        } catch (err) {
          this.logger.error("Event handler error", {
            event,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  /**
   * Process a single workflow job.
   */
  private async processJob(
    workflow: Workflow<any, any>,
    job: any // BullMQ Job<ChiselJobData>
  ): Promise<unknown> {
    const meta: ChiselJobData["__chisel"] = job.data.__chisel;
    const runId = meta.runId;

    const logger = createScopedLogger(this.logger, {
      workflowId: workflow.id,
      runId,
    });

    // Registered inside the try below so an early throw can't orphan it.
    const abortController = new AbortController();

    // Update run status to running
    await this.state.updateRunStatus(runId, "running");

    // Emit workflow start event
    this.emit("workflow:start", {
      workflowId: workflow.id,
      runId,
      data: job.data.input,
    });

    // Run middleware
    if (this.config.middleware?.beforeWorkflow) {
      await this.config.middleware.beforeWorkflow({
        workflowId: workflow.id,
        runId,
        data: job.data.input,
      });
    }

    let concurrencyKey: string | null = null;
    let timedOut = false;
    const workflowTimeout = workflow.config.timeout ?? this.config.defaults?.timeout;
    const startedAt = Date.now();

    try {
      this.activeAbortControllers.set(runId, abortController);

      // Keyed concurrency lock — inside try so the throw is caught gracefully
      if (workflow.config.concurrency?.key) {
        concurrencyKey = workflow.config.concurrency.key(job.data.input);
        const acquired = await this.concurrency.acquire(
          workflow.id,
          concurrencyKey,
          runId,
          workflowTimeout ?? 300_000
        );
        if (!acquired) {
          await this.state.updateRunStatus(runId, "queued");
          await job.moveToDelayed(Date.now() + 1000, job.token);
          throw new DelayedError();
        }
      }

      const ctx = createWorkflowContext({
        job,
        meta,
        state: this.state,
        defaults: this.config.defaults,
        baseLogger: logger,
        middleware: this.config.middleware,
        emitEvent: (event, payload) => this.emit(event, payload),
        triggerFn: (wf, data, options) => this.trigger(wf, data, options),
        abortController,
      });

      // Run handler with optional workflow-level timeout
      let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
      if (workflowTimeout) {
        timeoutTimer = setTimeout(() => {
          timedOut = true;
          abortController.abort();
        }, workflowTimeout);
      }

      let result: unknown;
      try {
        result = await workflow.handler(ctx);
      } finally {
        if (timeoutTimer) clearTimeout(timeoutTimer);
      }

      const duration = Date.now() - startedAt;

      // Mark run as completed
      await this.state.setRunResult(runId, workflow.id, result);

      this.emit("workflow:complete", {
        workflowId: workflow.id,
        runId,
        result,
        duration,
      });

      logger.info("Workflow completed", { duration });

      return result;
    } catch (error) {
      // Handle sleep interrupt — throw DelayedError so BullMQ's worker
      // knows the job was moved to delayed and won't try to moveToFinished.
      if (isSleepInterrupt(error)) {
        logger.debug("Workflow sleeping", { delayMs: error.delayMs });
        throw new DelayedError();
      }

      // DelayedError (e.g. from concurrency re-delay) — rethrow as-is
      // so BullMQ handles it correctly.
      if (error instanceof DelayedError) {
        throw error;
      }

      const duration = Date.now() - startedAt;

      // Find the failed step name from current step state
      const failedStep = (error as any)?.__chiselStepName as string | undefined;

      // Workflow-level timeout: non-retryable, fail immediately
      if (timedOut) {
        const err = new WorkflowTimeoutError(workflow.id, workflowTimeout!);
        await this.state.setRunError(runId, workflow.id, err.message, failedStep);

        this.emit("workflow:fail", {
          workflowId: workflow.id,
          runId,
          error: err,
          failedStep,
        });

        logger.error(err.message, { duration });
        throw new UnrecoverableError(err.message);
      }

      // Fatal errors: mark as failed immediately and throw UnrecoverableError
      // so BullMQ does not retry.
      if (isFatalError(error)) {
        await this.state.setRunError(
          runId,
          workflow.id,
          error instanceof Error ? error.message : String(error),
          failedStep
        );

        this.emit("workflow:fail", {
          workflowId: workflow.id,
          runId,
          error: error instanceof Error ? error : new Error(String(error)),
          failedStep,
        });

        logger.error("Workflow fatally failed", {
          error: error instanceof Error ? error.message : String(error),
          duration,
        });

        // UnrecoverableError tells BullMQ to skip all remaining retries
        throw new UnrecoverableError(
          error instanceof Error ? error.message : String(error)
        );
      }

      // Non-fatal: only mark run as failed if retries are exhausted
      const { retries } = this.resolveRetryConfig(workflow);
      const isLastAttempt = job.attemptsMade >= retries;

      if (isLastAttempt) {
        await this.state.setRunError(
          runId,
          workflow.id,
          error instanceof Error ? error.message : String(error),
          failedStep
        );

        this.emit("workflow:fail", {
          workflowId: workflow.id,
          runId,
          error: error instanceof Error ? error : new Error(String(error)),
          failedStep,
        });

        logger.error("Workflow failed (retries exhausted)", {
          error: error instanceof Error ? error.message : String(error),
          duration,
        });
      } else {
        // Will retry — set status back to queued, not failed
        logger.warn("Workflow attempt failed, will retry", {
          error: error instanceof Error ? error.message : String(error),
          attempt: job.attemptsMade + 1,
          maxAttempts: retries + 1,
          duration,
        });
      }

      throw error;
    } finally {
      this.activeAbortControllers.delete(runId);

      // Release concurrency lock
      if (concurrencyKey) {
        await this.concurrency.release(workflow.id, concurrencyKey, runId);
      }
    }
  }

  private resolveRetryConfig(workflow?: Workflow<any, any>): { retries: number; backoff: BackoffConfig } {
    return {
      retries: workflow?.config.retries ?? this.config.defaults?.retries ?? 3,
      backoff: workflow?.config.backoff ?? this.config.defaults?.backoff ?? { type: "exponential", delay: 2000 },
    };
  }

  private resolveRunRetention(
    retention?: RunRetentionConfig | false
  ): Record<TerminalRunStatus, RunRetentionPolicy | false> {
    if (retention === false) {
      return {
        completed: false,
        failed: false,
        cancelled: false,
      };
    }

    const merged = {} as Record<TerminalRunStatus, RunRetentionPolicy | false>;
    for (const status of ["completed", "failed", "cancelled"] as const) {
      const override = retention?.[status];
      if (override === false) {
        merged[status] = false;
        continue;
      }

      merged[status] = {
        ...DEFAULT_RUN_RETENTION[status],
        ...(override ?? {}),
      };
    }

    return merged;
  }

  private queueName(workflowId: string): string {
    return `${workflowId}`;
  }
}
