/**
 * Throw FatalError to immediately fail a workflow without retrying.
 */
export class FatalError extends Error {
  readonly fatal = true;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FatalError";
  }
}

/**
 * Thrown when a step exceeds its configured timeout.
 */
export class StepTimeoutError extends Error {
  readonly stepName: string;
  readonly timeoutMs: number;

  constructor(stepName: string, timeoutMs: number) {
    super(`Step "${stepName}" timed out after ${timeoutMs}ms`);
    this.name = "StepTimeoutError";
    this.stepName = stepName;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Thrown when a workflow is cancelled.
 */
export class WorkflowCancelledError extends Error {
  constructor(runId: string) {
    super(`Workflow run "${runId}" was cancelled`);
    this.name = "WorkflowCancelledError";
  }
}

/**
 * Thrown when a workflow exceeds its configured timeout.
 */
export class WorkflowTimeoutError extends Error {
  readonly workflowId: string;
  readonly timeoutMs: number;

  constructor(workflowId: string, timeoutMs: number) {
    super(`Workflow "${workflowId}" timed out after ${timeoutMs}ms`);
    this.name = "WorkflowTimeoutError";
    this.workflowId = workflowId;
    this.timeoutMs = timeoutMs;
  }
}

export function isFatalError(error: unknown): error is FatalError {
  return error instanceof FatalError || (error as any)?.fatal === true;
}
