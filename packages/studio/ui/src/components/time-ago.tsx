import { useState, useEffect } from "react";
import { timeAgo } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TimeAgoProps {
  timestamp?: number;
  className?: string;
}

export function TimeAgo({ timestamp, className }: TimeAgoProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!timestamp) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [timestamp]);

  if (!timestamp) return <span className={className}>—</span>;

  const fullDate = new Date(timestamp).toLocaleString();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={className}>{timeAgo(timestamp)}</span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-mono text-xs">{fullDate}</p>
      </TooltipContent>
    </Tooltip>
  );
}
