import { Outlet } from "react-router-dom";
import { Agentation } from "agentation";
import { AppSidebar } from "./app-sidebar";

export function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
      <Agentation />
    </div>
  );
}
