import type { LucideIcon } from "lucide-react";

export type SidebarNavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  badge?: number;
  end?: boolean;
};

export type SidebarNavGroup = {
  title: string;
  items: SidebarNavItem[];
};

export type SidebarData = {
  navGroups: SidebarNavGroup[];
};
