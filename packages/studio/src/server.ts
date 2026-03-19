import { Hono } from "hono";
import { cors } from "hono/cors";
import { join } from "path";
import { existsSync } from "fs";
import type { Engine } from "chisel-engine";
import { createApiRoutes } from "./routes/api";
import { createSseRoute } from "./routes/sse";
import { createStaticHandler } from "./static";

function resolveUiDir(): string {
  // When running from built output: __dirname is dist/, ui is dist/ui/
  const fromDist = join(__dirname, "ui");
  if (existsSync(join(fromDist, "index.html"))) return fromDist;

  // When running from source via bun/tsx: __dirname is src/, ui is ../dist/ui/
  const fromSrc = join(__dirname, "..", "dist", "ui");
  if (existsSync(join(fromSrc, "index.html"))) return fromSrc;

  // Fallback
  return fromDist;
}

export function createStudioApp(engine: Engine): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    console.error(`[studio] ${c.req.method} ${c.req.path} error:`, err);
    return c.json({ error: err.message }, 500);
  });

  // Enable CORS for development
  app.use("*", cors());

  // API routes
  app.route("/api", createApiRoutes(engine));

  // SSE events
  app.route("/api", createSseRoute(engine));

  // Static SPA assets
  app.get("*", createStaticHandler(resolveUiDir()));

  return app;
}
