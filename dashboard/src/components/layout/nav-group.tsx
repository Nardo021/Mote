import type { LucideIcon } from "lucide-react";
import { NavLink, useMatch } from "react-router-dom";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export type SidebarLink = {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  badge?: number;
};

export function NavGroup({
  title,
  items,
}: {
  title: string;
  items: SidebarLink[];
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function NavItem({ to, label, icon: Icon, end = false, badge }: SidebarLink) {
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
      {badge !== undefined && badge > 0 ? (
        <SidebarMenuBadge>{badge}</SidebarMenuBadge>
      ) : null}
    </SidebarMenuItem>
  );
}
