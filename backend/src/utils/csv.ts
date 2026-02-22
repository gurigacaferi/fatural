/**
 * CSV generation utility for expense exports.
 * Supports configurable columns matching Kosovo accounting requirements.
 */
import { format, addDays } from "date-fns";

export interface ExpenseRow {
  id: string;
  name: string;
  category: string;
  amount: number;
  date: string;
  merchant: string | null;
  tvsh_percentage: number;
  vat_code: string | null;
  nui: string | null;
  nr_fiskal: string | null;
  numri_i_tvsh_se: string | null;
  description: string | null;
  sasia: number | null;
  njesia: string | null;
}

interface ColumnDef {
  header: string;
  accessor: (row: ExpenseRow) => string | number | null;
}

const COLUMN_MAP: Record<string, ColumnDef> = {
  date: {
    header: "Bill Date",
    accessor: (e) => format(new Date(e.date), "yyyy-MM-dd"),
  },
  merchant: { header: "Supplier", accessor: (e) => e.merchant },
  name: { header: "Line Description", accessor: (e) => e.name },
  category: { header: "Account", accessor: (e) => e.category },
  amount: { header: "Line Amount", accessor: (e) => Number(e.amount).toFixed(2) },
  vat_code: { header: "Line Tax Code", accessor: (e) => e.vat_code },
  tvsh_percentage: { header: "TVSH (%)", accessor: (e) => e.tvsh_percentage },
  nui: { header: "NUI", accessor: (e) => e.nui },
  nr_fiskal: { header: "Nr. Fiskal", accessor: (e) => e.nr_fiskal },
  numri_i_tvsh_se: { header: "Numri i TVSH-se", accessor: (e) => e.numri_i_tvsh_se },
  description: { header: "Description", accessor: (e) => e.description },
  sasia: { header: "Sasia", accessor: (e) => e.sasia },
  njesia: { header: "Njesia", accessor: (e) => e.njesia },
  // Accounting system fixed columns
  dueDate: {
    header: "Due Date",
    accessor: (e) => format(addDays(new Date(e.date), 30), "yyyy-MM-dd"),
  },
  billNo: {
    header: "Bill No",
    accessor: (e) => `EXP-${e.id.substring(0, 8)}`,
  },
};

const ACCOUNTING_COLUMNS = ["dueDate", "billNo"];

export const DEFAULT_EXPORT_COLUMNS = [
  "date", "merchant", "name", "category", "amount", "vat_code", "sasia", "njesia",
];

export const ALL_EXPORT_COLUMN_KEYS = Object.keys(COLUMN_MAP).filter(
  (k) => !ACCOUNTING_COLUMNS.includes(k)
);

/**
 * Build a CSV string from an array of expenses.
 */
export function buildCsvString(
  expenses: ExpenseRow[],
  selectedColumns: string[] = DEFAULT_EXPORT_COLUMNS
): string {
  const cols = [...new Set([...selectedColumns, ...ACCOUNTING_COLUMNS])]
    .map((k) => COLUMN_MAP[k])
    .filter(Boolean);

  const header = cols.map((c) => `"${c.header}"`).join(",");
  const rows = expenses.map((exp) =>
    cols
      .map((c) => {
        const v = c.accessor(exp);
        if (v === null || v === undefined) return '""';
        if (typeof v === "string") return `"${v.replace(/"/g, '""')}"`;
        return v;
      })
      .join(",")
  );

  return [header, ...rows].join("\n");
}
