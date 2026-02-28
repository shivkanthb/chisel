import { describe, it, expect, vi } from "vitest";
import { createScopedLogger } from "./logger";

describe("createScopedLogger", () => {
  it("injects scope into every log call", () => {
    const base = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    const logger = createScopedLogger(base, {
      workflowId: "test-wf",
      runId: "run_123",
    });

    logger.info("hello", { extra: "data" });
    expect(base.info).toHaveBeenCalledWith("hello", {
      workflowId: "test-wf",
      runId: "run_123",
      extra: "data",
    });

    logger.warn("warning");
    expect(base.warn).toHaveBeenCalledWith("warning", {
      workflowId: "test-wf",
      runId: "run_123",
    });

    logger.error("error", { code: 500 });
    expect(base.error).toHaveBeenCalledWith("error", {
      workflowId: "test-wf",
      runId: "run_123",
      code: 500,
    });
  });

  it("uses console as default when no base logger is provided", () => {
    // Should not throw
    const logger = createScopedLogger(undefined, { scope: "test" });
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });
});
