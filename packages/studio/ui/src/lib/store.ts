import { create } from "zustand";
import { api } from "./api";
import { connectSSE } from "./sse";
import type { HealthInfo, WorkflowInfo, RunInfo, ListRunsResult, StudioConfig } from "./api";
import type { EngineEvent } from "./sse";

const MAX_EVENTS = 100;

interface StudioState {
  // Data
  health: HealthInfo | null;
  workflows: WorkflowInfo[];
  currentRuns: ListRunsResult | null;
  currentWorkflowId: string | null;
  currentRun: RunInfo | null;
  liveEvents: EngineEvent[];
  readOnly: boolean;

  // UI state
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Actions
  fetchConfig: () => Promise<void>;
  fetchHealth: () => Promise<void>;
  fetchWorkflows: () => Promise<void>;
  fetchRuns: (
    workflowId: string,
    params?: { limit?: number; cursor?: number; status?: string }
  ) => Promise<void>;
  loadMoreRuns: (workflowId: string) => Promise<void>;
  fetchRun: (runId: string) => Promise<void>;
  pushEvent: (event: EngineEvent) => void;
  connectSSE: () => () => void;
}

export const useStore = create<StudioState>((set, get) => ({
  health: null,
  workflows: [],
  currentRuns: null,
  currentWorkflowId: null,
  currentRun: null,
  liveEvents: [],
  readOnly: false,
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  fetchConfig: async () => {
    try {
      const config = await api.config();
      set({ readOnly: config.readOnly });
    } catch {
      // Default to non-read-only
    }
  },

  fetchHealth: async () => {
    try {
      const health = await api.health();
      set({ health });
    } catch {
      set({ health: null });
    }
  },

  fetchWorkflows: async () => {
    try {
      const workflows = await api.workflows();
      set({ workflows });
    } catch {
      set({ workflows: [] });
    }
  },

  fetchRuns: async (workflowId, params) => {
    try {
      const result = await api.runs(workflowId, params);
      set({ currentRuns: result, currentWorkflowId: workflowId });
    } catch {
      set({ currentRuns: { runs: [], nextCursor: null } });
    }
  },

  loadMoreRuns: async (workflowId) => {
    const { currentRuns } = get();
    if (!currentRuns?.nextCursor) return;

    try {
      const result = await api.runs(workflowId, {
        cursor: currentRuns.nextCursor,
      });
      set({
        currentRuns: {
          runs: [...currentRuns.runs, ...result.runs],
          nextCursor: result.nextCursor,
        },
      });
    } catch {
      // Keep existing data
    }
  },

  fetchRun: async (runId) => {
    try {
      const run = await api.run(runId);
      set({ currentRun: run });
    } catch {
      set({ currentRun: null });
    }
  },

  pushEvent: (event) => {
    set((state) => {
      const events = [event, ...state.liveEvents].slice(0, MAX_EVENTS);

      // Update currentRun if the event is for the currently viewed run
      let currentRun = state.currentRun;
      if (currentRun && event.data.runId === currentRun.id) {
        // Re-fetch the run to get updated data
        api.run(currentRun.id).then((run) => {
          if (run) set({ currentRun: run });
        });
      }

      return { liveEvents: events };
    });
  },

  connectSSE: () => {
    // Seed with recent events from server (covers page reloads / reconnects)
    api.recentEvents().then((events) => {
      set((state) => {
        // Merge: keep any live events that arrived after the buffered ones
        const bufferedTs = events.length > 0 ? events[0].receivedAt : 0;
        const newer = state.liveEvents.filter((e) => e.receivedAt > bufferedTs);
        const merged = [...newer, ...events as EngineEvent[]].slice(0, MAX_EVENTS);
        return { liveEvents: merged };
      });
    }).catch(() => {});

    const disconnect = connectSSE((event) => {
      get().pushEvent(event);
    });
    return disconnect;
  },
}));
