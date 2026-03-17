import { useNavigate } from "react-router-dom";
import { StatusBadge } from "./status-badge";
import { cn, formatDuration } from "@/lib/utils";
import type { EngineEvent } from "@/lib/sse";

interface ActivityFeedProps {
  events: EngineEvent[];
  className?: string;
}

function eventLabel(event: EngineEvent): string {
  switch (event.type) {
    case "workflow:start":
      return "started";
    case "workflow:complete":
      return "completed";
    case "workflow:fail":
      return "failed";
    case "step:start":
      return `step:${event.data.stepName}`;
    case "step:complete":
      return `step:${event.data.stepName}`;
    case "step:fail":
      return `step:${event.data.stepName} failed`;
    case "step:retry":
      return `step:${event.data.stepName} retry`;
    default:
      return event.type;
  }
}

function eventStatus(event: EngineEvent): string {
  if (event.type.includes("complete")) return "completed";
  if (event.type.includes("fail")) return "failed";
  if (event.type.includes("start")) return "running";
  if (event.type.includes("retry")) return "retrying";
  return "queued";
}

export function ActivityFeed({ events, className }: ActivityFeedProps) {
  const navigate = useNavigate();

  if (events.length === 0) {
    return (
      <p className={cn("text-xs text-muted-foreground py-3", className)}>
        No activity yet. Events will appear here in real-time.
      </p>
    );
  }

  return (
    <div className={cn("space-y-0.5", className)}>
      {events.map((event, i) => (
        <div
          key={`${event.receivedAt}-${i}`}
          className="flex items-center gap-2.5 py-1.5 px-2.5 rounded-md hover:bg-accent/40 cursor-pointer text-xs transition-colors duration-150 animate-slide-in"
          onClick={() => {
            if (event.data.runId) {
              const wfId = event.data.workflowId
                ? `/workflows/${encodeURIComponent(String(event.data.workflowId))}/runs/${event.data.runId}`
                : `/runs/${event.data.runId}`;
              navigate(wfId);
            }
          }}
        >
          <span className="font-mono text-muted-foreground w-14 shrink-0">
            {new Date(event.receivedAt).toLocaleTimeString()}
          </span>
          <StatusBadge status={eventStatus(event)} className="text-[10px] px-1.5 py-0" />
          <span className="font-mono text-muted-foreground truncate">
            {String(event.data.workflowId || "")}
          </span>
          <span className="text-foreground truncate">{eventLabel(event)}</span>
          {event.data.duration != null && (
            <span className="font-mono text-muted-foreground ml-auto whitespace-nowrap">
              {formatDuration(event.data.duration as number)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
