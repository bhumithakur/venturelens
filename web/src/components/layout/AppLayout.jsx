import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { api } from "@/lib/api";

const TITLES = { "/": "Dashboard", "/businesses/new": "Create Business", "/research": "Market Research", "/history": "Research History" };
const titleFor = (path) =>
  TITLES[path] ?? (/^\/businesses\/[^/]+\/research$/.test(path) || path.startsWith("/research/") ? "Market Research" : "VentureLens");

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState(undefined);
  const { pathname } = useLocation();

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  return (
    <div className="min-h-full">
      <Sidebar open={open} onNavigate={() => setOpen(false)} />
      {open && <div className="fixed inset-0 z-30 bg-navy-950/40 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="lg:pl-64">
        <Topbar title={titleFor(pathname)} health={health} onMenu={() => setOpen(true)} />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
          <Outlet context={{ health }} />
        </main>
      </div>
    </div>
  );
}
