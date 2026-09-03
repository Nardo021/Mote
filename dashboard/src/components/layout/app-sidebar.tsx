import { useTranslation } from "react-i18next";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";

import { useLayout } from "../../context/layout-provider.js";
import { usePairing } from "../../pairing/PairingProvider.js";
import { AppTitle } from "./app-title.js";
import { createSidebarData } from "./data/sidebar-data.js";
import { NavGroup } from "./nav-group.js";
import { NavUser } from "./nav-user.js";

export function AppSidebar() {
  const { t } = useTranslation();
  const { requests } = usePairing();
  const { collapsible, variant } = useLayout();
  const data = createSidebarData(t, requests.length);

  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader>
        <AppTitle />
      </SidebarHeader>
      <SidebarContent>
        {data.navGroups.map((group) => (
          <NavGroup
            key={group.title}
            title={group.title}
            items={group.items.map((item) => ({
              to: item.url,
              label: item.title,
              icon: item.icon,
              ...(item.end !== undefined ? { end: item.end } : {}),
              ...(item.badge !== undefined ? { badge: item.badge } : {}),
            }))}
          />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
