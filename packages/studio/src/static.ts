import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import type { Context } from "hono";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export function createStaticHandler(uiDir: string) {
  // Pre-load index.html into memory (small file, hot path)
  const indexPath = join(uiDir, "index.html");
  let indexHtml = "";
  if (existsSync(indexPath)) {
    indexHtml = readFileSync(indexPath, "utf-8");
  }

  return async (c: Context) => {
    const reqPath = new URL(c.req.url).pathname;

    // Try serving static asset
    const filePath = join(uiDir, reqPath);
    if (existsSync(filePath) && reqPath !== "/") {
      try {
        const content = readFileSync(filePath);
        const ext = extname(filePath);
        const contentType = MIME_TYPES[ext] || "application/octet-stream";
        return new Response(content, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      } catch {
        // Fall through to index.html
      }
    }

    // SPA fallback: serve index.html for all non-file routes
    if (!indexHtml) {
      return c.text("Studio UI not built. Run: bun run build:ui", 500);
    }
    return c.html(indexHtml);
  };
}
