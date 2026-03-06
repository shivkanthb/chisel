import { Engine } from "./engine";
import type { EngineConfig, Workflow, WorkflowConfig, WorkflowHandler } from "./types";

export { Engine } from "./engine";
export { FatalError, StepTimeoutError, WorkflowCancelledError, WorkflowTimeoutError } from "./errors";

export type {
  EngineConfig,
  Workflow,
  WorkflowConfig,
  WorkflowContext,
  WorkflowHandler,
  StepOptions,
  TriggerOptions,
  TriggerBatchItem,
  AnyTriggerBatchItem,
  RunInfo,
  RunStatus,
  StepInfo,
  StepStatus,
  HealthInfo,
  Logger,
  BackoffConfig,
  RemovalPolicy,
  MiddlewareConfig,
  EngineEvents,
  EngineEventName,
  WorkflowInfo,
  ListRunsOptions,
  ListRunsResult,
} from "./types";

/**
 * Create a new workflow engine instance.
 */
export function createEngine(config: EngineConfig): Engine {
  return new Engine(config);
}

/**
 * Define a workflow. Returns a Workflow object to be registered with `engine.register()`.
 */
export function defineWorkflow<TInput = unknown, TOutput = unknown>(
  config: WorkflowConfig<TInput>,
  handler: WorkflowHandler<TInput, TOutput>
): Workflow<TInput, TOutput> {
  if (!config.id) {
    throw new Error("Workflow must have an id");
  }

  return {
    id: config.id,
    config,
    handler,
    input: undefined as unknown as TInput,
    output: undefined as unknown as TOutput,
  };
}
