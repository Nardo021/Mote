import { Menu } from "lucide-react";
import { NavLink } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type TopNavLink = {
  title: string;
  href: string;
  isActive: boolean;
  disabled?: boolean;
};

export function TopNav({
  className,
  links,
}: {
  className?: string;
  links: TopNavLink[];
}) {
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              size="icon"
              variant="outline"
              className={cn("md:size-7 lg:hidden", className)}
            />
          }
        >
          <Menu />
          <span className="sr-only">Toggle navigation menu</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start">
          <DropdownMenuGroup>
            {links.map((link) => (
              <DropdownMenuItem
                key={`${link.title}-${link.href}`}
                disabled={link.disabled}
                render={
                  <NavLink
                    to={link.href}
                    className={
                      link.isActive ? "" : "text-muted-foreground"
                    }
                  />
                }
              >
                {link.title}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <nav
        className={cn(
          "hidden items-center gap-4 lg:flex xl:gap-6",
          className,
        )}
      >
        {links.map((link) =>
          link.disabled ? (
            <span
              key={`${link.title}-${link.href}`}
              className="text-sm font-medium text-muted-foreground"
            >
              {link.title}
            </span>
          ) : (
            <NavLink
              key={`${link.title}-${link.href}`}
              to={link.href}
              className={cn(
                "text-sm font-medium transition-colors hover:text-primary",
                !link.isActive && "text-muted-foreground",
              )}
            >
              {link.title}
            </NavLink>
          ),
        )}
      </nav>
    </>
  );
}
