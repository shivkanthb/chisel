import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  XCircle,
  Loader2,
  RotateCcw,
  Minus,
  Moon,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import { JsonViewer } from "./json-viewer";
import { Button } from "./ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "./ui/tooltip";
import type { StepInfo } from "@/lib/api";

const statusConfig: Record<
  string,
  { icon: typeof Circle; color: string; barColor: string }
> = {
  pending: {
    icon: Circle,
    color: "text-muted-foreground",
    barColor: "bg-gray-200 dark:bg-gray-700",
  },
  running: {
    icon: Loader2,
    color: "text-blue-500",
    barColor: "bg-blue-500/30 dark:bg-blue-500/40",
  },
  completed: {
    icon: CheckCircle2,
    color: "text-emerald-500",
    barColor: "bg-emerald-500/30 dark:bg-emerald-500/40",
  },
  failed: {
    icon: XCircle,
    color: "text-red-500",
    barColor: "bg-red-500/30 dark:bg-red-500/40",
  },
  retrying: {
    icon: RotateCcw,
    color: "text-orange-500",
    barColor: "bg-orange-500/30 dark:bg-orange-500/40",
  },
  skipped: {
    icon: Minus,
    color: "text-muted-foreground",
    barColor: "bg-gray-200 dark:bg-gray-700",
  },
  sleep: {
    icon: Moon,
    color: "text-purple-500",
    barColor: "bg-purple-500/30 dark:bg-purple-500/40",
  },
};

interface StepTraceProps {
  steps: StepInfo[];
  totalDuration?: number;
  runStartedAt?: number;
  className?: string;
  onRetryRun?: () => void;
  readOnly?: boolean;
}

export function StepTrace({
  steps,
  totalDuration,
  runStartedAt,
  className,
  onRetryRun,
  readOnly,
}: StepTraceProps) {
  if (steps.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground py-4">
        No steps executed yet.
      </p>
    );
  }

  const timelineDuration =
    totalDuration ||
    Math.max(
      ...steps.map((step) => {
        if (step.startedAt != null && runStartedAt != null) {
          return step.startedAt - runStartedAt + (step.duration ?? 0);
        }
        return step.duration ?? 0;
      }),
      1
    );

  const isCompletedTrace = isSettledTrace(steps);
  const laidOutSteps = layoutSteps(steps, {
    isCompletedTrace,
    runStartedAt,
  });
  const displayTimelineDuration = getDisplayTimelineDuration(
    laidOutSteps,
    timelineDuration,
    isCompletedTrace
  );

  return (
    <div className={cn("space-y-1", className)}>
      {/* Timeline header */}
      <div className="flex items-center justify-between pb-2">
        <span className="text-[13px] text-muted-foreground font-medium">
          Steps ({steps.filter((s) => s.status === "completed").length}/
          {steps.length})
        </span>
        <span className="text-[13px] text-muted-foreground font-mono">
          {formatDuration(displayTimelineDuration)}
        </span>
      </div>

      {/* Steps */}
      <div className="space-y-0.5">
        {laidOutSteps.map(({ step, displayStart, displayDuration }) => (
          <StepTraceRow
            key={step.name}
            step={step}
            timelineDuration={displayTimelineDuration}
            displayStart={displayStart}
            displayDuration={displayDuration}
            useTinyMarkers={isCompletedTrace}
            onRetryRun={onRetryRun}
            readOnly={readOnly}
          />
        ))}
      </div>

      {/* Timeline scale */}
      <TimelineScale maxDuration={displayTimelineDuration} />
    </div>
  );
}

interface StepTraceRowProps {
  step: StepInfo;
  timelineDuration: number;
  displayStart: number;
  displayDuration?: number;
  useTinyMarkers?: boolean;
  onRetryRun?: () => void;
  readOnly?: boolean;
}

