import { Activity, KeyRound, LayoutDashboard, Monitor, Settings } from "lucide-react";
import type { TFunction } from "i18next";

import type { SidebarData } from "../types.js";

export function createSidebarData(
  t: TFunction,
  pairCount: number,
): SidebarData {
  return {
    navGroups: [
      {
        title: t("nav.general"),
        items: [
          {
            title: t("nav.overview"),
            url: "/",
            icon: LayoutDashboard,
            end: true,
          },
          {
            title: t("nav.devices"),
            url: "/devices",
            icon: Monitor,
            badge: pairCount,
          },
          {
            title: t("nav.activity"),
            url: "/activity",
            icon: Activity,
          },
        ],
      },
      {
        title: t("nav.access"),
        items: [
          {
            title: t("nav.tokens"),
            url: "/tokens",
            icon: KeyRound,
          },
        ],
      },
      {
        title: t("nav.other"),
        items: [
          {
            title: t("nav.settings"),
            url: "/settings",
            icon: Settings,
          },
        ],
      },
    ],
  };
}
