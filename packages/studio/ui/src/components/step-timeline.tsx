import {
  CheckCircle2,
  Circle,
  XCircle,
  Loader2,
  RotateCcw,
  Minus,
  Moon,
} from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import { JsonViewer } from "./json-viewer";
import type { StepInfo } from "@/lib/api";

const stepIcons: Record<string, { icon: typeof Circle; color: string }> = {
  pending: { icon: Circle, color: "text-muted-foreground" },
  running: { icon: Loader2, color: "text-blue-500" },
  completed: { icon: CheckCircle2, color: "text-emerald-500" },
  failed: { icon: XCircle, color: "text-red-500" },
  retrying: { icon: RotateCcw, color: "text-orange-500" },
  skipped: { icon: Minus, color: "text-muted-foreground" },
  sleep: { icon: Moon, color: "text-purple-500" },
};

interface StepTimelineProps {
  steps: StepInfo[];
  className?: string;
}

export function StepTimeline({ steps, className }: StepTimelineProps) {
  if (steps.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">No steps executed yet.</p>
    );
  }

  return (
    <div className={cn("space-y-0", className)}>
      {steps.map((step, index) => {
        const { icon: Icon, color } =
          stepIcons[step.status] || stepIcons.pending;
        const isLast = index === steps.length - 1;
        const isRunning = step.status === "running";

        return (
          <div key={step.name} className="flex gap-3">
            {/* Timeline line + icon */}
            <div className="flex flex-col items-center">
              <div className={cn("mt-0.5", color)}>
                <Icon
                  className={cn("h-4 w-4", isRunning && "animate-spin")}
                />
              </div>
              {!isLast && (
                <div className="w-px flex-1 bg-border min-h-[24px]" />
              )}
            </div>

            {/* Step content */}
            <div className={cn("pb-4 flex-1 min-w-0", isLast && "pb-0")}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[13px] font-medium truncate">
                  {step.name}
                </span>
                <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {step.status === "running"
                    ? "running..."
                    : formatDuration(step.duration)}
                </span>
              </div>

              {step.attempts != null && step.attempts > 1 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Attempt {step.attempts}
                </p>
              )}

              {step.error && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  Error: {step.error}
                </p>
              )}

              {step.status === "completed" && step.result !== undefined && (
                <div className="mt-1">
                  <JsonViewer data={step.result} collapsed />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
