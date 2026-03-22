export interface HealthInfo {
  connected: boolean;
  redis: { host: string; port: number } | { url: string };
  workers: number;
  queues: string[];
}

export interface WorkflowInfo {
  id: string;
  concurrency: number;
  retries: number;
  timeout?: number;
  priority?: number;
  rateLimit?: { max: number; duration: number };
  hasInput: boolean;
}

export interface StepInfo {
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "retrying" | "skipped" | "sleep";
  result?: unknown;
  error?: string;
  duration?: number;
  attempts?: number;
  startedAt?: number;
  order?: number;
}

export interface RunInfo {
  id: string;
  workflowId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | "stalled";
  data: unknown;
  result?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  steps: StepInfo[];
  currentStep?: string;
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
}

export interface ListRunsResult {
  runs: RunInfo[];
  nextCursor: number | null;
}

const BASE = "/api";

async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const searchParams = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value != null) searchParams.set(key, String(value));
    }
  }
  const queryString = searchParams.toString();
  const fullUrl = queryString ? `${url}?${queryString}` : url;
  const res = await fetch(fullUrl);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function post<T = unknown>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface StudioConfig {
  readOnly: boolean;
}

export interface BufferedEvent {
  type: string;
  data: Record<string, unknown>;
  receivedAt: number;
}

export const api = {
  config: () => get<StudioConfig>(`${BASE}/config`),
  health: () => get<HealthInfo>(`${BASE}/health`),
  workflows: () => get<WorkflowInfo[]>(`${BASE}/workflows`),
  runs: (
    workflowId: string,
    params?: { limit?: number; cursor?: number; status?: string }
  ) => get<ListRunsResult>(`${BASE}/workflows/${workflowId}/runs`, params),
  run: (runId: string) => get<RunInfo>(`${BASE}/runs/${runId}`),
  cancel: (runId: string) => post(`${BASE}/runs/${runId}/cancel`),
  retry: (runId: string) => post(`${BASE}/runs/${runId}/retry`),
  trigger: (workflowId: string, data: unknown) =>
    post<{ runId: string }>(`${BASE}/workflows/${workflowId}/trigger`, data),
  recentEvents: () => get<BufferedEvent[]>(`${BASE}/events/recent`),
};
