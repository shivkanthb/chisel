import { describe, it, expect } from "vitest";
import {
  FatalError,
  StepTimeoutError,
  WorkflowCancelledError,
  isFatalError,
} from "./errors";

describe("FatalError", () => {
  it("has the correct name and fatal flag", () => {
    const err = new FatalError("Game not found");
    expect(err.name).toBe("FatalError");
    expect(err.message).toBe("Game not found");
    expect(err.fatal).toBe(true);
    expect(err instanceof Error).toBe(true);
  });
});

describe("StepTimeoutError", () => {
  it("includes step name and timeout in message", () => {
    const err = new StepTimeoutError("fetch-data", 30_000);
    expect(err.name).toBe("StepTimeoutError");
    expect(err.stepName).toBe("fetch-data");
    expect(err.timeoutMs).toBe(30_000);
    expect(err.message).toContain("fetch-data");
    expect(err.message).toContain("30000");
  });
});

describe("WorkflowCancelledError", () => {
  it("includes run id in message", () => {
    const err = new WorkflowCancelledError("run_123");
    expect(err.name).toBe("WorkflowCancelledError");
    expect(err.message).toContain("run_123");
  });
});

describe("isFatalError", () => {
  it("returns true for FatalError instances", () => {
    expect(isFatalError(new FatalError("test"))).toBe(true);
  });

  it("returns true for objects with fatal=true", () => {
    expect(isFatalError({ fatal: true, message: "test" })).toBe(true);
  });

  it("returns false for regular errors", () => {
    expect(isFatalError(new Error("test"))).toBe(false);
  });

  it("returns false for non-errors", () => {
    expect(isFatalError(null)).toBe(false);
    expect(isFatalError(undefined)).toBe(false);
    expect(isFatalError("string")).toBe(false);
  });
});
