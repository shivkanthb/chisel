import { serve } from "@hono/node-server";
import type { Engine } from "chisel-engine";
import { createStudioApp } from "./server";
import type { StudioOptions, StudioServer } from "./types";

export type { StudioOptions, StudioServer } from "./types";

export function createStudio(
  engine: Engine,
  options: StudioOptions = {}
): StudioServer {
  const port = options.port ?? 4040;
  const host = options.host ?? "localhost";
  const url = `http://${host}:${port}`;

  const app = createStudioApp(engine);
  let server: ReturnType<typeof serve> | null = null;

  return {
    get url() {
      return url;
    },

    async start() {
      server = serve({ fetch: app.fetch, port, hostname: host });

      console.log(`Chisel Studio running at ${url}`);

      if (options.open) {
        const { exec } = await import("child_process");
        const cmd =
          process.platform === "darwin"
            ? "open"
            : process.platform === "win32"
              ? "start"
              : "xdg-open";
        exec(`${cmd} ${url}`);
      }
    },

    async stop() {
      if (server) {
        server.close();
        server = null;
      }
    },
  };
}
