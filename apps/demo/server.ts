/**
 * Chisel Studio demo server — deployable to Railway or any host.
 *
 * Env vars:
 *   REDIS_URL                 — required (on Railway, use the private
 *                               redis.railway.internal host; family=0 auto-added)
 *   STUDIO_PORT               — server port (default: 4040)
 *   DEMO_TRIGGER_INTERVAL_MS  — ms between demo runs (default: 45000)
 *   DEMO_FLUSH_ON_START       — "1" wipes the demo's Redis namespace on boot
 */
import { createEngine, defineWorkflow, FatalError } from "chisel-engine";
import { createStudio } from "chisel-studio";

if (!process.env.REDIS_URL) {
  console.error("REDIS_URL is required");
  process.exit(1);
}

const port = Number(process.env.STUDIO_PORT) || 4040;
const PREFIX = "chisel-studio-demo";
const triggerIntervalMs = Number(process.env.DEMO_TRIGGER_INTERVAL_MS) || 45_000;

// Railway's private host is IPv6-only; ioredis needs family=0 to resolve it.
function normalizeRedisUrl(url: string): string {
  if (url.includes(".railway.internal") && !/[?&]family=/.test(url)) {
    return url + (url.includes("?") ? "&" : "?") + "family=0";
  }
  return url;
}

const redisUrl = normalizeRedisUrl(process.env.REDIS_URL);
const connection = { url: redisUrl };

// Opt-in: wipe the demo's Redis namespace on boot (DEMO_FLUSH_ON_START=1).
if (process.env.DEMO_FLUSH_ON_START === "1") {
  const { default: Redis } = await import("ioredis");
  const redis = new Redis(redisUrl);
  let cursor = "0";
  let deleted = 0;
  do {
    const [next, keys] = await redis.scan(
      cursor, "MATCH", `${PREFIX}:*`, "COUNT", 500
    );
    cursor = next;
    if (keys.length) {
      deleted += keys.length;
      await redis.del(...keys);
    }
  } while (cursor !== "0");
  await redis.quit();
  console.log(`Flushed ${deleted} demo keys (${PREFIX}:*) from Redis`);
}

const engine = createEngine({
  connection: connection as any,
  prefix: PREFIX,
  defaults: {
    retries: 3,
    backoff: { type: "exponential", delay: 1000 },
    timeout: 30_000,
    // Demo-sized caps so Redis stays bounded.
    removeOnComplete: { age: 1800, count: 50 },
    removeOnFail: { age: 3600, count: 50 },
  },
  retention: {
    completed: { age: 1800, count: 30 },
    failed: { age: 3600, count: 30 },
    cancelled: { age: 1800, count: 30 },
  },
});

// ─── Workflow 1: Send Email ───────────────────────────────────────────────────

const sendEmail = defineWorkflow<{ to: string; subject: string }>(
  {
    id: "send-email",
    concurrency: { limit: 5 },
    retries: 3,
    timeout: 15_000,
  },
  async (ctx) => {
    const validated = await ctx.step("validate-input", async () => {
      await sleep(200);
      if (!ctx.data.to.includes("@")) throw new Error("Invalid email");
      return { valid: true, recipient: ctx.data.to };
    });

    const template = await ctx.step("fetch-template", async () => {
      await sleep(300);
      return {
        html: `<h1>${ctx.data.subject}</h1><p>Hello ${ctx.data.to}!</p>`,
        plain: `${ctx.data.subject}\n\nHello ${ctx.data.to}!`,
      };
    });

    const sent = await ctx.step("send-smtp", async () => {
      await sleep(500);
      return {
        messageId: `msg_${Math.random().toString(36).slice(2, 10)}`,
        timestamp: Date.now(),
      };
    });

    await ctx.step("log-delivery", async () => {
      await sleep(100);
      return { logged: true };
    });

    return { ...sent, recipient: validated.recipient };
  }
);

// ─── Workflow 2: Process PDF ─────────────────────────────────────────────────

const processPdf = defineWorkflow<{ url: string; pages?: number }>(
  {
    id: "process-pdf",
    concurrency: { limit: 3 },
    retries: 5,
    timeout: 60_000,
    rateLimit: { max: 10, duration: 60_000 },
  },
  async (ctx) => {
    const downloaded = await ctx.step("download-file", async () => {
      await sleep(800);
      return { size: 1_240_000, format: "pdf" };
    });

    const extracted = await ctx.step("extract-text", async () => {
      await sleep(1200);
      return {
        pages: ctx.data.pages ?? 12,
        wordCount: 3420,
        language: "en",
      };
    });

    const indexed = await ctx.step("index-content", async () => {
      await sleep(400);
      return { indexed: true, chunks: 8 };
    });

    return {
      url: ctx.data.url,
      ...downloaded,
      ...extracted,
      ...indexed,
    };
  }
);

// ─── Workflow 3: Sync Users (sometimes fails) ────────────────────────────────

let syncAttempt = 0;
const syncUsers = defineWorkflow<{ source: string }>(
  {
    id: "sync-users",
    concurrency: { limit: 1 },
    retries: 2,
    timeout: 20_000,
  },
  async (ctx) => {
    await ctx.step("fetch-remote-users", async () => {
      await sleep(600);
      return { count: 42 };
    });

    await ctx.step("diff-local-state", async () => {
      await sleep(300);
      syncAttempt++;
      if (syncAttempt % 3 === 0) {
        throw new FatalError(
          `Connection to ${ctx.data.source} refused: ECONNREFUSED`
        );
      }
      return { added: 3, updated: 7, removed: 1 };
    });

    await ctx.step("apply-changes", async () => {
      await sleep(400);
      return { applied: true };
    });

    return { synced: true, source: ctx.data.source };
  }
);

