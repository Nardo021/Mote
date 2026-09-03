import { Outlet } from "react-router-dom";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

import { LayoutProvider } from "../../context/layout-provider.js";
import { SearchProvider } from "../../context/search-provider.js";
import { getCookie } from "../../lib/cookies.js";
import { PairingProvider } from "../../pairing/PairingProvider.js";
import { CommandMenu } from "../command-menu.js";
import { SkipToMain } from "../skip-to-main.js";
import { AppSidebar } from "./app-sidebar.js";

export function AuthenticatedLayout() {
  const defaultOpen = getCookie("sidebar_state") !== "false";
  return (
    <PairingProvider>
      <SearchProvider>
        <LayoutProvider>
          <SidebarProvider defaultOpen={defaultOpen}>
            <SkipToMain />
            <AppSidebar />
            <SidebarInset
              className={cn(
                "@container/content",
                "has-data-[layout=fixed]:h-svh",
                "peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100svh-(var(--spacing)*4))]",
              )}
            >
              <Outlet />
            </SidebarInset>
            <CommandMenu />
          </SidebarProvider>
        </LayoutProvider>
      </SearchProvider>
    </PairingProvider>
  );
}
