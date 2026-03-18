const ENGINE_EVENTS = [
  "workflow:start",
  "workflow:complete",
  "workflow:fail",
  "step:start",
  "step:complete",
  "step:fail",
  "step:retry",
] as const;

export type EngineEventType = (typeof ENGINE_EVENTS)[number];

export interface EngineEvent {
  type: EngineEventType;
  data: Record<string, unknown>;
  receivedAt: number;
}

export function connectSSE(
  onEvent: (event: EngineEvent) => void
): () => void {
  const source = new EventSource("/api/events");

  for (const event of ENGINE_EVENTS) {
    source.addEventListener(event, (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        onEvent({ type: event, data, receivedAt: Date.now() });
      } catch {
        // Ignore malformed events
      }
    });
  }

  source.onerror = () => {
    // EventSource auto-reconnects
  };

  return () => source.close();
}