// ─── Workflow 4: Generate Report ─────────────────────────────────────────────

const generateReport = defineWorkflow<{ type: string; dateRange: string }>(
  {
    id: "generate-report",
    concurrency: { limit: 2 },
    retries: 1,
    timeout: 45_000,
  },
  async (ctx) => {
    const data = await ctx.step("query-database", async () => {
      await sleep(1000);
      return { rows: 1580, tables: ["users", "orders", "events"] };
    });

    const aggregated = await ctx.step("aggregate-metrics", async () => {
      await sleep(700);
      return {
        totalRevenue: 48200,
        activeUsers: 892,
        conversionRate: 0.032,
      };
    });

    const rendered = await ctx.step("render-pdf", async () => {
      await sleep(900);
      return {
        url: `/reports/${ctx.data.type}-${Date.now()}.pdf`,
        pages: 8,
      };
    });

    await ctx.step("send-notification", async () => {
      await sleep(200);
      return { notified: true };
    });

    return { report: rendered, metrics: aggregated };
  }
);

// ─── Workflow 5: Drip Campaign (demonstrates ctx.sleep) ─────────────────────

const dripCampaign = defineWorkflow<{ email: string; campaignId: string }>(
  {
    id: "drip-campaign",
    concurrency: { limit: 10 },
    retries: 2,
    timeout: 300_000,
  },
  async (ctx) => {
    await ctx.step("send-welcome-email", async () => {
      await sleep(300);
      return { sent: true, template: "welcome" };
    });

    // Wait before sending the next email
    await ctx.sleep("10s");

    await ctx.step("send-tips-email", async () => {
      await sleep(300);
      return { sent: true, template: "tips-and-tricks" };
    });

    // Wait before the final email
    await ctx.sleep("15s");

    const engagement = await ctx.step("check-engagement", async () => {
      await sleep(200);
      const opened = Math.random() > 0.3;
      return { opened, clicks: opened ? Math.floor(Math.random() * 5) : 0 };
    });

    await ctx.step("send-final-email", async () => {
      await sleep(300);
      const template = engagement.opened ? "upsell" : "re-engage";
      return { sent: true, template };
    });

    return {
      email: ctx.data.email,
      campaignId: ctx.data.campaignId,
      engagement,
    };
  }
);

// ─── Register and start ──────────────────────────────────────────────────────

engine.register(sendEmail);
engine.register(processPdf);
engine.register(syncUsers);
engine.register(generateReport);
engine.register(dripCampaign);

await engine.start();

// ─── Start Studio ────────────────────────────────────────────────────────────

const studio = createStudio(engine, { port, host: "0.0.0.0", readOnly: true });
await studio.start();

// ─── Seed demo data ──────────────────────────────────────────────────────────

console.log("\nSeeding demo data...\n");

for (const [to, subject] of [
  ["alice@example.com", "Welcome to Chisel!"],
  ["bob@acme.co", "Your invoice is ready"],
  ["carol@test.org", "Weekly digest"],
] as const) {
  await engine.trigger(sendEmail, { to, subject });
}

await engine.trigger(processPdf, { url: "https://example.com/report-q4.pdf", pages: 24 });
await engine.trigger(processPdf, { url: "https://example.com/manual.pdf" });

await engine.trigger(syncUsers, { source: "ldap://corp.example.com" });
await engine.trigger(syncUsers, { source: "https://api.okta.com/users" });
await engine.trigger(syncUsers, { source: "ldap://backup.example.com" });

await engine.trigger(generateReport, {
  type: "monthly",
  dateRange: "2026-02-01/2026-02-28",
});
await engine.trigger(generateReport, {
  type: "weekly",
  dateRange: "2026-02-24/2026-03-02",
});

await engine.trigger(dripCampaign, {
  email: "newuser@example.com",
  campaignId: "onboarding-q1",
});

console.log("Demo data seeded! Triggered 11 workflow runs.\n");
console.log(`Studio running at ${studio.url}\n`);
console.log(
  `Trickling a new run every ${Math.round(triggerIntervalMs / 1000)}s\n`
);

// Continuously trigger new runs (slow trickle).
setInterval(async () => {
  const workflows = [
    () =>
      engine.trigger(sendEmail, {
        to: `user${Math.floor(Math.random() * 100)}@example.com`,
        subject: "Periodic test email",
      }),
    () =>
      engine.trigger(processPdf, {
        url: `https://example.com/doc-${Date.now()}.pdf`,
      }),
    () =>
      engine.trigger(syncUsers, { source: "https://api.okta.com/users" }),
    () =>
      engine.trigger(dripCampaign, {
        email: `lead${Math.floor(Math.random() * 100)}@example.com`,
        campaignId: "nurture",
      }),
  ];

  const random = workflows[Math.floor(Math.random() * workflows.length)];
  await random();
}, triggerIntervalMs);

// Graceful shutdown
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    console.log("\nShutting down...");
    await studio.stop();
    await engine.stop();
    process.exit(0);
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
