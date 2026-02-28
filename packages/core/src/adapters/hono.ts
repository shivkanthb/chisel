import { Hono } from "hono";
import type { Engine } from "../engine";

/**
 * Creates a Hono router for the workflow engine.
 *
 * @example
 * ```ts
 * import { Hono } from "hono";
 * import { chiselHono } from "@chisel/core/hono";
 *
 * const app = new Hono();
 * app.route("/workflows", chiselHono(engine));
 * ```
 */
export function chiselHono(engine: Engine): Hono {
  const app = new Hono();

  // Trigger a workflow
  app.post("/:workflowId", async (c) => {
    const workflowId = c.req.param("workflowId");
    const body = await c.req.json();

    try {
      const { runId } = await engine.trigger(workflowId, body);
      return c.json({ runId }, 202);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        400
      );
    }
  });

  // Get run status
  app.get("/runs/:runId", async (c) => {
    const runId = c.req.param("runId");
    const run = await engine.getRun(runId);

    if (!run) {
      return c.json({ error: "Run not found" }, 404);
    }

    return c.json(run);
  });

  // Get run steps
  app.get("/runs/:runId/steps", async (c) => {
    const runId = c.req.param("runId");
    const run = await engine.getRun(runId);

    if (!run) {
      return c.json({ error: "Run not found" }, 404);
    }

    return c.json(run.steps);
  });

  // Cancel a run
  app.post("/runs/:runId/cancel", async (c) => {
    const runId = c.req.param("runId");

    try {
      await engine.cancelRun(runId);
      return c.json({ success: true });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        400
      );
    }
  });

  // Retry a failed run
  app.post("/runs/:runId/retry", async (c) => {
    const runId = c.req.param("runId");

    try {
      await engine.retryRun(runId);
      return c.json({ success: true });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        400
      );
    }
  });

  // Health check
  app.get("/health", async (c) => {
    const health = await engine.health();
    const status = health.connected ? 200 : 503;
    return c.json(health, status);
  });

  return app;
}
