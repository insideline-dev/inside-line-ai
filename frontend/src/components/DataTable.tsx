import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Column<T> = {
  header: ReactNode;
  accessor?: keyof T;
  cell?: (row: T) => React.ReactNode;
  className?: string;
  numeric?: boolean;
};

interface DataTableProps<T> {
  data: T[];
  columns: Array<Column<T>>;
  rowKey?: (row: T, index: number) => string;
  emptyState?: ReactNode;
}

export function DataTable<T>({
  data,
  columns,
  rowKey,
  emptyState,
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground text-pretty">
        {emptyState || "No results yet."}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr className="border-b">
            {columns.map((column, index) => (
              <th
                key={index}
                className={cn(
                  "text-left py-3 px-4 font-medium text-sm text-muted-foreground text-balance",
                  column.numeric && "text-right tabular-nums",
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr
              key={rowKey ? rowKey(row, rowIndex) : String(rowIndex)}
              className="border-b hover:bg-muted/50"
            >
              {columns.map((column, columnIndex) => {
                const value =
                  column.accessor !== undefined
                    ? (row as Record<string, unknown>)[
                        column.accessor as string
                      ]
                    : undefined;
                const content = column.cell
                  ? column.cell(row)
                  : column.accessor
                    ? String(value ?? "")
                    : "";
                return (
                  <td
                    key={columnIndex}
                    className={cn(
                      "py-3 px-4 text-sm text-pretty",
                      column.numeric && "text-right tabular-nums",
                      column.className,
                    )}
                  >
                    {content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
