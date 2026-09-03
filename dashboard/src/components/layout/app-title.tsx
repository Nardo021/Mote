import { Link } from "react-router-dom";

import { useSidebar } from "@/components/ui/sidebar";

import { MoteMark } from "../Icons.js";

export function AppTitle() {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <Link
      to="/"
      aria-label="Mote"
      onClick={() => {
        if (isMobile) {
          setOpenMobile(false);
        }
      }}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
    >
      <MoteMark />
      <span className="text-sm font-semibold group-data-[collapsible=icon]:hidden">
        Mote
      </span>
    </Link>
  );
}
