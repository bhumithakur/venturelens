import { Menu } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function Topbar({ title, health, onMenu }) {
  const status =
    health === undefined ? { v: "neutral", t: "Checking backend…" }
    : health === null ? { v: "danger", t: "Backend offline" }
    : health.mockMode ? { v: "warning", t: health.liveResearchAvailable ? "Mock by default · Live available" : "Mock data mode" }
    : { v: "success", t: "Live research" };
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-8">
      <button className="rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={onMenu} aria-label="Open navigation">
        <Menu className="size-5" />
      </button>
      <h1 className="text-base font-semibold text-slate-900">{title}</h1>
      <div className="ml-auto">
        <Badge variant={status.v}>{status.t}</Badge>
      </div>
    </header>
  );
}
