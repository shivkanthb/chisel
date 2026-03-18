import { cn } from "@/lib/utils";

const statusConfig: Record<string, { dot: string; text: string }> = {
  queued: { dot: "bg-gray-400", text: "text-muted-foreground" },
  running: { dot: "bg-blue-500 animate-pulse", text: "text-blue-600 dark:text-blue-400" },
  completed: { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  failed: { dot: "bg-red-500", text: "text-red-600 dark:text-red-400" },
  cancelled: { dot: "bg-yellow-500", text: "text-yellow-600 dark:text-yellow-400" },
  retrying: { dot: "bg-orange-500 animate-pulse", text: "text-orange-600 dark:text-orange-400" },
  stalled: { dot: "bg-purple-500", text: "text-purple-600 dark:text-purple-400" },
  pending: { dot: "bg-gray-400", text: "text-muted-foreground" },
  skipped: { dot: "bg-gray-300 dark:bg-gray-600", text: "text-muted-foreground" },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.queued;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[13px] font-medium",
        config.text,
        className
      )}
    >
      <span className={cn("h-2 w-2 rounded-full shrink-0", config.dot)} />
      <span className="capitalize">{status}</span>
    </span>
  );
}
