import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
    env: {
      ...loadEnv(),
    },
  },
});

function loadEnv(): Record<string, string> {
  try {
    const fs = require("fs");
    const path = require("path");
    const envPath = path.resolve(__dirname, "../../.env.local");
    const content = fs.readFileSync(envPath, "utf-8");
    const env: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...rest] = trimmed.split("=");
      env[key] = rest.join("=");
    }
    return env;
  } catch {
    return {};
  }
}
