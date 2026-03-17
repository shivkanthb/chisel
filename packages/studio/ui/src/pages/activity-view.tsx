import { useState } from "react";
import { useStore } from "@/lib/store";
import { ActivityFeed } from "@/components/activity-feed";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search } from "lucide-react";

export function ActivityView() {
  const liveEvents = useStore((s) => s.liveEvents);
  const [search, setSearch] = useState("");

  const filtered = search
    ? liveEvents.filter((e) => {
        const text =
          `${e.type} ${e.data.workflowId ?? ""} ${e.data.stepName ?? ""} ${e.data.runId ?? ""}`.toLowerCase();
        return text.includes(search.toLowerCase());
      })
    : liveEvents;

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 pt-4 pb-3 shrink-0 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-sm font-semibold">Recent Activity</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Live event stream from all workflows
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter events..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 w-48 rounded-md border bg-accent/30 pl-7 pr-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="px-4 pb-4">
            <ActivityFeed events={filtered} />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
