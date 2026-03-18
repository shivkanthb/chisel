import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useStore } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import {
  Radio,
  GitBranch,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";

const SIDEBAR_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 48;

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { health, workflows, sidebarCollapsed, toggleSidebar } = useStore();
  const { theme, setTheme } = useTheme();
  const [workflowsExpanded, setWorkflowsExpanded] = useState(true);

  const connected = health?.connected ?? false;
  const isActivityActive = location.pathname === "/";
  const activeWorkflowId = location.pathname.match(
    /^\/workflows\/([^/]+)/
  )?.[1];

  const cycleTheme = () => {
    const order: Array<"light" | "dark" | "system"> = [
      "light",
      "dark",
      "system",
    ];
    const idx = order.indexOf(theme);
    setTheme(order[(idx + 1) % order.length]);
  };

  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <aside
      className="flex flex-col h-full border-r border-sidebar-border bg-sidebar-bg shrink-0 transition-all duration-200 ease-in-out overflow-hidden select-none"
      style={{
        width: sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
      }}
    >
      {/* Header */}
      <div className="flex items-center h-11 px-3 border-b border-sidebar-border shrink-0">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-primary flex items-center justify-center">
              <span className="text-[10px] font-bold text-primary-foreground">
                C
              </span>
            </div>
            <span className="text-sm font-semibold tracking-tight">
              Chisel Studio
            </span>
          </div>
        )}
        {sidebarCollapsed && (
          <div className="h-5 w-5 rounded bg-primary flex items-center justify-center mx-auto">
            <span className="text-[10px] font-bold text-primary-foreground">
              C
            </span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 space-y-0.5">
        {/* Activity */}
        <button
          className={cn(
            "flex items-center gap-2 px-2 py-1.5 rounded-md w-full text-[13px] transition-colors duration-100",
            isActivityActive
              ? "bg-accent text-foreground font-medium"
              : "text-muted-foreground hover:bg-sidebar-hover hover:text-foreground"
          )}
          onClick={() => navigate("/")}
        >
          <Radio className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && <span>Activity</span>}
        </button>

        {/* Workflows section */}
        <div>
          <button
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded-md w-full text-[13px] transition-colors duration-100",
              "text-muted-foreground hover:bg-sidebar-hover hover:text-foreground"
            )}
            onClick={() => {
              if (sidebarCollapsed) {
                toggleSidebar();
              }
              setWorkflowsExpanded(!workflowsExpanded);
            }}
          >
            <GitBranch className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && (
              <>
                <span className="flex-1 text-left">Workflows</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {workflows.length}
                </span>
                {workflowsExpanded ? (
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                )}
              </>
            )}
          </button>

          {/* Workflow list */}
          {workflowsExpanded && !sidebarCollapsed && workflows.length > 0 && (
            <div className="mt-0.5 space-y-px">
              {workflows.map((wf) => {
                const encoded = encodeURIComponent(wf.id);
                const isActive =
                  activeWorkflowId === encoded ||
                  activeWorkflowId === wf.id;
                return (
                  <button
                    key={wf.id}
                    className={cn(
                      "flex items-center gap-2 pl-8 pr-2 py-1 rounded-md w-full text-left text-[13px] font-mono truncate transition-colors duration-100",
                      isActive
                        ? "bg-accent text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-sidebar-hover"
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

      {/* Bottom section */}
      <div className="border-t border-sidebar-border px-2 py-2 space-y-1 shrink-0">
        {/* Connection status */}
        <div
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1.5",
            sidebarCollapsed && "justify-center px-0"
          )}
        >
          <div
            className={cn(
              "h-2 w-2 rounded-full shrink-0",
              connected ? "bg-emerald-500" : "bg-red-500"
            )}
          />
          {!sidebarCollapsed && (
            <div className="flex-1 min-w-0">
              <span
                className={cn(
                  "text-xs block",
                  connected
                    ? "text-muted-foreground"
                    : "text-red-500 font-medium"
                )}
              >
                {connected ? "Connected" : "Disconnected"}
              </span>
              {health && connected && (
                <span className="text-[11px] text-muted-foreground">
                  {health.workers} worker
                  {health.workers !== 1 ? "s" : ""} · {health.queues.length}{" "}
                  queue{health.queues.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Theme + collapse controls */}
        <div className="flex items-center justify-between">
          {!sidebarCollapsed && (
            <button
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-hover transition-colors duration-100 text-xs"
              onClick={cycleTheme}
              title={`Theme: ${theme}`}
            >
              <ThemeIcon className="h-3.5 w-3.5" />
              <span className="capitalize">{theme}</span>
            </button>
          )}
          <button
            className={cn(
              "flex items-center p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-hover transition-colors duration-100",
              sidebarCollapsed && "mx-auto"
            )}
            onClick={toggleSidebar}
          >
            {sidebarCollapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
