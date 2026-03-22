import type { Job } from "bullmq";
import { isFatalError, StepTimeoutError } from "./errors";
import { createScopedLogger } from "./logger";
import type { StateManager } from "./state";
import type {
  BackoffConfig,
  ChiselJobData,
  ChiselMeta,
  EngineConfig,
  EngineEventName,
  Logger,
  MiddlewareConfig,
  StepOptions,
  Workflow,
} from "./types";

/**
 * Executes a single step with retry logic, timeouts, and checkpoint persistence.
 * Called by the WorkflowContext when ctx.step() is invoked.
 *
 * Step-level retries are handled here (not by BullMQ job retries).
 * BullMQ job retries are for workflow-level retries only.
 */
export async function executeStep<T>(opts: {
  name: string;
  fn: () => Promise<T> | T;
  stepOptions?: StepOptions;
  job: Job<ChiselJobData>;
  meta: ChiselMeta;
  state: StateManager;
  defaults: EngineConfig["defaults"];
  logger: Logger;
  signal: AbortSignal;
  middleware?: MiddlewareConfig;
  usedStepNames: Set<string>;
  emitEvent?: (event: EngineEventName, payload: any) => void;
}): Promise<T> {
  const {
    name,
    fn,
    stepOptions,
    job,
    meta,
    state,
    defaults,
    logger,
    signal,
    middleware,
    usedStepNames,
    emitEvent,
  } = opts;

  // Enforce unique step names within a single execution pass.
  // usedStepNames starts empty each execution — cached steps from checkpoint
  // replay pass through on first call (added to set), duplicates always throw.
  if (usedStepNames.has(name)) {
    throw new Error(
      `Duplicate step name "${name}". Step names must be unique within a workflow.`
    );
  }
  usedStepNames.add(name);

  // Check if already completed (checkpoint replay after crash)
  const cached = meta.completedSteps[name];
  if (cached && cached.status === "completed") {
    logger.debug(`Step "${name}" already completed, returning cached result`);
    return cached.result as T;
  }

  // Check for cancellation
  if (signal.aborted) {
    throw new Error("Workflow cancelled");
  }

  const stepLogger = createScopedLogger(logger, { stepName: name });
  const timeout = stepOptions?.timeout ?? defaults?.timeout ?? 60_000;
  const maxAttempts = (stepOptions?.retries ?? defaults?.retries ?? 3) + 1; // +1 for initial attempt
  const backoff = stepOptions?.backoff ?? defaults?.backoff ?? { type: "exponential", delay: 2000 };
  const startedAt = Date.now();

  // Emit step:start event
  emitEvent?.("step:start", {
    workflowId: meta.workflowId,
    runId: meta.runId,
    stepName: name,
  });

  // Update step state to running
  await state.updateStep(meta.runId, {
    name,
    status: "running",
    startedAt,
  });

  // Run middleware
  if (middleware?.beforeStep) {
    await middleware.beforeStep({
      workflowId: meta.workflowId,
      runId: meta.runId,
      stepName: name,
      data: job.data.input,
    });
  }

  // Step-level retry loop
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Execute with timeout
      const result = await executeWithTimeout(fn, timeout, name, signal);

      const duration = Date.now() - startedAt;

      // Persist step result
      meta.completedSteps[name] = {
        status: "completed",
        result,
        duration,
        startedAt,
      };

      // Update job data with checkpoint
      await job.updateData({
        ...job.data,
        __chisel: { ...meta, stepIndex: meta.stepIndex + 1 },
      });

      // Update step state
      await state.updateStep(meta.runId, {
        name,
        status: "completed",
        result,
        duration,
        attempts: attempt,
        startedAt,
      });

      // Emit step:complete event
      emitEvent?.("step:complete", {
        workflowId: meta.workflowId,
        runId: meta.runId,
        stepName: name,
        result,
        duration,
      });

      // Run middleware
      if (middleware?.afterStep) {
        await middleware.afterStep({
          workflowId: meta.workflowId,
          runId: meta.runId,
          stepName: name,
          data: job.data.input,
          result,
          duration,
        });
      }

      stepLogger.debug(`Step completed`, { duration, attempt });

      return result;
    } catch (error) {
      lastError = error;

      // Fatal errors skip all retries
      if (isFatalError(error)) {
        const duration = Date.now() - startedAt;
        await state.updateStep(meta.runId, {
          name,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
          duration,
          attempts: attempt,
          startedAt,
        });

        // Emit step:fail event
        emitEvent?.("step:fail", {
          workflowId: meta.workflowId,
          runId: meta.runId,
          stepName: name,
          error: error instanceof Error ? error : new Error(String(error)),
          attempt,
        });

        stepLogger.error(`Step fatally failed`, {
          error: error instanceof Error ? error.message : String(error),
        });

        // Annotate error with step name for the engine
        (error as any).__chiselStepName = name;
        throw error;
      }

      // Cancellation is not retryable
      if (signal.aborted) {
        throw error;
      }

      // If more attempts remain, set state to retrying and wait
      if (attempt < maxAttempts) {
        await state.updateStep(meta.runId, {
          name,
          status: "retrying",
          error: error instanceof Error ? error.message : String(error),
          attempts: attempt,
          startedAt,
        });

        // Emit step:retry event
        emitEvent?.("step:retry", {
          workflowId: meta.workflowId,
          runId: meta.runId,
          stepName: name,
          attempt: attempt + 1,
          maxAttempts,
        });

        stepLogger.warn(`Step failed, retrying`, {
          error: error instanceof Error ? error.message : String(error),
          attempt,
          maxAttempts,
        });

        // Wait for backoff
        const delayMs = backoff.type === "fixed"
          ? backoff.delay
          : backoff.delay * Math.pow(2, attempt - 1);
        await sleep(delayMs, signal);
      } else {
        // Retries exhausted — mark as failed
        const duration = Date.now() - startedAt;
        await state.updateStep(meta.runId, {
          name,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
          duration,
          attempts: attempt,
          startedAt,
        });

        // Emit step:fail event
        emitEvent?.("step:fail", {
          workflowId: meta.workflowId,
          runId: meta.runId,
          stepName: name,
          error: error instanceof Error ? error : new Error(String(error)),
          attempt,
        });

        stepLogger.error(`Step failed (retries exhausted)`, {
          error: error instanceof Error ? error.message : String(error),
          attempts: attempt,
        });
      }
    }
  }

  // All retries exhausted — annotate and rethrow
  if (lastError) {
    (lastError as any).__chiselStepName = name;
  }
  throw lastError;
}

async function executeWithTimeout<T>(
  fn: () => Promise<T> | T,
  timeoutMs: number,
  stepName: string,
  signal: AbortSignal
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new StepTimeoutError(stepName, timeoutMs));
    }, timeoutMs);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Workflow cancelled"));
    };

    if (signal.aborted) {
      clearTimeout(timer);
      reject(new Error("Workflow cancelled"));
      return;
    }

    signal.addEventListener("abort", onAbort, { once: true });

    Promise.resolve(fn())
      .then((result) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        reject(err);
      });
  });
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Workflow cancelled"));
      return;
    }
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
}
