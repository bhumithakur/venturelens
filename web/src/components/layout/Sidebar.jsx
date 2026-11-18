import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Building2, LineChart, History, Telescope } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/businesses/new", label: "Create Business", icon: Building2 },
  { to: "/research", label: "Market Research", icon: LineChart },
  { to: "/history", label: "Research History", icon: History },
];

const WORKSPACE_PATH = /^\/businesses\/[^/]+\/research$/;

export function Sidebar({ open, onNavigate }) {
  const { pathname } = useLocation();
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-navy-950 text-slate-300 transition-transform lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full"
      )}
    >
      <div className="flex h-16 items-center gap-2.5 border-b border-white/5 px-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Telescope className="size-4" />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight text-white">VentureLens</p>
          <p className="text-[11px] text-slate-400">Growth co-pilot</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">Workspace</p>
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) => {
              isActive = isActive || (to === "/research" && WORKSPACE_PATH.test(pathname));
              return (
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive ? "bg-navy-800 font-medium text-white" : "hover:bg-navy-900 hover:text-white"
              ));
            }}
          >
            <Icon className="size-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/5 p-4 text-[11px] text-slate-500">Data stored locally in this browser.</div>
    </aside>
  );
}
