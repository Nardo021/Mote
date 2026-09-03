import { Outlet } from "react-router-dom";
import { Monitor, UserCog, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Separator } from "@/components/ui/separator";

import { AppHeader } from "../../components/layout/app-header.js";
import { Main } from "../../components/layout/main.js";
import { SidebarNav } from "./sidebar-nav.js";

export function SettingsLayout() {
  const { t } = useTranslation();
  const items = [
    {
      title: t("settings.profile"),
      href: "/settings",
      icon: <UserCog />,
    },
    {
      title: t("settings.account"),
      href: "/settings/account",
      icon: <Wrench />,
    },
    {
      title: t("settings.relay"),
      href: "/settings/relay",
      icon: <Monitor />,
    },
  ];

  return (
    <>
      <AppHeader />
      <Main fixed>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          {t("settings.title")}
        </h1>
        <Separator className="my-4 lg:my-6" />
        <div className="flex flex-1 flex-col gap-2 overflow-hidden lg:flex-row lg:gap-12">
          <aside className="top-0 lg:sticky lg:w-1/5">
            <SidebarNav items={items} />
          </aside>
          <div className="w-full overflow-y-auto p-1">
            <Outlet />
          </div>
        </div>
      </Main>
    </>
  );
}
