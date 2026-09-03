import type { Table as TanstackTable } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { DataTablePagination } from "./pagination.js";
import { DataTableToolbar, type ToolbarFilter } from "./toolbar.js";

export function DataTable<TData>({
  table,
  emptyTitle,
  emptyDescription,
  searchKey,
  searchPlaceholder,
  filters,
}: {
  table: TanstackTable<TData>;
  emptyTitle: string;
  emptyDescription?: string;
  searchKey?: string;
  searchPlaceholder?: string;
  filters?: ToolbarFilter[];
}) {
  const rows = table.getRowModel().rows;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <DataTableToolbar
        table={table}
        {...(searchKey !== undefined ? { searchKey } : {})}
        {...(searchPlaceholder !== undefined ? { searchPlaceholder } : {})}
        {...(filters !== undefined ? { filters } : {})}
      />
      {rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{emptyTitle}</EmptyTitle>
            {emptyDescription ? (
              <EmptyDescription>{emptyDescription}</EmptyDescription>
            ) : null}
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <DataTablePagination table={table} />
    </div>
  );
}
