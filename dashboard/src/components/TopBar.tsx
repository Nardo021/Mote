import type { ReactNode } from "react";

type TopBarProps = {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
};

export function TopBar({ title, subtitle, action }: TopBarProps) {
  return (
    <header className="topbar">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="topbar-sub">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}
