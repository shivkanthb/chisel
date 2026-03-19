# chisel-studio

Embedded dev UI for the [Chisel](https://github.com/shivkanthb/chisel) workflow engine. A real-time dashboard for monitoring and managing your workflows — no setup, no external services.

## Features

- **Real-time activity feed** — live SSE stream of workflow and step events
- **Step trace visualization** — see step durations, status, and execution order
- **Workflow management** — trigger, retry, and cancel runs from the UI
- **Run details** — inspect input data, step results, errors, and progress
- **Light & dark mode** — system preference detection with manual toggle

## Install

```bash
npm install chisel-studio
# or
pnpm add chisel-studio
# or
bun add chisel-studio
```

`chisel-engine` is a peer dependency. `hono` is included as a direct dependency and will be installed automatically.

## Usage

```ts
import { createEngine } from "chisel-engine";
import { createStudio } from "chisel-studio";

const engine = createEngine({
  connection: { host: "localhost", port: 6379 },
});

// ... register workflows, start engine ...

const studio = createStudio(engine, { port: 4040 });
await studio.start();
// → Chisel Studio running at http://localhost:4040
```

## Options

```ts
createStudio(engine, {
  port: 4040,        // default: 4040
  host: "localhost",  // default: "localhost"
  open: true,         // auto-open in browser (default: false)
});
```

## API

`createStudio()` returns a `StudioServer` object:

```ts
const studio = createStudio(engine, options);

studio.url;            // "http://localhost:4040"
await studio.start();  // start the server
await studio.stop();   // stop the server
```

## REST Endpoints

The studio server exposes these API endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Engine health status |
| `GET` | `/api/workflows` | List registered workflows |
| `GET` | `/api/workflows/:id/runs` | List runs (supports `limit`, `cursor`, `status` params) |
| `GET` | `/api/runs/:runId` | Get run details with step breakdown |
| `POST` | `/api/workflows/:id/trigger` | Trigger a new run |
| `POST` | `/api/runs/:runId/cancel` | Cancel a running workflow |
| `POST` | `/api/runs/:runId/retry` | Retry a failed run |
| `GET` | `/api/events` | SSE stream of real-time events |

## License

MIT
