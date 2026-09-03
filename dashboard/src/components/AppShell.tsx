import type { CSSProperties } from "react";
import { Outlet } from "react-router-dom";

import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

import { Sidebar } from "./Sidebar.js";

export function AppShell() {
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "220px" } as CSSProperties}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Sidebar />
      <SidebarInset>
        <div className="flex items-center px-4 py-2 md:hidden">
          <SidebarTrigger />
        </div>
        <div
          className="mx-auto w-full max-w-[1120px] px-8 py-7"
          id="main"
        >
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
