import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";

type SectionProps = {
  title: string;
  children: ReactNode;
};

export function Section({ title, children }: SectionProps) {
  return (
    <section className="mb-7">
      <h2 className="mb-2.5 text-[13px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function PropertyList({ children }: { children: ReactNode }) {
  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-col divide-y divide-border">{children}</div>
    </Card>
  );
}

export function PropertyRow({
  label,
  children,
}: {
  label?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-11 grid-cols-1 items-center px-4 py-2 sm:grid-cols-[180px_1fr]">
      {label !== undefined ? (
        <span className="text-muted-foreground">{label}</span>
      ) : null}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function ActionPanel({ children }: { children: ReactNode }) {
  return (
    <Card className="py-4">
      <CardContent className="flex flex-wrap gap-2">{children}</CardContent>
    </Card>
  );
}
