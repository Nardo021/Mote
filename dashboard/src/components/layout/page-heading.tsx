import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap justify-between gap-2",
        description ? "items-end" : "items-center",
      )}
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
