import { StatusBadge } from "@/components/status-badge";
import { JsonViewer } from "@/components/json-viewer";
import { TimeAgo } from "@/components/time-ago";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { XCircle, RotateCcw, Copy } from "lucide-react";
import { formatDuration, truncateId } from "@/lib/utils";
import type { RunInfo } from "@/lib/api";

interface RunDetailPanelProps {
  run: RunInfo;
  onCancel?: () => void;
  onRetry?: () => void;
}

export function RunDetailPanel({ run, onCancel, onRetry }: RunDetailPanelProps) {
  const duration =
    run.completedAt && run.startedAt
      ? run.completedAt - run.startedAt
      : run.startedAt
        ? Date.now() - run.startedAt
        : undefined;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b shrink-0">
        <div className="flex items-center gap-2">
          <StatusBadge status={run.status} />
          <span className="font-mono text-xs font-medium">
            {run.workflowId}
          </span>
        </div>
        <button
          className="text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => navigator.clipboard.writeText(run.id)}
          title="Copy run ID"
        >
          <Copy className="h-3 w-3" />
        </button>
      </div>

      {/* Tabs content */}
      <ScrollArea className="flex-1">
        <Tabs defaultValue="overview" className="flex flex-col">
          <div className="px-3.5 pt-2.5 shrink-0">
            <TabsList className="w-full">
              <TabsTrigger value="overview" className="flex-1 text-xs">
                Overview
              </TabsTrigger>
              <TabsTrigger value="detail" className="flex-1 text-xs">
                Detail
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="px-3.5 pb-4 space-y-3.5 mt-2.5">
            {/* Status + timestamps */}
            <section className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Status</span>
                <StatusBadge status={run.status} />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Started</span>
                <TimeAgo timestamp={run.startedAt} className="font-mono text-xs" />
              </div>
              {run.completedAt && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Finished</span>
                  <TimeAgo timestamp={run.completedAt} className="font-mono text-xs" />
                </div>
              )}
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-mono text-xs">{formatDuration(duration)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Steps</span>
                <span className="font-mono text-xs">
                  {run.progress.completed}/{run.progress.total}
                </span>
              </div>
            </section>

            {/* Payload */}
            <section>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                Payload
              </h3>
              <div className="rounded-lg bg-accent/30 p-2.5">
                <JsonViewer data={run.data} collapsed={false} />
              </div>
            </section>

            {/* Output */}
            {run.status === "completed" && run.result !== undefined && (
              <section>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  Output
                </h3>
                <div className="rounded-lg bg-accent/30 p-2.5">
                  <JsonViewer data={run.result} collapsed={false} />
                </div>
              </section>
            )}

            {/* Error */}
            {run.status === "failed" && run.error && (
              <section>
                <h3 className="text-xs font-medium text-red-400 uppercase tracking-wider mb-1.5">
                  Error
                </h3>
                <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-2.5">
                  <p className="text-xs text-red-400 font-mono">{run.error}</p>
                  {run.steps.find((s) => s.status === "failed") && (
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Failed at step:{" "}
                      <span className="font-mono text-foreground">
                        {run.steps.find((s) => s.status === "failed")?.name}
                      </span>
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* Actions */}
            {(run.status === "running" || run.status === "failed") && (
              <section className="pt-2">
                <div className="flex gap-2">
                  {run.status === "running" && onCancel && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5 text-red-400 hover:text-red-300 hover:border-red-400/30"
                      onClick={onCancel}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Cancel
                    </Button>
                  )}
                  {run.status === "failed" && onRetry && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5 text-orange-400 hover:text-orange-300 hover:border-orange-400/30"
                      onClick={onRetry}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Retry
                    </Button>
                  )}
                </div>
              </section>
            )}
          </TabsContent>

          <TabsContent value="detail" className="px-3.5 pb-4 space-y-3.5 mt-2.5">
            {/* Run ID */}
            <section>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                Run ID
              </h3>
              <p className="font-mono text-xs text-foreground bg-accent/30 rounded-lg px-2.5 py-1.5 break-all">
                {run.id}
              </p>
            </section>

            {/* Workflow */}
            <section>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                Workflow
              </h3>
              <p className="font-mono text-xs text-foreground bg-accent/30 rounded-lg px-2.5 py-1.5">
                {run.workflowId}
              </p>
            </section>

            {/* Step details */}
            <section>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                Steps ({run.steps.length})
              </h3>
              <div className="space-y-1">
                {run.steps.map((step) => (
                  <div
                    key={step.name}
                    className="flex items-center justify-between bg-accent/30 rounded-md px-2.5 py-1.5"
                  >
                    <span className="font-mono text-xs truncate mr-2">{step.name}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatDuration(step.duration)}
                      </span>
                      <StatusBadge
                        status={step.status}
                        className="text-[10px] px-1.5 py-0"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </TabsContent>
        </Tabs>
      </ScrollArea>
    </div>
  );
}
