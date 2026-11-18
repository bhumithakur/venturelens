import { cn } from "@/lib/utils";

const control =
  "w-full rounded-lg border bg-white px-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-50";
const state = (invalid) => (invalid ? "border-rose-300 focus:border-rose-400" : "border-slate-200 focus:border-brand-500");

export const Input = ({ className, invalid, ...p }) => (
  <input className={cn(control, "h-9", state(invalid), className)} aria-invalid={invalid || undefined} {...p} />
);
export const Textarea = ({ className, invalid, ...p }) => (
  <textarea className={cn(control, "min-h-28 py-2 leading-relaxed", state(invalid), className)} aria-invalid={invalid || undefined} {...p} />
);
export const Select = ({ className, invalid, children, ...p }) => (
  <select className={cn(control, "h-9 pr-8", state(invalid), className)} aria-invalid={invalid || undefined} {...p}>
    {children}
  </select>
);

/** Label + control + description/error/counter. Pass the control as children. */
export function FormField({ id, label, required, description, error, count, max, children, className }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-slate-800">
          {label} {required ? <span className="text-rose-500">*</span> : <span className="text-xs font-normal text-slate-400">(optional)</span>}
        </label>
        {max != null && (
          <span className={cn("text-[11px] tabular-nums", count > max ? "text-rose-600" : "text-slate-400")}>
            {count}/{max}
          </span>
        )}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-rose-600">{error}</p>
      ) : description ? (
        <p id={`${id}-desc`} className="text-xs text-slate-500">{description}</p>
      ) : null}
    </div>
  );
}
