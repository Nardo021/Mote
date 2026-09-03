import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Table } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, getPageNumbers } from "@/lib/utils";

export function DataTablePagination<TData>({
  table,
  className,
}: {
  table: Table<TData>;
  className?: string;
}) {
  const { t } = useTranslation();
  const currentPage = table.getState().pagination.pageIndex + 1;
  const totalPages = Math.max(table.getPageCount(), 1);
  const pageNumbers = getPageNumbers(currentPage, totalPages);

  return (
    <div
      className={cn(
        "flex items-center justify-between px-2",
        "@max-2xl/content:flex-col-reverse @max-2xl/content:gap-4",
        className,
      )}
    >
      <div className="flex w-full items-center justify-between">
        <div className="flex w-25 items-center justify-center text-sm font-medium @2xl/content:hidden">
          {t("table.pageOf", { current: currentPage, total: totalPages })}
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(table.getState().pagination.pageSize)}
            onValueChange={(value) => {
              table.setPageSize(Number(value));
            }}
          >
            <SelectTrigger className="h-8 w-18">
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="top">
              <SelectGroup>
                {[10, 20, 30, 40, 50].map((pageSize) => (
                  <SelectItem key={pageSize} value={String(pageSize)}>
                    {pageSize}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <p className="hidden text-sm font-medium sm:block">
            {t("table.rowsPerPage")}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-6 lg:gap-8">
        <div className="flex w-25 items-center justify-center text-sm font-medium @max-3xl/content:hidden">
          {t("table.pageOf", { current: currentPage, total: totalPages })}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="hidden size-8 @md/content:flex"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            aria-label={t("table.firstPage")}
          >
            <ChevronsLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label={t("table.previousPage")}
          >
            <ChevronLeft />
          </Button>
          {pageNumbers.map((pageNumber, index) =>
            pageNumber === "..." ? (
              <span
                key={`ellipsis-${index}`}
                className="px-1 text-sm text-muted-foreground"
              >
                …
              </span>
            ) : (
              <Button
                key={pageNumber}
                variant={currentPage === pageNumber ? "default" : "outline"}
                className="h-8 min-w-8 px-2"
                onClick={() => table.setPageIndex(pageNumber - 1)}
                aria-label={t("table.goToPage", { page: pageNumber })}
              >
                {pageNumber}
              </Button>
            ),
          )}
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label={t("table.nextPage")}
          >
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="hidden size-8 @md/content:flex"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
            aria-label={t("table.lastPage")}
          >
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
