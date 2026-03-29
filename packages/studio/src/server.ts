import { Hono } from "hono";
import { cors } from "hono/cors";
import { join, dirname } from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import type { Engine } from "chisel-engine";
import { createApiRoutes } from "./routes/api";
import { createSseRoute } from "./routes/sse";
import { createStaticHandler } from "./static";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

export function createStudioApp(
  engine: Engine,
  options?: { readOnly?: boolean }
): Hono {
  const readOnly = options?.readOnly ?? false;
  const app = new Hono();

  app.onError((err, c) => {
    console.error(`[studio] ${c.req.method} ${c.req.path} error:`, err);
    return c.json({ error: err.message }, 500);
  });

  // Enable CORS for development
  app.use("*", cors());

  // Config endpoint
  app.get("/api/config", (c) => c.json({ readOnly }));

  // Block mutations in read-only mode
  if (readOnly) {
    app.use("/api/*", async (c, next) => {
      if (c.req.method === "POST") {
        return c.json({ error: "Studio is in read-only mode" }, 403);
      }
      await next();
    });
  }

  // API routes
  app.route("/api", createApiRoutes(engine));

  // SSE events
  app.route("/api", createSseRoute(engine));

  // Static SPA assets
  app.get("*", createStaticHandler(resolveUiDir()));

  return app;
}
