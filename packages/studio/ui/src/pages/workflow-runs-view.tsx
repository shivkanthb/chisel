import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useStore } from "@/lib/store";
import { StatusBadge } from "@/components/status-badge";
import { TriggerDialog } from "@/components/trigger-dialog";
import { TimeAgo } from "@/components/time-ago";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { XCircle, RotateCcw, Gauge, Repeat, Timer, Zap } from "lucide-react";
import { formatDuration, truncateId } from "@/lib/utils";
import { api } from "@/lib/api";
import type { WorkflowInfo } from "@/lib/api";

const STATUS_TABS = ["all", "running", "completed", "failed", "cancelled"] as const;

export function WorkflowRunsView() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();
  const { workflows, currentRuns, fetchRuns, loadMoreRuns } = useStore();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const decodedId = workflowId ? decodeURIComponent(workflowId) : "";
  const workflow: WorkflowInfo | undefined = workflows.find(
    (w) => w.id === decodedId
  );

  useEffect(() => {
    if (decodedId) {
      fetchRuns(decodedId, {
        status: statusFilter === "all" ? undefined : statusFilter,
      });
    }
  }, [decodedId, statusFilter, fetchRuns]);

  const handleCancel = async (e: React.MouseEvent, runId: string) => {
    e.stopPropagation();
    await api.cancel(runId);
    fetchRuns(decodedId, {
      status: statusFilter === "all" ? undefined : statusFilter,
    });
  };

  const handleRetry = async (e: React.MouseEvent, runId: string) => {
    e.stopPropagation();
    await api.retry(runId);
    fetchRuns(decodedId, {
      status: statusFilter === "all" ? undefined : statusFilter,
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-semibold font-mono">{decodedId}</h1>
          <TriggerDialog
            workflowId={decodedId}
            onTriggered={() => {
              fetchRuns(decodedId, {
                status: statusFilter === "all" ? undefined : statusFilter,
              });
            }}
          />
        </div>

        {/* Workflow config */}
        {workflow && (
          <div className="flex gap-4 text-xs text-muted-foreground flex-wrap items-center mt-2">
            <div className="flex items-center gap-1">
              <Gauge className="h-3 w-3" />
              <span className="text-foreground font-medium">{workflow.concurrency}</span>
            </div>
            <div className="flex items-center gap-1">
              <Repeat className="h-3 w-3" />
              <span className="text-foreground font-medium">{workflow.retries}</span>
            </div>
            {workflow.timeout && (
              <div className="flex items-center gap-1">
                <Timer className="h-3 w-3" />
                <span className="text-foreground font-medium">
                  {formatDuration(workflow.timeout)}
                </span>
              </div>
            )}
            {workflow.rateLimit && (
              <div className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                <span className="text-foreground font-medium">
                  {workflow.rateLimit.max}/{formatDuration(workflow.rateLimit.duration)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="px-4 pb-3 shrink-0">
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab} value={tab} className="capitalize text-xs">
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto min-h-0 px-4 pb-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Steps</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentRuns?.runs.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-12"
                  >
                    No runs found.
                  </TableCell>
                </TableRow>
              )}
              {currentRuns?.runs.map((run) => (
                <TableRow
                  key={run.id}
                  className="cursor-pointer"
                  onClick={() =>
                    navigate(
                      `/workflows/${encodeURIComponent(decodedId)}/runs/${run.id}`
                    )
                  }
                >
                  <TableCell className="font-mono text-xs">
                    {truncateId(run.id)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={run.status} />
                  </TableCell>
                  <TableCell>
                    <TimeAgo timestamp={run.startedAt} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {run.completedAt && run.startedAt
                      ? formatDuration(run.completedAt - run.startedAt)
                      : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {run.progress.completed}/{run.progress.total}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {run.status === "running" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 rounded-md"
                          onClick={(e) => handleCancel(e, run.id)}
                        >
                          <XCircle className="h-3 w-3 text-red-400" />
                        </Button>
                      )}
                      {run.status === "failed" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 rounded-md"
                          onClick={(e) => handleRetry(e, run.id)}
                        >
                          <RotateCcw className="h-3 w-3 text-orange-400" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

        {currentRuns?.nextCursor && (
          <div className="sticky bottom-0 flex justify-center py-3 pointer-events-none">
            <Button
              variant="outline"
              className="rounded-lg shadow-lg pointer-events-auto bg-background/80 backdrop-blur-sm"
              onClick={() => loadMoreRuns(decodedId)}
            >
              Load More
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
