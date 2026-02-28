import { describe, it, expect } from "vitest";
import { defineWorkflow } from "./index";

describe("defineWorkflow", () => {
  it("returns a Workflow object with the correct id", () => {
    const wf = defineWorkflow({ id: "test/workflow" }, async (ctx) => {
      return "done";
    });

    expect(wf.id).toBe("test/workflow");
    expect(wf.config.id).toBe("test/workflow");
    expect(typeof wf.handler).toBe("function");
  });

  it("preserves config options", () => {
    const wf = defineWorkflow(
      {
        id: "test/with-options",
        retries: 5,
        backoff: { type: "exponential", delay: 3000 },
        timeout: 120_000,
        priority: 2,
        concurrency: { limit: 1, key: (data: any) => data.gameId },
        rateLimit: { max: 100, duration: 60_000 },
      },
      async (ctx) => {}
    );

    expect(wf.config.retries).toBe(5);
    expect(wf.config.backoff).toEqual({ type: "exponential", delay: 3000 });
    expect(wf.config.timeout).toBe(120_000);
    expect(wf.config.priority).toBe(2);
    expect(wf.config.concurrency?.limit).toBe(1);
    expect(wf.config.rateLimit?.max).toBe(100);
  });

  it("throws if id is missing", () => {
    expect(() =>
      defineWorkflow({ id: "" }, async () => {})
    ).toThrow("Workflow must have an id");
  });

  it("supports typed input via generic", () => {
    const wf = defineWorkflow<{ userId: string }>(
      { id: "typed-workflow" },
      async (ctx) => {
        // ctx.data should be typed as { userId: string }
        const userId: string = ctx.data.userId;
        return { processed: userId };
      }
    );

    expect(wf.id).toBe("typed-workflow");
  });
});
