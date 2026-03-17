import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  XCircle,
  Loader2,
  RotateCcw,
  Minus,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import { JsonViewer } from "./json-viewer";
import { Button } from "./ui/button";
import type { StepInfo } from "@/lib/api";

const statusConfig: Record<
  string,
  { icon: typeof Circle; color: string; barColor: string }
> = {
  pending: {
    icon: Circle,
    color: "text-muted-foreground",
    barColor: "bg-muted-foreground/20",
  },
  running: {
    icon: Loader2,
    color: "text-blue-400",
    barColor: "bg-blue-500/60",
  },
  completed: {
    icon: CheckCircle2,
    color: "text-emerald-400",
    barColor: "bg-emerald-500/60",
  },
  failed: {
    icon: XCircle,
    color: "text-red-400",
    barColor: "bg-red-500/60",
  },
  retrying: {
    icon: RotateCcw,
    color: "text-orange-400",
    barColor: "bg-orange-500/60",
  },
  skipped: {
    icon: Minus,
    color: "text-muted-foreground",
    barColor: "bg-muted-foreground/20",
  },
};

interface StepTraceProps {
  steps: StepInfo[];
  totalDuration?: number;
  className?: string;
  onRetryRun?: () => void;
}

export function StepTrace({ steps, totalDuration, className, onRetryRun }: StepTraceProps) {
  if (steps.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-3">
        No steps executed yet.
      </p>
    );
  }

  const maxDuration =
    totalDuration ||
    Math.max(...steps.map((s) => s.duration ?? 0), 1);

  return (
    <div className={cn("space-y-1", className)}>
      {/* Timeline header */}
      <div className="flex items-center justify-between px-1.5 pb-1.5">
        <span className="text-xs text-muted-foreground font-medium">
          Steps ({steps.filter((s) => s.status === "completed").length}/
          {steps.length})
        </span>
        <span className="text-xs text-muted-foreground font-mono">
          {formatDuration(totalDuration)}
        </span>
      </div>

      {/* Steps */}
      <div className="space-y-0.5">
        {steps.map((step) => (
          <StepTraceRow
            key={step.name}
            step={step}
            maxDuration={maxDuration}
            onRetryRun={onRetryRun}
          />
        ))}
      </div>

      {/* Timeline scale */}
      <TimelineScale maxDuration={maxDuration} />
    </div>
  );
}

interface StepTraceRowProps {
  step: StepInfo;
  maxDuration: number;
  onRetryRun?: () => void;
}

function StepTraceRow({ step, maxDuration, onRetryRun }: StepTraceRowProps) {
  const [expanded, setExpanded] = useState(false);
  const config = statusConfig[step.status] || statusConfig.pending;
  const Icon = config.icon;
  const isRunning = step.status === "running";

  const widthPercent =
    step.duration && maxDuration > 0
      ? Math.max((step.duration / maxDuration) * 100, 2)
      : step.status === "running"
        ? 45
        : 2;

  const hasDetails =
    step.result !== undefined || step.error || (step.attempts ?? 0) > 1;

  return (
    <div className="animate-slide-in">
      <div
        className={cn(
          "group flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition-colors duration-150",
          hasDetails && "cursor-pointer",
          expanded ? "bg-accent/50" : "hover:bg-accent/30"
        )}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        {/* Icon */}
        <div className={cn("shrink-0", config.color)}>
          <Icon
            className={cn("h-3.5 w-3.5", isRunning && "animate-spin")}
          />
        </div>

        {/* Step name */}
        <div className="shrink-0 w-32 min-w-[80px]">
          <span className="font-mono text-xs truncate block">
            {step.name}
          </span>
        </div>

        {/* Trace bar */}
        <div className="flex-1 h-6 bg-muted/30 rounded-md overflow-hidden relative">
          <div
            className={cn(
              "trace-bar h-full flex items-center justify-end px-2.5",
              config.barColor,
              isRunning && "animate-shimmer bg-gradient-to-r from-blue-500/40 via-blue-400/60 to-blue-500/40 bg-[length:200%_100%]"
            )}
            style={
              {
                width: `${widthPercent}%`,
                "--trace-width": `${widthPercent}%`,
              } as React.CSSProperties
            }
          >
            {step.duration != null && step.duration > 0 && (
              <span className="text-xs font-mono text-foreground/80 whitespace-nowrap">
                {formatDuration(step.duration)}
              </span>
            )}
          </div>
        </div>

        {/* Duration label (right) */}
        <div className="shrink-0 w-14 text-right">
          <span className="font-mono text-xs text-muted-foreground">
            {isRunning ? "…" : formatDuration(step.duration)}
          </span>
        </div>

        {/* Expand chevron */}
        {hasDetails && (
          <div className="shrink-0 text-muted-foreground">
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </div>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="ml-8 mr-3 mb-1.5 pl-3 border-l-2 border-border/50">
          {(step.attempts ?? 0) > 1 && (
            <p className="text-xs text-muted-foreground py-0.5">
              Attempt {step.attempts}
            </p>
          )}
          {step.error && (
            <div className="py-1.5">
              <p className="text-xs text-red-400 font-mono bg-red-500/5 rounded-md px-2.5 py-1.5">
                {step.error}
              </p>
              {step.status === "failed" && onRetryRun && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 gap-1.5 text-orange-400 hover:text-orange-300 hover:border-orange-400/30"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetryRun();
                  }}
                >
                  <RotateCcw className="h-3 w-3" />
                  Retry from this step
                </Button>
              )}
            </div>
          )}
          {step.status === "completed" && step.result !== undefined && (
            <div className="py-1.5">
              <JsonViewer data={step.result} collapsed={false} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TimelineScale({ maxDuration }: { maxDuration: number }) {
  const ticks = 5;
  const marks = Array.from({ length: ticks + 1 }, (_, i) => {
    const fraction = i / ticks;
    return {
      position: fraction * 100,
      label: formatDuration(Math.round(maxDuration * fraction)),
    };
  });

  return (
    <div className="relative h-4 mt-0.5" style={{ marginLeft: "calc(0.875rem + 8.5rem)", marginRight: "4.75rem" }}>
      <div className="absolute inset-x-0 top-0 h-px bg-border/50" />
      {marks.map((mark, i) => (
        <div
          key={i}
          className="absolute top-0 flex flex-col items-center"
          style={{ left: `${mark.position}%` }}
        >
          <div className="w-px h-1.5 bg-border/50" />
          <span className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">
            {mark.label}
          </span>
        </div>
      ))}
    </div>
  );
}
