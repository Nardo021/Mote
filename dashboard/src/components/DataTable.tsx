import type { ReactNode } from "react";

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
    <div className="table-wrap panel">
      <table className="data">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)}>
              {columns.map((column) => (
                <td key={column.key}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
