import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface JsonViewerProps {
  data: unknown;
  collapsed?: boolean;
  className?: string;
}

export function JsonViewer({
  data,
  collapsed = true,
  className,
}: JsonViewerProps) {
  const [isOpen, setIsOpen] = useState(!collapsed);

  if (data === undefined || data === null) {
    return <span className="font-mono text-xs text-muted-foreground">null</span>;
  }

  const json =
    typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const isComplex = typeof data === "object";

  if (!isComplex) {
    return (
      <span className={cn("font-mono text-xs text-emerald-600 dark:text-emerald-400", className)}>
        {json}
      </span>
    );
  }

  const preview =
    JSON.stringify(data).length > 60
      ? JSON.stringify(data).slice(0, 60) + "..."
      : JSON.stringify(data);

  return (
    <div className={cn("font-mono text-xs", className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors duration-100"
      >
        {isOpen ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {!isOpen && (
          <span className="text-muted-foreground">{preview}</span>
        )}
      </button>
      {isOpen && (
        <pre className="mt-1.5 rounded-md bg-accent p-2.5 text-foreground whitespace-pre-wrap break-all leading-relaxed text-xs">
          {json}
        </pre>
      )}
    </div>
  );
}
