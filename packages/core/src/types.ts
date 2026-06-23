// Zod is optional — define a minimal interface for the schema type
export interface ZodLike<T = unknown> {
  parse(data: unknown): T;
  safeParse(data: unknown): { success: boolean; data?: T; error?: unknown };
}

// ─── Logger ──────────────────────────────────────────────────────────────────

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

// ─── Backoff ─────────────────────────────────────────────────────────────────

export type BackoffConfig =
  | { type: "exponential"; delay: number }
  | { type: "fixed"; delay: number };

// ─── Removal policy ─────────────────────────────────────────────────────────

export interface RemovalPolicy {
  age: number;
  count?: number;
}

export interface RunRetentionPolicy {
  age?: number;
  count?: number;
}

export interface RunRetentionConfig {
  completed?: RunRetentionPolicy | false;
  failed?: RunRetentionPolicy | false;
  cancelled?: RunRetentionPolicy | false;
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export interface EngineConfig {
  connection:
    | { host: string; port: number; password?: string; db?: number }
    | { url: string };
  defaults?: {
    retries?: number;
    backoff?: BackoffConfig;
    timeout?: number;
    removeOnComplete?: RemovalPolicy | number | boolean;
    removeOnFail?: RemovalPolicy | number | boolean;
  };
  prefix?: string;
  logger?: Logger;
  middleware?: MiddlewareConfig;
  retention?: RunRetentionConfig | false;
}

export interface MiddlewareConfig {
  beforeStep?: (ctx: StepMiddlewareContext) => Promise<void> | void;
  afterStep?: (
    ctx: StepMiddlewareContext & { result: unknown; duration: number }
  ) => Promise<void> | void;
  beforeWorkflow?: (ctx: WorkflowMiddlewareContext) => Promise<void> | void;
}

export interface StepMiddlewareContext {
  workflowId: string;
  runId: string;
  stepName: string;
  data: unknown;
}

export interface WorkflowMiddlewareContext {
  workflowId: string;
  runId: string;
  data: unknown;
}

// ─── Workflow ────────────────────────────────────────────────────────────────

export interface WorkflowConfig<TInput = unknown> {
  id: string;
  concurrency?: {
    limit: number;
    key?: (data: TInput) => string;
  };
  retries?: number;
  backoff?: BackoffConfig;
  timeout?: number;
  priority?: number;
  rateLimit?: {
    max: number;
    duration: number;
  };
  input?: ZodLike<TInput>;
}

export type WorkflowHandler<TInput, TOutput> = (
  ctx: WorkflowContext<TInput>
) => Promise<TOutput>;

export interface Workflow<TInput = unknown, TOutput = unknown> {
  id: string;
  config: WorkflowConfig<TInput>;
  handler: WorkflowHandler<TInput, TOutput>;
  input: TInput;
  output: TOutput;
}

// ─── Context ─────────────────────────────────────────────────────────────────

export interface StepOptions {
  retries?: number;
  backoff?: BackoffConfig;
  timeout?: number;
}

export interface WorkflowContext<TInput = unknown> {
  data: TInput;
  runId: string;
  attempt: number;
  signal: AbortSignal;
  logger: Logger;
  step: <T>(
    name: string,
    fn: () => Promise<T> | T,
    options?: StepOptions
  ) => Promise<T>;
  parallel: <T extends readonly unknown[]>(
    steps: [...{ [K in keyof T]: Promise<T[K]> }]
  ) => Promise<T>;
  sleep: (duration: string | number) => Promise<void>;
  trigger: <TIn>(
    workflow: Workflow<TIn, unknown> | string,
    data: TIn,
    options?: TriggerOptions
  ) => Promise<{ runId: string }>;
}

// ─── Trigger ─────────────────────────────────────────────────────────────────

export interface TriggerOptions {
  delay?: number;
  runAt?: Date;
  priority?: number;
  deduplication?: {
    key: string;
    ttl: number;
  };
}

export interface TriggerBatchItem<TInput = unknown> {
  workflow: Workflow<TInput, unknown> | string;
  data: TInput;
  options?: TriggerOptions;
}

/** A batch item where the workflow type constrains the data type. */
export type AnyTriggerBatchItem =
  | TriggerBatchItem<any>
  | { workflow: string; data: unknown; options?: TriggerOptions };

// ─── Run State ───────────────────────────────────────────────────────────────

export type RunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "stalled";

export type TerminalRunStatus = Extract<
  RunStatus,
  "completed" | "failed" | "cancelled"
>;

export type StepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "retrying"
  | "skipped"
  | "sleep";

export interface StepInfo {
  name: string;
  status: StepStatus;
  result?: unknown;
  error?: string;
  duration?: number;
  attempts?: number;
  startedAt?: number;
  order?: number;
}

export interface RunInfo {
  id: string;
  workflowId: string;
  status: RunStatus;
  data: unknown;
  result?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  steps: StepInfo[];
  currentStep?: string;
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
}

export interface HealthInfo {
  connected: boolean;
  // Host/port only — credentials are never exposed here.
  redis: { host: string; port?: number };
  workers: number;
  queues: string[];
}

// ─── Events ──────────────────────────────────────────────────────────────────

export interface EngineEvents {
  "workflow:start": {
    workflowId: string;
    runId: string;
    data: unknown;
  };
  "workflow:complete": {
    workflowId: string;
    runId: string;
    result: unknown;
    duration: number;
  };
  "workflow:fail": {
    workflowId: string;
    runId: string;
    error: Error;
    failedStep?: string;
  };
  "step:start": {
    workflowId: string;
    runId: string;
    stepName: string;
  };
  "step:complete": {
    workflowId: string;
    runId: string;
    stepName: string;
    result: unknown;
    duration: number;
  };
  "step:fail": {
    workflowId: string;
    runId: string;
    stepName: string;
    error: Error;
    attempt: number;
  };
  "step:retry": {
    workflowId: string;
    runId: string;
    stepName: string;
    attempt: number;
    maxAttempts: number;
  };
}

export type EngineEventName = keyof EngineEvents;

// ─── Workflow Info (for studio/dashboard) ────────────────────────────────────

export interface WorkflowInfo {
  id: string;
  concurrency: number;
  retries: number;
  timeout?: number;
  priority?: number;
  rateLimit?: { max: number; duration: number };
  hasInput: boolean;
}

export interface ListRunsOptions {
  cursor?: number;
  limit?: number;
  order?: "asc" | "desc";
  status?: RunStatus;
}

export interface ListRunsResult {
  runs: RunInfo[];
  nextCursor: number | null;
}

// ─── Internal ────────────────────────────────────────────────────────────────

export interface ChiselJobData<TInput = unknown> {
  input: TInput;
  __chisel: ChiselMeta;
}

export interface ChiselMeta {
  runId: string;
  workflowId: string;
  completedSteps: Record<
    string,
    {
      status: "completed";
      result: unknown;
      duration: number;
      startedAt?: number;
    }
  >;
  parallelGroup: string | null;
  stepIndex: number;
}
