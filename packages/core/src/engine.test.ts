import { describe, it, expect, afterEach } from "vitest";
import { createEngine, defineWorkflow, FatalError } from "./index";
import type { Engine } from "./engine";

/**
 * Integration tests — require Redis.
 * Set REDIS_URL env var or have Redis on localhost:6379.
 * Skip in CI without Redis by setting SKIP_REDIS_TESTS=1.
 */
const describeWithRedis =
  process.env.SKIP_REDIS_TESTS === "1" ? describe.skip : describe;

function getRedisConnection() {
  const url = process.env.REDIS_URL;
  if (url) return { url };
  return { host: "localhost", port: 6379 };
}

let engineCounter = 0;
function makeEngine(): Engine {
  engineCounter++;
  return createEngine({
    connection: getRedisConnection() as any,
    prefix: `chisel-test-${engineCounter}-${Date.now()}`,
    defaults: {
      retries: 2,
      backoff: { type: "fixed", delay: 100 },
      timeout: 10_000,
      removeOnComplete: { age: 60, count: 100 },
      removeOnFail: { age: 60, count: 100 },
    },
  });
}

describeWithRedis("Engine (integration)", () => {
  const engines: Engine[] = [];

  afterEach(async () => {
    for (const e of engines) {
      try {
        await e.stop();
      } catch {}
    }
    engines.length = 0;
  });

  function track(engine: Engine): Engine {
    engines.push(engine);
    return engine;
  }

  it("runs a simple workflow end-to-end", async () => {
    const engine = track(makeEngine());

    const simpleWorkflow = defineWorkflow<{ name: string }>(
      { id: "test/simple" },
      async (ctx) => {
        const greeting = await ctx.step("greet", async () => {
          return `Hello, ${ctx.data.name}!`;
        });
        return { greeting };
      }
    );

    engine.register(simpleWorkflow);
    await engine.start();

    const { runId } = await engine.trigger(simpleWorkflow, { name: "World" });

    expect(runId).toBeTruthy();
    expect(runId).toMatch(/^run_/);

    await waitForRun(engine, runId, 10_000);

    const run = await engine.getRun(runId);
    expect(run).not.toBeNull();
    expect(run!.status).toBe("completed");
    expect(run!.result).toEqual({ greeting: "Hello, World!" });
  });

  it("runs sequential steps in order", async () => {
    const engine = track(makeEngine());
    const order: string[] = [];

    const wf = defineWorkflow({ id: "test/sequential" }, async (ctx) => {
      await ctx.step("step-1", async () => {
        order.push("step-1");
        return "one";
      });
      await ctx.step("step-2", async () => {
        order.push("step-2");
        return "two";
      });
      await ctx.step("step-3", async () => {
        order.push("step-3");
        return "three";
      });
      return { order: [...order] };
    });

    engine.register(wf);
    await engine.start();

    const { runId } = await engine.trigger(wf, {});
    await waitForRun(engine, runId, 10_000);

    expect(order).toEqual(["step-1", "step-2", "step-3"]);
  });

  it("runs parallel steps concurrently", async () => {
    const engine = track(makeEngine());

    const wf = defineWorkflow({ id: "test/parallel" }, async (ctx) => {
      const [a, b, c] = await ctx.parallel([
        ctx.step("a", async () => "result-a"),
        ctx.step("b", async () => "result-b"),
        ctx.step("c", async () => "result-c"),
      ]);
      return { a, b, c };
    });

    engine.register(wf);
    await engine.start();

    const { runId } = await engine.trigger(wf, {});
    await waitForRun(engine, runId, 10_000);

    const run = await engine.getRun(runId);
    expect(run!.status).toBe("completed");
    expect(run!.result).toEqual({
      a: "result-a",
      b: "result-b",
      c: "result-c",
    });
  });

  it("FatalError fails workflow immediately", async () => {
    const engine = track(makeEngine());

    const wf = defineWorkflow({ id: "test/fatal" }, async (ctx) => {
      await ctx.step("fatal-step", async () => {
        throw new FatalError("Unrecoverable");
      });
    });

    engine.register(wf);
    await engine.start();

    const { runId } = await engine.trigger(wf, {});
    await waitForRun(engine, runId, 10_000);

    const run = await engine.getRun(runId);
    expect(run!.status).toBe("failed");
    expect(run!.error).toContain("Unrecoverable");
  });

  it("triggers one workflow from another via ctx.trigger", async () => {
    const engine = track(makeEngine());

    const childWf = defineWorkflow<{ value: number }>(
      { id: "test/child" },
      async (ctx) => ({ doubled: ctx.data.value * 2 })
    );

    const parentWf = defineWorkflow({ id: "test/parent" }, async (ctx) => {
      const { runId: childRunId } = await ctx.trigger(childWf, { value: 21 });
      return { childRunId };
    });

    engine.register(childWf);
    engine.register(parentWf);
    await engine.start();

    const { runId } = await engine.trigger(parentWf, {});
    await waitForRun(engine, runId, 10_000);

    const run = await engine.getRun(runId);
    expect(run!.status).toBe("completed");
    expect((run!.result as any).childRunId).toMatch(/^run_/);
  });

  it("emits lifecycle events", async () => {
    const engine = track(makeEngine());
    const events: string[] = [];

    engine.on("workflow:start", () => events.push("workflow:start"));
    engine.on("workflow:complete", () => events.push("workflow:complete"));
    engine.on("step:start", () => events.push("step:start"));
    engine.on("step:complete", () => events.push("step:complete"));

    const wf = defineWorkflow({ id: "test/events" }, async (ctx) => {
      await ctx.step("only-step", async () => "done");
      return "ok";
    });

    engine.register(wf);
    await engine.start();

    const { runId } = await engine.trigger(wf, {});
    await waitForRun(engine, runId, 10_000);

    expect(events).toContain("workflow:start");
    expect(events).toContain("workflow:complete");
  });

  it("health check reports connected", async () => {
    const engine = track(makeEngine());
    const wf = defineWorkflow({ id: "test/health" }, async () => "ok");
    engine.register(wf);
    await engine.start();

    const health = await engine.health();
    expect(health.connected).toBe(true);
    expect(health.workers).toBeGreaterThan(0);
  });

  it("deduplication prevents duplicate triggers", async () => {
    const engine = track(makeEngine());
    const wf = defineWorkflow({ id: "test/dedup" }, async () => "done");
    engine.register(wf);
    await engine.start();

    const result1 = await engine.trigger(wf, {}, {
      deduplication: { key: "test-dedup-key", ttl: 5000 },
    });

    const result2 = await engine.trigger(wf, {}, {
      deduplication: { key: "test-dedup-key", ttl: 5000 },
    });

    expect(result2.runId).toBe(result1.runId);
  });

  it("triggerBatch triggers multiple workflows", async () => {
    const engine = track(makeEngine());
    const wf = defineWorkflow<{ n: number }>(
      { id: "test/batch" },
      async (ctx) => ({ n: ctx.data.n })
    );
    engine.register(wf);
    await engine.start();

    const results = await engine.triggerBatch([
      { workflow: wf, data: { n: 1 } },
      { workflow: wf, data: { n: 2 } },
      { workflow: wf, data: { n: 3 } },
    ]);

    expect(results).toHaveLength(3);
    results.forEach((r) => expect(r.runId).toMatch(/^run_/));
  });

  it("FatalError does not retry (single attempt)", async () => {
    const engine = track(makeEngine());
    let attempts = 0;

    const wf = defineWorkflow({ id: "test/fatal-no-retry" }, async (ctx) => {
      await ctx.step("fatal-step", async () => {
        attempts++;
        throw new FatalError("Permanent failure");
      });
    });

    engine.register(wf);
    await engine.start();

    const { runId } = await engine.trigger(wf, {});
    await waitForRun(engine, runId, 10_000);

    // Should only have been called once — no retries
    expect(attempts).toBe(1);

    const run = await engine.getRun(runId);
    expect(run!.status).toBe("failed");
  });

  it("step-level retries work independently of workflow retries", async () => {
    const engine = track(makeEngine());
    let stepAttempts = 0;

    const wf = defineWorkflow({ id: "test/step-retry" }, async (ctx) => {
      const result = await ctx.step(
        "flaky",
        async () => {
          stepAttempts++;
          if (stepAttempts < 3) throw new Error("transient");
          return "ok";
        },
        { retries: 4, backoff: { type: "fixed", delay: 50 } }
      );
      return { result, stepAttempts };
    });

    engine.register(wf);
    await engine.start();

    const { runId } = await engine.trigger(wf, {});
    await waitForRun(engine, runId, 15_000);

    const run = await engine.getRun(runId);
    expect(run!.status).toBe("completed");
    expect(stepAttempts).toBe(3);
  });

  it("emits step:start and step:complete events", async () => {
    const engine = track(makeEngine());
    const stepEvents: string[] = [];

    engine.on("step:start", ({ stepName }) =>
      stepEvents.push(`start:${stepName}`)
    );
    engine.on("step:complete", ({ stepName }) =>
      stepEvents.push(`complete:${stepName}`)
    );

    const wf = defineWorkflow({ id: "test/step-events" }, async (ctx) => {
      await ctx.step("alpha", async () => "a");
      await ctx.step("beta", async () => "b");
      return "done";
    });

    engine.register(wf);
    await engine.start();

    const { runId } = await engine.trigger(wf, {});
    await waitForRun(engine, runId, 10_000);

    expect(stepEvents).toContain("start:alpha");
    expect(stepEvents).toContain("complete:alpha");
    expect(stepEvents).toContain("start:beta");
    expect(stepEvents).toContain("complete:beta");
  });

  it("duplicate step names throw an error", async () => {
    const engine = track(makeEngine());

    const wf = defineWorkflow({ id: "test/dup-steps" }, async (ctx) => {
      await ctx.step("same-name", async () => "first");
      await ctx.step("same-name", async () => "second"); // should throw
    });

    engine.register(wf);
    await engine.start();

    const { runId } = await engine.trigger(wf, {});
    await waitForRun(engine, runId, 10_000);

    const run = await engine.getRun(runId);
    expect(run!.status).toBe("failed");
    expect(run!.error).toContain("Duplicate step name");
  });

  it("registers workflows after engine.start()", async () => {
    const engine = track(makeEngine());
    const wf1 = defineWorkflow({ id: "test/before" }, async () => "before");
    engine.register(wf1);
    await engine.start();

    // Register a second workflow after start
    const wf2 = defineWorkflow<{ x: number }>(
      { id: "test/after" },
      async (ctx) => ({ x: ctx.data.x * 2 })
    );
    engine.register(wf2);

    const { runId } = await engine.trigger(wf2, { x: 5 });
    await waitForRun(engine, runId, 10_000);

    const run = await engine.getRun(runId);
    expect(run!.status).toBe("completed");
    expect(run!.result).toEqual({ x: 10 });
  });
});

async function waitForRun(
  engine: Engine,
  runId: string,
  timeoutMs: number
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const run = await engine.getRun(runId);
    if (
      run &&
      (run.status === "completed" ||
        run.status === "failed" ||
        run.status === "cancelled")
    ) {
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}
