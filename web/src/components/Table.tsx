/**
 * Table — a typed generic render-only table.
 *
 * `rows` are passed in already-wrapped (Simulated data upstream) — the table
 * itself is business-logic-free and only maps cells to columns.
 */

import type { ReactNode } from "react";

export interface ColumnSpec<Row> {
  readonly header: string;
  readonly render: (row: Row) => ReactNode;
}

export interface TableProps<Row> {
  readonly columns: readonly ColumnSpec<Row>[];
  readonly rows: readonly Row[];
  readonly emptyLabel: string;
}

export function Table<Row>({ columns, rows, emptyLabel }: TableProps<Row>) {
  if (rows.length === 0) {
    return <p className="lg-table__empty">{emptyLabel}</p>;
  }
  return (
    <table className="lg-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <th scope="col" key={col.header}>
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {columns.map((col) => (
              <td key={col.header}>{col.render(row)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
