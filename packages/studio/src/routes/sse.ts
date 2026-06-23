import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Engine, EngineEventName } from "chisel-engine";

const ENGINE_EVENTS: EngineEventName[] = [
  "workflow:start",
  "workflow:complete",
  "workflow:fail",
  "step:start",
  "step:complete",
  "step:fail",
  "step:retry",
];

const MAX_BUFFERED_EVENTS = 200;

interface BufferedEvent {
  type: string;
  data: unknown;
  receivedAt: number;
}

export function createSseRoute(engine: Engine): Hono {
  const app = new Hono();

  // In-memory circular buffer of recent events
  const eventBuffer: BufferedEvent[] = [];

  function bufferEvent(type: string, payload: unknown) {
    eventBuffer.unshift({ type, data: payload, receivedAt: Date.now() });
    if (eventBuffer.length > MAX_BUFFERED_EVENTS) {
      eventBuffer.length = MAX_BUFFERED_EVENTS;
    }
  }

  // Subscribe to engine events for buffering (once, shared across all SSE clients)
  for (const event of ENGINE_EVENTS) {
    engine.on(event, ((payload: unknown) => {
      bufferEvent(event, JSON.parse(JSON.stringify(payload, (_key, value) =>
        value instanceof Error
          ? { message: value.message, name: value.name }
          : value
      )));
    }) as any);
  }

  // Return recent buffered events
  app.get("/events/recent", (c) => {
    return c.json(eventBuffer);
  });

  app.get("/events", (c) => {
    return streamSSE(c, async (stream) => {
      const handlers = new Map<string, (payload: unknown) => void>();

      for (const event of ENGINE_EVENTS) {
        const handler = (payload: unknown) => {
          stream
            .writeSSE({
              event,
              data: JSON.stringify(payload, (_key, value) =>
                value instanceof Error
                  ? { message: value.message, name: value.name }
                  : value
              ),
            })
            .catch(() => {});
        };
        handlers.set(event, handler);
        engine.on(event, handler as any);
      }

      // Heartbeat every 15 seconds
      const heartbeat = setInterval(() => {
        stream
          .writeSSE({
            event: "heartbeat",
            data: JSON.stringify({ time: Date.now() }),
          })
          .catch(() => {});
      }, 15_000);

      // Wait for disconnect via onAbort so the finally runs and unsubscribes.
      // A `while (true) { await stream.sleep() }` loop never exits on abort and
      // leaks the handlers + heartbeat on every reconnect.
      try {
        await new Promise<void>((resolve) => {
          if (stream.aborted) resolve();
          else stream.onAbort(() => resolve());
        });
      } finally {
        clearInterval(heartbeat);
        for (const [event, handler] of handlers) {
          engine.off(event as EngineEventName, handler as any);
        }
      }
    });
  });

  return app;
}
