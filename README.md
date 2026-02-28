# Chisel

Lightweight workflow engine built on [BullMQ](https://docs.bullmq.io/) and Redis.

Chisel gives you an Inngest-shaped developer experience — `defineWorkflow`, `ctx.step()`, checkpoint-and-resume — with zero magic. No build plugins, no code transforms, no directives. Works anywhere JavaScript runs.

## Features

- **Durable steps** — each step checkpoints its result to Redis. On failure, the workflow resumes from the last successful step.
- **Step & workflow retries** — configurable retry counts and backoff (exponential or fixed) at both the step and workflow level.
- **Parallel execution** — run steps concurrently with `ctx.parallel()`. All steps complete before errors propagate (no zombie steps).
- **Sleep & delays** — `ctx.sleep("5m")` pauses the workflow using BullMQ delayed jobs for long durations.
- **Workflow triggers** — trigger child workflows from within a workflow via `ctx.trigger()`.
- **Input validation** — optional Zod schema validation on workflow input (Zod is not a dependency).
- **Keyed concurrency** — per-key concurrency limits via Redis locks.
- **Deduplication** — prevent duplicate triggers with configurable TTL.
- **Lifecycle events** — subscribe to `workflow:start`, `workflow:complete`, `step:fail`, etc.
- **Middleware** — `beforeStep` / `afterStep` / `beforeWorkflow` hooks.
- **Hono adapter** — optional REST API adapter for trigger, status, cancel, retry, and health.
- **Typed end-to-end** — full TypeScript generics from `defineWorkflow<TInput>` to `ctx.data`.

## Install

```bash
npm install chisel-engine
# or
pnpm add chisel-engine
# or
bun add chisel-engine
```

Redis must be available. BullMQ and ioredis are bundled dependencies.

## Quick Start

```ts
import { createEngine, defineWorkflow } from "chisel-engine";

// 1. Define a workflow
const onboardUser = defineWorkflow<{ userId: string }>(
  {
    id: "user/onboard",
    retries: 3,
    backoff: { type: "exponential", delay: 1000 },
  },
  async (ctx) => {
    const user = await ctx.step("fetch-user", async () => {
      return db.users.findById(ctx.data.userId);
    });

    await ctx.step("send-welcome-email", async () => {
      await email.send({ to: user.email, template: "welcome" });
    });

    await ctx.step("provision-account", async () => {
      await billing.createAccount(user.id);
    });

    return { onboarded: true };
  }
);

// 2. Create and start the engine
const engine = createEngine({
  connection: { host: "localhost", port: 6379 },
});

engine.register(onboardUser);
await engine.start();

// 3. Trigger a run
const { runId } = await engine.trigger(onboardUser, { userId: "usr_123" });
```

## Parallel Steps

Run steps concurrently with `ctx.parallel()`. All steps finish before any error is thrown.

```ts
const processOrder = defineWorkflow<{ orderId: string }>(
  { id: "order/process" },
  async (ctx) => {
    const [inventory, payment] = await ctx.parallel([
      ctx.step("check-inventory", () => inventory.check(ctx.data.orderId)),
      ctx.step("authorize-payment", () => payments.authorize(ctx.data.orderId)),
    ]);

    await ctx.step("fulfill", () => fulfillment.ship(ctx.data.orderId));
  }
);
```

## Sleep

Pause a workflow. Short sleeps use an in-process timer; long sleeps (>5s) use BullMQ delayed jobs so no worker is blocked.

```ts
await ctx.step("send-reminder", async () => {
  await email.sendReminder(userId);
});

await ctx.sleep("24h"); // workflow pauses, worker is freed

await ctx.step("check-response", async () => {
  // resumes here after 24 hours
});
```

## Trigger Child Workflows

```ts
const parent = defineWorkflow({ id: "parent" }, async (ctx) => {
  const { runId } = await ctx.trigger(childWorkflow, { key: "value" });
});
```

## Step Options

Each step can override retry and timeout settings:

```ts
await ctx.step(
  "call-external-api",
  async () => {
    return fetch("https://api.example.com/data").then((r) => r.json());
  },
  {
    retries: 5,
    backoff: { type: "exponential", delay: 2000 },
    timeout: 30_000,
  }
);
```

## Input Validation

Pass a Zod schema (or any object with `.parse()`) to validate input at trigger time:

```ts
import { z } from "zod";

const workflow = defineWorkflow(
  {
    id: "validated",
    input: z.object({ email: z.string().email() }),
  },
  async (ctx) => {
    // ctx.data is typed and validated
  }
);
```

## Error Handling

```ts
import { FatalError } from "chisel-engine";

await ctx.step("check-permissions", async () => {
  if (!hasAccess) {
    // Immediately fails the workflow — no retries
    throw new FatalError("User lacks required permissions");
  }
});
```

## Lifecycle Events

```ts
engine.on("workflow:complete", ({ workflowId, runId, result, duration }) => {
  console.log(`${workflowId} completed in ${duration}ms`);
});

engine.on("step:fail", ({ workflowId, stepName, error, attempt }) => {
  metrics.increment("step.failure", { workflowId, stepName });
});
```

Available events: `workflow:start`, `workflow:complete`, `workflow:fail`, `step:start`, `step:complete`, `step:fail`, `step:retry`.

## Run Status

```ts
const run = await engine.getRun(runId);
// { id, workflowId, status, data, result, steps, progress: { completed, total, percentage } }

await engine.cancelRun(runId);
await engine.retryRun(runId);
```

## Hono REST Adapter

```ts
import { Hono } from "hono";
import { chiselHono } from "chisel-engine/hono";

const app = new Hono();
app.route("/workflows", chiselHono(engine));
```

Endpoints:
- `POST /:workflowId` — trigger a workflow
- `GET /runs/:runId` — get run status
- `GET /runs/:runId/steps` — get step details
- `POST /runs/:runId/cancel` — cancel a run
- `POST /runs/:runId/retry` — retry a failed run
- `GET /health` — health check

## Configuration

```ts
const engine = createEngine({
  // Redis connection
  connection: { host: "localhost", port: 6379 },
  // or: connection: { url: "redis://..." },

  // Defaults applied to all workflows
  defaults: {
    retries: 3,
    backoff: { type: "exponential", delay: 2000 },
    timeout: 60_000,
  },

  // Redis key prefix (default: "chisel")
  prefix: "myapp",

  // Custom logger (default: console)
  logger: pino(),

  // Global middleware
  middleware: {
    beforeStep: ({ workflowId, stepName }) => { /* ... */ },
    afterStep: ({ stepName, result, duration }) => { /* ... */ },
  },
});
```

## Workflow Options

```ts
defineWorkflow({
  id: "my/workflow",
  retries: 5,                                    // workflow-level retries
  backoff: { type: "exponential", delay: 1000 }, // backoff strategy
  timeout: 120_000,                              // workflow timeout (ms)
  priority: 1,                                   // lower = higher priority
  concurrency: {
    limit: 1,
    key: (data) => data.tenantId,                // keyed concurrency
  },
  input: zodSchema,                              // optional input validation
});
```

## License

MIT
