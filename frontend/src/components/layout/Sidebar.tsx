import { NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, TrendingUp, AlertTriangle, Zap, Bot,
  FlaskConical, History, Settings, PanelLeftClose, PanelLeftOpen,
  Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/appStore";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const NAV_ITEMS = [
  { to: "/dashboard",     label: "Overview",      icon: LayoutDashboard },
  { to: "/cost-analysis", label: "Cost Analysis",  icon: TrendingUp },
  { to: "/anomalies",     label: "Anomalies",      icon: AlertTriangle },
  { to: "/optimization",  label: "Optimization",   icon: Zap },
  { to: "/ai-assistant",  label: "AI Assistant",   icon: Bot },
  { to: "/demo-data",     label: "Demo Data",      icon: FlaskConical },
] as const;

const SECONDARY_ITEMS = [
  { to: "/history",       label: "Dataset History", icon: History },
  { to: "/settings",      label: "Settings",       icon: Settings },
] as const;

export function Sidebar() {
  const { isSidebarCollapsed, toggleSidebar } = useAppStore();
  const location = useLocation();

  function NavItem({
    to, label, icon: Icon,
  }: { to: string; label: string; icon: React.ElementType }) {
    const isActive =
      location.pathname === to || location.pathname.startsWith(to + "/");

    const inner = (
      <NavLink
        to={to}
        className={cn(
          "flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-150",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
        )}
      >
        <Icon className={cn("w-4 h-4 shrink-0", isActive && "text-primary")} />
        <AnimatePresence>
          {!isSidebarCollapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="whitespace-nowrap overflow-hidden"
            >
              {label}
            </motion.span>
          )}
        </AnimatePresence>
      </NavLink>
    );

    if (isSidebarCollapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{inner}</TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      );
    }
    return inner;
  }

  return (
    <motion.aside
      animate={{ width: isSidebarCollapsed ? 64 : 240 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="fixed left-0 top-0 h-screen z-20 flex flex-col border-r border-border bg-card overflow-hidden"
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/15 border border-primary/25 shrink-0">
            <Cpu className="w-4 h-4 text-primary" />
          </div>
          <AnimatePresence>
            {!isSidebarCollapsed && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                  Selavu Sherlock AI
                </span>
                <span className="block text-[10px] text-muted-foreground leading-none -mt-0.5">
                  AI Cost Intelligence
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      {/* Secondary nav */}
      <div className="py-3 px-2 space-y-0.5 border-t border-border">
        {SECONDARY_ITEMS.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}

        {/* Collapse toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleSidebar}
              className="flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all duration-150 w-full"
            >
              {isSidebarCollapsed
                ? <PanelLeftOpen className="w-4 h-4 shrink-0" />
                : <PanelLeftClose className="w-4 h-4 shrink-0" />}
              <AnimatePresence>
                {!isSidebarCollapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    className="whitespace-nowrap overflow-hidden"
                  >
                    Collapse
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </TooltipTrigger>
          {isSidebarCollapsed && (
            <TooltipContent side="right">Expand sidebar</TooltipContent>
          )}
        </Tooltip>
      </div>
    </motion.aside>
  );
}
