import type { ReactNode } from "react";

import { Header } from "./layout/header.js";
import { Main } from "./layout/main.js";
import { LanguageSwitch } from "./language-switch.js";
import { PairingBanner } from "./pairing-banner.js";
import { Search } from "./search.js";
import { ThemeSwitch } from "./theme-switch.js";

export function PageShell({
  children,
  headerEnd,
}: {
  children: ReactNode;
  headerEnd?: ReactNode;
}) {
  return (
    <>
      <Header>
        <Search className="ms-auto" />
        <LanguageSwitch />
        <ThemeSwitch />
        {headerEnd}
      </Header>
      <PairingBanner />
      <Main>{children}</Main>
    </>
  );
}

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
    <div className="flex flex-wrap items-end justify-between gap-3">
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
