import { Activity, KeyRound, LayoutDashboard, Monitor, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";

import { usePairing } from "../../pairing/PairingProvider.js";
import { AppTitle } from "./app-title.js";
import { NavGroup } from "./nav-group.js";
import { NavUser } from "./nav-user.js";

export function AppSidebar() {
  const { t } = useTranslation();
  const { requests } = usePairing();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <AppTitle />
      </SidebarHeader>
      <SidebarContent>
        <NavGroup
          title={t("nav.general")}
          items={[
            {
              to: "/",
              label: t("nav.overview"),
              icon: LayoutDashboard,
              end: true,
            },
            {
              to: "/devices",
              label: t("nav.devices"),
              icon: Monitor,
              badge: requests.length,
            },
            {
              to: "/activity",
              label: t("nav.activity"),
              icon: Activity,
            },
          ]}
        />
        <NavGroup
          title={t("nav.access")}
          items={[
            { to: "/tokens", label: t("nav.tokens"), icon: KeyRound },
          ]}
        />
        <NavGroup
          title={t("nav.other")}
          items={[
            { to: "/settings", label: t("nav.settings"), icon: Settings },
          ]}
        />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
