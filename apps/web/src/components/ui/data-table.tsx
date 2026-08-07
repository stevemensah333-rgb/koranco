import type { ReactNode } from "react";

export type TableColumn<Row> = {
  align?: "left" | "numeric";
  header: string;
  key: string;
  render: (row: Row) => ReactNode;
};

type DataTableProps<Row> = {
  caption: string;
  columns: TableColumn<Row>[];
  emptyMessage?: string;
  getRowKey: (row: Row) => string;
  loading?: boolean;
  rows: Row[];
};

export function DataTable<Row>({
  caption,
  columns,
  emptyMessage = "No records to display.",
  getRowKey,
  loading = false,
  rows,
}: DataTableProps<Row>) {
  const message = loading ? "Loading records…" : emptyMessage;

  return (
    <div
      className="table-frame"
      tabIndex={0}
      aria-label={`${caption}, scrollable table`}
    >
      <table className="data-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                className={
                  column.align === "numeric" ? "cell-numeric" : undefined
                }
                key={column.key}
                scope="col"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading || rows.length === 0 ? (
            <tr>
              <td className="table-message" colSpan={columns.length}>
                {message}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={getRowKey(row)}>
                {columns.map((column) => (
                  <td
                    className={
                      column.align === "numeric" ? "cell-numeric" : undefined
                    }
                    key={column.key}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
