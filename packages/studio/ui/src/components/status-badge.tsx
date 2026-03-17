import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  queued: "bg-muted text-muted-foreground border-transparent",
  running: "bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse",
  completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  failed: "bg-red-500/10 text-red-400 border-red-500/20",
  cancelled: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  retrying: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  stalled: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  pending: "bg-muted text-muted-foreground border-transparent",
  skipped: "bg-muted text-muted-foreground border-transparent",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge
      className={cn(statusStyles[status] || statusStyles.queued, className)}
    >
      {status}
    </Badge>
  );
}
