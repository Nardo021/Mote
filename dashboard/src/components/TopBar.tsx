import type { ReactNode } from "react";

type TopBarProps = {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
};

export function TopBar({ title, subtitle, action }: TopBarProps) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}
