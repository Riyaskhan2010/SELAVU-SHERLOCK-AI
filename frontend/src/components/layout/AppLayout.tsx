import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopNav } from "./TopNav";
import { EvidencePanel } from "@/components/evidence/EvidencePanel";
import { useAppStore } from "@/store/appStore";
import { cn } from "@/lib/utils";

export function AppLayout() {
  const { isSidebarCollapsed } = useAppStore();

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <div
        className={cn(
          "flex flex-col flex-1 overflow-hidden transition-all duration-200",
          isSidebarCollapsed ? "ml-16" : "ml-60"
        )}
      >
        <TopNav />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
      <EvidencePanel />
    </div>
  );
}
