import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { LoadingState } from "../LoadingState.js";
import { AppHeader } from "./app-header.js";
import { Main } from "./main.js";

export const dashboardListClass = "flex flex-1 flex-col gap-4 sm:gap-6";

export function DashboardPage({
  ready,
  fixed = true,
  className,
  children,
}: {
  ready: boolean;
  fixed?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <>
      <AppHeader {...(fixed ? { fixed: true } : {})} />
      <Main {...(ready && className !== undefined ? { className } : {})}>
        {ready ? children : <LoadingState label={t("common.loading")} />}
      </Main>
    </>
  );
}
