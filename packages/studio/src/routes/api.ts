import { Hono } from "hono";
import type { Engine } from "chisel-engine";
import type { RunStatus } from "chisel-engine";

export function createApiRoutes(engine: Engine): Hono {
  const app = new Hono();

  // Health check
  app.get("/health", async (c) => {
    const health = await engine.health();
    return c.json(health, health.connected ? 200 : 503);
  });

  // List registered workflows
  app.get("/workflows", (c) => {
    return c.json(engine.listWorkflows());
  });

  // List runs for a workflow
  app.get("/workflows/:id/runs", async (c) => {
    const id = c.req.param("id");
    const query = c.req.query();

    const result = await engine.listRuns(id, {
      limit: query.limit ? Number(query.limit) : undefined,
      cursor: query.cursor ? Number(query.cursor) : undefined,
      order: query.order as "asc" | "desc" | undefined,
      status: query.status as RunStatus | undefined,
    });

    return c.json(result);
  });

  // Get run detail
  app.get("/runs/:runId", async (c) => {
    const runId = c.req.param("runId");
    const run = await engine.getRun(runId);

    if (!run) {
      return c.json({ error: "Run not found" }, 404);
    }

    return c.json(run);
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

  // Trigger a workflow
  app.post("/workflows/:id/trigger", async (c) => {
    const id = c.req.param("id");

    try {
      const body = await c.req.json();
      const { runId } = await engine.trigger(id, body);
      return c.json({ runId }, 202);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        400
      );
    }
  });

  return app;
}
