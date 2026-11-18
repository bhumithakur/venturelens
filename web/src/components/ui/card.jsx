import { cn } from "@/lib/utils";

export const Card = ({ className, ...p }) => (
  <div className={cn("rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)} {...p} />
);
export const CardHeader = ({ className, ...p }) => <div className={cn("flex items-start justify-between gap-4 p-5 pb-3", className)} {...p} />;
export const CardTitle = ({ className, ...p }) => <h3 className={cn("text-sm font-semibold text-slate-900", className)} {...p} />;
export const CardDescription = ({ className, ...p }) => <p className={cn("mt-1 text-xs text-slate-500", className)} {...p} />;
export const CardContent = ({ className, ...p }) => <div className={cn("p-5 pt-0", className)} {...p} />;
