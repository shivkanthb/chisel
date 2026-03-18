import { useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useStore } from "@/lib/store";
import { StatusBadge } from "@/components/status-badge";
import { StepTrace } from "@/components/step-trace";
import { RunDetailPanel } from "@/components/layout/run-detail-panel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronRight } from "lucide-react";
import { formatDuration, truncateId } from "@/lib/utils";
import { api } from "@/lib/api";

export function RunDetailView() {
  const { runId, workflowId } = useParams<{
    runId: string;
    workflowId?: string;
  }>();
  const navigate = useNavigate();
  const { currentRun, fetchRun } = useStore();
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (runId) {
      fetchRun(runId);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [runId, fetchRun]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);

    if (
      currentRun &&
      (currentRun.status === "queued" || currentRun.status === "running")
    ) {
      pollRef.current = setInterval(() => {
        if (runId) fetchRun(runId);
      }, 3000);
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [currentRun?.status, runId, fetchRun]);

  const handleCancel = async () => {
    if (runId) {
      await api.cancel(runId);
      fetchRun(runId);
    }
  };

  const handleRetry = async () => {
    if (runId) {
      await api.retry(runId);
      fetchRun(runId);
    }
  };

  if (!currentRun) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Loading run...
      </div>
    );
  }

  const duration =
    currentRun.completedAt && currentRun.startedAt
      ? currentRun.completedAt - currentRun.startedAt
      : currentRun.startedAt
        ? Date.now() - currentRun.startedAt
        : undefined;

  const resolvedWorkflowId = workflowId
    ? decodeURIComponent(workflowId)
    : currentRun.workflowId;

  return (
    <div className="flex h-full">
      {/* Left: Trace panel */}
      <ScrollArea className="flex-1">
        <div className="px-5 py-4 space-y-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-[13px]">
            <button
              className="text-muted-foreground hover:text-foreground transition-colors font-mono"
              onClick={() =>
                navigate(
                  `/workflows/${encodeURIComponent(resolvedWorkflowId)}`
                )
              }
            >
              {resolvedWorkflowId}
            </button>
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono text-foreground">
              {truncateId(currentRun.id)}
            </span>
          </div>

          {/* Run status bar */}
          <div className="flex items-center gap-2">
            <StatusBadge status={currentRun.status} />
            <span className="font-mono text-[13px] text-muted-foreground">
              {formatDuration(duration)}
            </span>
          </div>

          {/* Trace visualization */}
          <div className="rounded-lg border p-4">
            <StepTrace
              steps={currentRun.steps}
              totalDuration={duration}
              onRetryRun={currentRun.status === "failed" ? handleRetry : undefined}
            />
          </div>
        </div>
      </ScrollArea>

      {/* Right: Detail panel */}
      <div className="w-[320px] shrink-0 border-l">
        <RunDetailPanel
          run={currentRun}
          onCancel={currentRun.status === "running" ? handleCancel : undefined}
          onRetry={currentRun.status === "failed" ? handleRetry : undefined}
        />
      </div>
    </div>
  );
}
