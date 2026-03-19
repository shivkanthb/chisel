import { useEffect } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { AppLayout } from "@/components/layout";
import { ActivityView } from "@/pages/activity-view";
import { WorkflowRunsView } from "@/pages/workflow-runs-view";
import { RunDetailView } from "@/pages/run-detail-view";
import { useStore } from "@/lib/store";

export function App() {
  const connectSSE = useStore((s) => s.connectSSE);
  const fetchConfig = useStore((s) => s.fetchConfig);
  const fetchHealth = useStore((s) => s.fetchHealth);
  const fetchWorkflows = useStore((s) => s.fetchWorkflows);

  useEffect(() => {
    const disconnect = connectSSE();
    fetchConfig();
    fetchHealth();
    fetchWorkflows();
    const interval = setInterval(fetchHealth, 30_000);
    return () => {
      disconnect();
      clearInterval(interval);
    };
  }, [connectSSE, fetchConfig, fetchHealth, fetchWorkflows]);

  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={200}>
        <HashRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<ActivityView />} />
              <Route path="/workflows/:workflowId" element={<WorkflowRunsView />} />
              <Route path="/workflows/:workflowId/runs/:runId" element={<RunDetailView />} />
              <Route path="/runs/:runId" element={<RunDetailView />} />
            </Route>
          </Routes>
        </HashRouter>
      </TooltipProvider>
    </ThemeProvider>
  );
}
