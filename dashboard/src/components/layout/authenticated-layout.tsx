import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

import { PairingProvider } from "../../pairing/PairingProvider.js";
import { CommandMenu } from "../command-menu.js";
import { AppSidebar } from "./app-sidebar.js";

export function AuthenticatedLayout() {
  const { t } = useTranslation();
  return (
    <PairingProvider>
      <SidebarProvider>
        <a className="skip-link" href="#main">
          {t("common.skipToContent")}
        </a>
        <AppSidebar />
        <SidebarInset className="@container/content min-h-svh">
          <Outlet />
        </SidebarInset>
        <CommandMenu />
      </SidebarProvider>
    </PairingProvider>
  );
}