function StepTraceRow({
  step,
  timelineDuration,
  displayStart,
  displayDuration,
  useTinyMarkers,
  onRetryRun,
  readOnly,
}: StepTraceRowProps) {
  const [expanded, setExpanded] = useState(false);
  const config = statusConfig[step.status] || statusConfig.pending;
  const Icon = config.icon;
  const isRunning = step.status === "running";
  const effectiveDuration = displayDuration;
  const leftPercent =
    timelineDuration > 0
      ? Math.max((displayStart / timelineDuration) * 100, 0)
      : 0;
  const actualWidthPercent =
    effectiveDuration && timelineDuration > 0
      ? (effectiveDuration / timelineDuration) * 100
      : 0;
  const showTinyMarker =
    !!useTinyMarkers &&
    effectiveDuration != null &&
    effectiveDuration > 0 &&
    actualWidthPercent < 2;

  const widthPercent =
    effectiveDuration && timelineDuration > 0
      ? Math.max(actualWidthPercent, 1)
      : step.status === "running"
        ? 45
        : 2;
  const clampedWidthPercent = Math.min(widthPercent, Math.max(100 - leftPercent, 1));

  const hasDetails =
    step.result !== undefined || step.error || (step.attempts ?? 0) > 1;

  return (
    <div className="animate-slide-in">
      <div
        className={cn(
          "group flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors duration-100",
          hasDetails && "cursor-pointer",
          expanded ? "bg-accent" : "hover:bg-accent/50"
        )}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        {/* Icon */}
        <div className={cn("shrink-0", config.color)}>
          <Icon
            className={cn("h-4 w-4", isRunning && "animate-spin")}
          />
        </div>

        {/* Step name */}
        <div className="shrink-0 w-32 min-w-[80px]">
          <span className="font-mono text-[13px] truncate block">
            {step.name}
          </span>
        </div>

        {/* Trace bar */}
        <div className="flex-1 h-6 bg-accent rounded-md overflow-hidden relative">
          <div
            className={cn(
              "trace-bar absolute inset-y-0 flex items-center px-2",
              config.barColor,
              showTinyMarker && "inset-y-0.5 rounded-sm px-0",
              isRunning && "animate-shimmer bg-gradient-to-r from-blue-500/20 via-blue-400/40 to-blue-500/20 bg-[length:200%_100%]"
            )}
            style={
              showTinyMarker
                ? ({
                    left: `${leftPercent}%`,
                    width: "3px",
                    "--trace-width": "3px",
                  } as React.CSSProperties)
                : ({
                    left: `${leftPercent}%`,
                    width: `${clampedWidthPercent}%`,
                    "--trace-width": `${clampedWidthPercent}%`,
                  } as React.CSSProperties)
            }
          >
            {effectiveDuration != null && effectiveDuration > 0 && !showTinyMarker && clampedWidthPercent > 12 && (
              <span className="text-xs font-mono text-foreground/70 whitespace-nowrap ml-auto">
                {formatDuration(effectiveDuration)}
              </span>
            )}
          </div>
        </div>

        {/* Duration label (right) */}
        <div className="shrink-0 w-14 text-right">
          <span className="font-mono text-xs text-muted-foreground">
            {isRunning && effectiveDuration == null ? "..." : formatDuration(effectiveDuration)}
          </span>
        </div>

        {/* Expand chevron */}
        <div className="shrink-0 w-4 text-muted-foreground flex justify-center">
          {hasDetails ? (
            expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )
          ) : null}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="ml-8 mr-3 mb-1.5 pl-3 border-l-2 border-border">
          {(step.attempts ?? 0) > 1 && (
            <p className="text-[13px] text-muted-foreground py-0.5">
              Attempt {step.attempts}
            </p>
          )}
          {step.error && (
            <div className="py-1.5">
              <p className="text-[13px] text-red-600 dark:text-red-400 font-mono bg-red-500/5 rounded-md px-2.5 py-1.5">
                {step.error}
              </p>
              {step.status === "failed" && onRetryRun && (
                readOnly ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 gap-1.5 text-orange-600 dark:text-orange-400"
                          disabled
                        >
                          <RotateCcw className="h-3 w-3" />
                          Retry from this step
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Studio is in read-only mode</TooltipContent>
                  </Tooltip>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 gap-1.5 text-orange-600 dark:text-orange-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRetryRun();
                    }}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Retry from this step
                  </Button>
                )
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
  const marks = getTimelineMarks(maxDuration);

  return (
    <div className="relative h-4 mt-1" style={{ marginLeft: "calc(1rem + 8.5rem)", marginRight: "4.75rem" }}>
      <div className="absolute inset-x-0 top-0 h-px bg-border" />
      {marks.map((mark, i) => (
        <div
          key={i}
          className="absolute top-0 flex flex-col items-center"
          style={{ left: `${mark.position}%` }}
        >
          <div className="w-px h-1.5 bg-border" />
          <span className="text-[10px] text-muted-foreground font-mono mt-0.5">
            {mark.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function isSettledTrace(steps: StepInfo[]) {
  return !steps.some(
    (step) =>
      step.status === "running" ||
      step.status === "sleep" ||
      step.status === "pending" ||
      step.status === "retrying"
  );
}

function layoutSteps(
  steps: StepInfo[],
  opts: { isCompletedTrace: boolean; runStartedAt?: number }
) {
  const { isCompletedTrace, runStartedAt } = opts;
  let cursor = 0;

  return steps.map((step) => {
    const displayDuration = getDisplayDuration(step);

    if (isCompletedTrace) {
      const displayStart = cursor;
      cursor += displayDuration ?? 0;
      return { step, displayStart, displayDuration };
    }

    const displayStart =
      step.startedAt != null && runStartedAt != null
        ? Math.max(step.startedAt - runStartedAt, 0)
        : 0;

    return { step, displayStart, displayDuration };
  });
}

function getDisplayDuration(step: StepInfo) {
  if (step.duration != null) return step.duration;
  if (step.status === "running" && step.startedAt != null) {
    return Date.now() - step.startedAt;
  }
  return undefined;
}

function getDisplayTimelineDuration(
  laidOutSteps: Array<{ displayStart: number; displayDuration?: number }>,
  timelineDuration: number,
  isCompletedTrace: boolean
) {
  if (!isCompletedTrace) return timelineDuration;

  const lastStep = laidOutSteps[laidOutSteps.length - 1];
  const completedDuration =
    (lastStep?.displayStart ?? 0) + (lastStep?.displayDuration ?? 0);

  return Math.max(completedDuration, 1);
}

function getTimelineMarks(maxDuration: number) {
  if (maxDuration <= 0) {
    return [{ position: 0, label: "0ms" }];
  }

  const tickStep = getNiceTickStep(maxDuration);
  const marks: Array<{ value: number; position: number; label: string }> = [];

  for (let value = 0; value <= maxDuration; value += tickStep) {
    marks.push({
      value,
      position: (value / maxDuration) * 100,
      label: formatDuration(value),
    });
  }

  const last = marks[marks.length - 1];
  if (!last) {
    marks.push({ value: maxDuration, position: 100, label: formatDuration(maxDuration) });
  } else if (last.value !== maxDuration) {
    const endMark = {
      value: maxDuration,
      position: 100,
      label: formatDuration(maxDuration),
    };

    if (maxDuration - last.value < tickStep * 0.5) {
      marks[marks.length - 1] = endMark;
    } else {
      marks.push(endMark);
    }
  }

  return marks.map(({ position, label }) => ({ position, label }));
}

function getNiceTickStep(maxDuration: number) {
  const targetTicks = 6;
  const roughStep = maxDuration / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;

  let niceNormalized = 10;
  if (normalized <= 1) {
    niceNormalized = 1;
  } else if (normalized <= 2) {
    niceNormalized = 2;
  } else if (normalized <= 5) {
    niceNormalized = 5;
  }

  return niceNormalized * magnitude;
}
