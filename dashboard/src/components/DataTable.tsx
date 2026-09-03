import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { EmptyState } from "./EmptyState.js";

type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  emptyTitle: string;
  emptyDescription?: string;
  getRowKey: (row: T) => string;
};

export function DataTable<T>({
  columns,
  rows,
  emptyTitle,
  emptyDescription,
  getRowKey,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return emptyDescription === undefined ? (
      <EmptyState title={emptyTitle} />
    ) : (
      <EmptyState title={emptyTitle} description={emptyDescription} />
    );
  }
  return (
    <Card className="gap-0 py-0">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.key}>{column.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={getRowKey(row)}>
              {columns.map((column) => (
                <TableCell key={column.key}>{column.render(row)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
