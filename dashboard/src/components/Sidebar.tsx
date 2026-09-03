import {
  Activity,
  KeyRound,
  LayoutDashboard,
  Monitor,
  Settings,
} from "lucide-react";
import { NavLink, useMatch } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

import { useAuth } from "../hooks/useAuth.js";
import { MoteMark } from "./Icons.js";

const LINKS = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/devices", label: "Devices", icon: Monitor, end: false },
  { to: "/tokens", label: "Tokens", icon: KeyRound, end: false },
  { to: "/activity", label: "Activity", icon: Activity, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
] as const;

function SidebarNavItem({
  to,
  label,
  icon: Icon,
  end,
}: (typeof LINKS)[number]) {
  const match = useMatch({ path: to, end });
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={match !== null}
        tooltip={label}
        render={
          <NavLink
            to={to}
            end={end}
            onClick={() => {
              if (isMobile) {
                setOpenMobile(false);
              }
            }}
          />
        }
      >
        <Icon />
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function Sidebar() {
  const { user, signOut } = useAuth();

  return (
    <SidebarRoot collapsible="offcanvas">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-2 py-1.5 text-[15px] font-semibold">
          <MoteMark />
          <span>Mote</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {LINKS.map((link) => (
                <SidebarNavItem key={link.to} {...link} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex flex-col gap-2 px-2 pb-1">
          <div className="text-[11px] text-muted-foreground">Administrator</div>
          <div>{user?.username ?? "—"}</div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => void signOut()}
          >
            Sign Out
          </Button>
        </div>
      </SidebarFooter>
    </SidebarRoot>
  );
}
