import { ArrowDown, ArrowUp, ChevronsUpDown, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Column } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: {
  column: Column<TData, TValue>;
  title: string;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>;
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="sm" className="h-8" />}
        >
          <span>{title}</span>
          {column.getIsSorted() === "desc" ? (
            <ArrowDown data-icon="inline-end" />
          ) : column.getIsSorted() === "asc" ? (
            <ArrowUp data-icon="inline-end" />
          ) : (
            <ChevronsUpDown data-icon="inline-end" />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
              <ArrowUp />
              {t("table.asc")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
              <ArrowDown />
              {t("table.desc")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {column.getCanHide() ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
                  <EyeOff />
                  {t("table.hide")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
