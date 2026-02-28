import type { Job } from "bullmq";
import { createScopedLogger } from "./logger";
import { executeStep } from "./executor";
import type { StateManager } from "./state";
import type {
  ChiselJobData,
  ChiselMeta,
  EngineConfig,
  EngineEventName,
  Logger,
  MiddlewareConfig,
  StepOptions,
  TriggerOptions,
  Workflow,
  WorkflowContext,
} from "./types";

/**
 * Parse a duration string (e.g. "5m", "30s", "2h") into milliseconds.
 */
export function parseDuration(duration: string | number): number {
  if (typeof duration === "number") return duration;

  const match = duration.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) {
    throw new Error(
      `Invalid duration format: "${duration}". Use e.g. "5m", "30s", "2h", or a number (ms).`
    );
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "ms":
      return value;
    case "s":
      return value * 1000;
    case "m":
      return value * 60_000;
    case "h":
      return value * 3_600_000;
    case "d":
      return value * 86_400_000;
    default:
      throw new Error(`Unknown duration unit: ${unit}`);
  }
}

export interface CreateContextOptions {
  job: Job<ChiselJobData>;
  meta: ChiselMeta;
  state: StateManager;
  defaults: EngineConfig["defaults"];
  baseLogger: Logger;
  middleware?: MiddlewareConfig;
  emitEvent: (event: EngineEventName, payload: any) => void;
  triggerFn: <TIn>(
    workflow: Workflow<TIn, unknown> | string,
    data: TIn,
    options?: TriggerOptions
  ) => Promise<{ runId: string }>;
  abortController: AbortController;
}

/**
 * Creates the WorkflowContext (ctx) passed to workflow handlers.
 */
export function createWorkflowContext<TInput>(
  opts: CreateContextOptions
): WorkflowContext<TInput> {
  const {
    job,
    meta,
    state,
    defaults,
    baseLogger,
    middleware,
    emitEvent,
    triggerFn,
    abortController,
  } = opts;

  const signal = abortController.signal;

  const logger = createScopedLogger(baseLogger, {
    workflowId: meta.workflowId,
    runId: meta.runId,
  });

  // Track step names seen during this execution pass to detect duplicates.
  // Starts empty — cached steps from checkpoint replay are allowed on first call.
  const usedStepNames = new Set<string>();

  const ctx: WorkflowContext<TInput> = {
    data: job.data.input as TInput,
    runId: meta.runId,
    attempt: job.attemptsMade + 1,
    signal,
    logger,

    async step<T>(
      name: string,
      fn: () => Promise<T> | T,
      options?: StepOptions
    ): Promise<T> {
      return executeStep<T>({
        name,
        fn,
        stepOptions: options,
        job,
        meta,
        state,
        defaults,
        logger,
        signal,
        middleware,
        usedStepNames,
        emitEvent,
      });
    },

    async parallel<T extends readonly unknown[]>(
      steps: [...{ [K in keyof T]: Promise<T[K]> }]
    ): Promise<T> {
      // Use allSettled so every sibling step finishes before we propagate
      // a failure — prevents zombie steps mutating state after the
      // workflow has moved into error/retry handling.
      const settled = await Promise.allSettled(steps);
      const firstError = settled.find(
        (r): r is PromiseRejectedResult => r.status === "rejected"
      );
      if (firstError) {
        throw firstError.reason;
      }
      return settled.map(
        (r) => (r as PromiseFulfilledResult<unknown>).value
      ) as unknown as T;
    },

    async sleep(duration: string | number): Promise<void> {
      const ms = parseDuration(duration);
      logger.debug(`Sleeping for ${ms}ms`);

      // Use BullMQ's delayed job mechanism for longer sleeps
      if (ms > 5000 && job.moveToDelayed) {
        await job.moveToDelayed(Date.now() + ms);
        // After moveToDelayed, we need to throw a special error
        // to stop execution — the job will be re-picked up after the delay
        throw new SleepInterrupt(ms);
      }

      // For short sleeps, just await a timer
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, ms);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new Error("Workflow cancelled"));
          },
          { once: true }
        );
      });
    },

    async trigger<TIn>(
      workflow: Workflow<TIn, unknown> | string,
      data: TIn,
      options?: TriggerOptions
    ): Promise<{ runId: string }> {
      return triggerFn(workflow, data, options);
    },
  };

  return ctx;
}

/**
 * Thrown internally when ctx.sleep() uses moveToDelayed.
 * The engine catches this to gracefully pause the workflow.
 */
export class SleepInterrupt extends Error {
  readonly isSleepInterrupt = true;
  readonly delayMs: number;

  constructor(delayMs: number) {
    super(`Sleep interrupt: ${delayMs}ms`);
    this.name = "SleepInterrupt";
    this.delayMs = delayMs;
  }
}

export function isSleepInterrupt(err: unknown): err is SleepInterrupt {
  return (err as any)?.isSleepInterrupt === true;
}

export function generateRunId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
