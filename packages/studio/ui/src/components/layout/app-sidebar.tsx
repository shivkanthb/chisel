import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  Activity,
  Layers,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";

const SIDEBAR_WIDTH = 220;
const SIDEBAR_COLLAPSED_WIDTH = 44;

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { health, workflows, sidebarCollapsed, toggleSidebar } = useStore();
  const [workflowsExpanded, setWorkflowsExpanded] = useState(true);

  const connected = health?.connected ?? false;
  const isActivityActive = location.pathname === "/";
  const isWorkflowsSection = location.pathname.startsWith("/workflows");
  const activeWorkflowId = location.pathname.match(
    /^\/workflows\/([^/]+)/
  )?.[1];

  return (
    <aside
      className="flex flex-col h-full border-r bg-card/50 shrink-0 transition-all duration-200 ease-in-out overflow-hidden"
      style={{
        width: sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
      }}
    >
      {/* Logo */}
      <div className="flex items-center px-3 py-2.5 border-b shrink-0">
        {!sidebarCollapsed && (
          <span className="text-xs font-semibold tracking-tight whitespace-nowrap">
            Chisel Studio
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-2 space-y-0.5">
        {/* Activity */}
        <button
          className={cn(
            "flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg w-full text-xs transition-colors duration-150",
            isActivityActive
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          )}
          onClick={() => navigate("/")}
        >
          <Activity className="h-3.5 w-3.5 shrink-0" />
          {!sidebarCollapsed && <span>Activity</span>}
        </button>

        {/* Workflows */}
        <div>
          <button
            className={cn(
              "flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg w-full text-xs transition-colors duration-150",
              isWorkflowsSection && !activeWorkflowId
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
            onClick={() => {
              if (sidebarCollapsed) {
                toggleSidebar();
              }
              setWorkflowsExpanded(!workflowsExpanded);
            }}
          >
            <Layers className="h-3.5 w-3.5 shrink-0" />
            {!sidebarCollapsed && (
              <>
                <span className="flex-1 text-left">Workflows</span>
                <span className="text-xs text-muted-foreground mr-1">
                  {workflows.length}
                </span>
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform duration-200",
                    !workflowsExpanded && "-rotate-90"
                  )}
                />
              </>
            )}
          </button>

          {/* Workflow list */}
          {workflowsExpanded && !sidebarCollapsed && workflows.length > 0 && (
            <div className="mt-0.5 space-y-px animate-slide-in">
              {workflows.map((wf) => {
                const encoded = encodeURIComponent(wf.id);
                const isActive =
                  activeWorkflowId === encoded ||
                  activeWorkflowId === wf.id;
                return (
                  <button
                    key={wf.id}
                    className={cn(
                      "flex items-center gap-2 pl-8 pr-2.5 py-1 rounded-md w-full text-left text-xs font-mono truncate transition-colors duration-150",
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                    )}
                    onClick={() => navigate(`/workflows/${encoded}`)}
                  >
                    <span className="truncate">{wf.id}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </nav>

      {/* Bottom: status + collapse */}
      <div className="border-t px-2 py-2 space-y-1.5 shrink-0">
        {/* Connection status */}
        <div
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1.5 bg-accent/30",
            sidebarCollapsed && "justify-center px-0"
          )}
        >
          <div
            className={cn(
              "h-1.5 w-1.5 rounded-full shrink-0 transition-colors",
              connected
                ? "bg-emerald-400 shadow-[0_0_6px_hsl(142,60%,55%/0.5)]"
                : "bg-red-400"
            )}
          />
          {!sidebarCollapsed && (
            <div className="flex-1 min-w-0">
              <span
                className={cn(
                  "text-xs font-medium block",
                  connected ? "text-emerald-400" : "text-red-400"
                )}
              >
                {connected ? "Connected" : "Disconnected"}
              </span>
              {health && (
                <span className="text-[10px] text-muted-foreground">
                  {health.workers} worker{health.workers !== 1 ? "s" : ""} · {health.queues.length} queue{health.queues.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Collapse toggle */}
        <button
          className={cn(
            "flex items-center py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors duration-150",
            sidebarCollapsed ? "justify-center w-full" : "justify-end w-full pr-1"
          )}
          onClick={toggleSidebar}
        >
          {sidebarCollapsed ? (
            <PanelLeft className="h-3.5 w-3.5" />
          ) : (
            <PanelLeftClose className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </aside>
  );
}
