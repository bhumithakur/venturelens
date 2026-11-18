import { Card, CardContent } from "@/components/ui/card";

export function Placeholder({ title }) {
  return (
    <Card>
      <CardContent className="p-10 text-center">
        <p className="text-sm font-medium text-slate-900">{title}</p>
        <p className="mt-1 text-sm text-slate-500">This screen is coming next.</p>
      </CardContent>
    </Card>
  );
}
