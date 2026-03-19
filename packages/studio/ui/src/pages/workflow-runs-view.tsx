import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useStore } from "@/lib/store";
import { StatusBadge } from "@/components/status-badge";
import { TriggerDialog } from "@/components/trigger-dialog";
import { TimeAgo } from "@/components/time-ago";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
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
  const { workflows, currentRuns, fetchRuns, loadMoreRuns, readOnly } = useStore();
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
      {/* Header bar */}
      <div className="h-11 px-5 flex items-center justify-between border-b shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-medium font-mono">{decodedId}</h1>
          {workflow && (
            <div className="flex gap-3 text-xs text-muted-foreground items-center">
              <div className="flex items-center gap-1" title="Concurrency">
                <Gauge className="h-3 w-3" />
                <span>{workflow.concurrency}</span>
              </div>
              <div className="flex items-center gap-1" title="Retries">
                <Repeat className="h-3 w-3" />
                <span>{workflow.retries}</span>
              </div>
              {workflow.timeout && (
                <div className="flex items-center gap-1" title="Timeout">
                  <Timer className="h-3 w-3" />
                  <span>{formatDuration(workflow.timeout)}</span>
                </div>
              )}
              {workflow.rateLimit && (
                <div className="flex items-center gap-1" title="Rate limit">
                  <Zap className="h-3 w-3" />
                  <span>
                    {workflow.rateLimit.max}/{formatDuration(workflow.rateLimit.duration)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
        <TriggerDialog
          workflowId={decodedId}
          readOnly={readOnly}
          onTriggered={() => {
            fetchRuns(decodedId, {
              status: statusFilter === "all" ? undefined : statusFilter,
            });
          }}
        />
      </div>

      {/* Filter bar */}
      <div className="h-10 px-5 flex items-center gap-1 border-b shrink-0">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            className={`px-2.5 py-1 rounded-md text-[13px] capitalize transition-colors duration-100 ${
              statusFilter === tab
                ? "bg-accent text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
            onClick={() => setStatusFilter(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto min-h-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Run</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Steps</TableHead>
              <TableHead className="w-[80px] pr-5">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentRuns?.runs.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground py-16"
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
                <TableCell className="font-mono text-[13px] pl-5" title={run.id}>
                  {truncateId(run.id)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={run.status} />
                </TableCell>
                <TableCell className="text-[13px]">
                  <TimeAgo timestamp={run.startedAt} />
                </TableCell>
                <TableCell className="font-mono text-[13px] text-muted-foreground">
                  {run.completedAt && run.startedAt
                    ? formatDuration(run.completedAt - run.startedAt)
                    : "—"}
                </TableCell>
                <TableCell className="font-mono text-[13px] text-muted-foreground">
                  {run.progress.completed}/{run.progress.total}
                </TableCell>
                <TableCell className="pr-5">
                  <div className="flex gap-1">
                    {run.status === "running" && (
                      readOnly ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span tabIndex={0}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 rounded-md"
                                disabled
                              >
                                <XCircle className="h-3.5 w-3.5 text-red-500" />
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Studio is in read-only mode</TooltipContent>
                        </Tooltip>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 rounded-md"
                          onClick={(e) => handleCancel(e, run.id)}
                        >
                          <XCircle className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      )
                    )}
                    {run.status === "failed" && (
                      readOnly ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span tabIndex={0}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 rounded-md"
                                disabled
                              >
                                <RotateCcw className="h-3.5 w-3.5 text-orange-500" />
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Studio is in read-only mode</TooltipContent>
                        </Tooltip>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 rounded-md"
                          onClick={(e) => handleRetry(e, run.id)}
                        >
                          <RotateCcw className="h-3.5 w-3.5 text-orange-500" />
                        </Button>
                      )
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {currentRuns?.nextCursor && (
          <div className="flex justify-center py-4">
            <Button
              variant="outline"
              size="sm"
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
