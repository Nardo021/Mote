import type { HTMLAttributes, Ref } from "react";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type HeaderProps = HTMLAttributes<HTMLElement> & {
  ref?: Ref<HTMLElement>;
};

export function Header({ className, children, ...props }: HeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-50 h-16 shrink-0 bg-background/80 backdrop-blur-lg",
        className,
      )}
      {...props}
    >
      <div className="relative flex h-full items-center gap-3 p-4 sm:gap-4">
        <SidebarTrigger variant="outline" />
        <Separator orientation="vertical" className="h-6" />
        {children}
      </div>
    </header>
  );
}
