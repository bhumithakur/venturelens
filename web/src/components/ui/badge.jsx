import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", {
  variants: {
    variant: {
      default: "bg-brand-50 text-brand-700 ring-brand-100",
      neutral: "bg-slate-50 text-slate-600 ring-slate-200",
      success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
      warning: "bg-amber-50 text-amber-700 ring-amber-200",
      danger: "bg-rose-50 text-rose-700 ring-rose-200",
    },
  },
  defaultVariants: { variant: "default" },
});

export const Badge = ({ className, variant, ...p }) => <span className={cn(badgeVariants({ variant }), className)} {...p} />;
