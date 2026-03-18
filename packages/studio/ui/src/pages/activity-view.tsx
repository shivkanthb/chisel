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
      {/* Header bar */}
      <div className="h-11 px-5 flex items-center justify-between border-b shrink-0">
        <h1 className="text-sm font-medium">Activity</h1>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter events..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 w-52 rounded-md border bg-background pl-8 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="px-5 py-3">
            <ActivityFeed events={filtered} />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
