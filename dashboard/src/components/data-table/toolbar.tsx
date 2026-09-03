import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Table } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { DataTableFacetedFilter, type FacetOption } from "./faceted-filter.js";
import { DataTableViewOptions } from "./view-options.js";

export type ToolbarFilter = {
  columnId: string;
  title: string;
  options: FacetOption[];
};

export function DataTableToolbar<TData>({
  table,
  searchPlaceholder,
  searchKey,
  filters = [],
}: {
  table: Table<TData>;
  searchPlaceholder?: string;
  searchKey?: string;
  filters?: ToolbarFilter[];
}) {
  const { t } = useTranslation();
  const isFiltered =
    table.getState().columnFilters.length > 0 ||
    Boolean(table.getState().globalFilter);

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-1 flex-col-reverse items-start gap-2 sm:flex-row sm:items-center">
        {searchKey ? (
          <Input
            placeholder={searchPlaceholder ?? t("table.filter")}
            value={(table.getColumn(searchKey)?.getFilterValue() as string) ?? ""}
            onChange={(event) =>
              table.getColumn(searchKey)?.setFilterValue(event.target.value)
            }
            className="h-8 w-full sm:w-40 lg:w-64"
          />
        ) : (
          <Input
            placeholder={searchPlaceholder ?? t("table.filter")}
            value={table.getState().globalFilter ?? ""}
            onChange={(event) => table.setGlobalFilter(event.target.value)}
            className="h-8 w-full sm:w-40 lg:w-64"
          />
        )}
        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => {
            const column = table.getColumn(filter.columnId);
            if (!column) {
              return null;
            }
            return (
              <DataTableFacetedFilter
                key={filter.columnId}
                column={column}
                title={filter.title}
                options={filter.options}
              />
            );
          })}
        </div>
        {isFiltered ? (
          <Button
            variant="ghost"
            className="h-8 px-2 lg:px-3"
            onClick={() => {
              table.resetColumnFilters();
              table.setGlobalFilter("");
            }}
          >
            {t("table.reset")}
            <X data-icon="inline-end" />
          </Button>
        ) : null}
      </div>
      <DataTableViewOptions table={table} />
    </div>
  );
}
