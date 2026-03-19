/// <reference types="vite/client" />
import { Outlet } from "react-router-dom";
import { useStore } from "@/lib/store";
import { AppSidebar } from "./app-sidebar";

// Only imported in dev; Vite tree-shakes this in production builds
let DevAgentation: (() => JSX.Element | null) | null = null;
if (import.meta.env.DEV) {
  try {
    const { Agentation } = await import("agentation");
    DevAgentation = Agentation as unknown as () => JSX.Element | null;
  } catch {
    // agentation not installed
  }
}

export function AppLayout() {
  const readOnly = useStore((s) => s.readOnly);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <AppSidebar />
      <main className="flex-1 overflow-auto flex flex-col">
        {readOnly && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs shrink-0">
            <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>This studio is in read-only mode</span>
          </div>
        )}
        <div className="flex-1 overflow-auto">
          {/* @ts-expect-error React type version mismatch between packages */}
          <Outlet />
        </div>
      </main>
      {DevAgentation && <DevAgentation />}
    </div>
  );
}
