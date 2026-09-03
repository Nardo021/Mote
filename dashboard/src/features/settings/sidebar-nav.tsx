import type { ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

import { buttonVariants } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type SettingsNavItem = {
  href: string;
  title: string;
  icon: ReactNode;
};

export function SidebarNav({ items }: { items: SettingsNavItem[] }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <>
      <div className="p-1 md:hidden">
        <Select
          value={pathname}
          onValueChange={(value) => {
            if (typeof value === "string") {
              void navigate(value);
            }
          }}
        >
          <SelectTrigger className="h-12 sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {items.map((item) => (
                <SelectItem key={item.href} value={item.href}>
                  <span className="flex items-center gap-2">
                    {item.icon}
                    {item.title}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <ScrollArea className="hidden w-full min-w-40 bg-background px-1 py-2 md:block">
        <nav className="flex gap-2 py-1 lg:flex-col lg:gap-1">
          {items.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              end
              className={({ isActive }) =>
                cn(
                  buttonVariants({ variant: "ghost" }),
                  "justify-start",
                  isActive ? "bg-muted hover:bg-accent" : "hover:bg-accent hover:underline",
                )
              }
            >
              <span className="me-2">{item.icon}</span>
              {item.title}
            </NavLink>
          ))}
        </nav>
      </ScrollArea>
    </>
  );
}
