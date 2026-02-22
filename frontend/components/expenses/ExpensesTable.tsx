"use client";

import { useState, useEffect, useMemo } from "react";
import { apiGet, apiDelete, apiPost } from "@/lib/api";
import { useDebounce } from "@/hooks/useDebounce";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/utils";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import {
  Search, Trash2, Download, Pencil, ChevronLeft, ChevronRight,
  ArrowUpDown, Eye, Loader2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface Expense {
  id: string;
  name: string;
  category: string;
  amount: number;
  date: string;
  merchant: string | null;
  vat_code: string;
  tvsh_percentage: number;
  nui: string | null;
  nr_fiskal: string | null;
  numri_i_tvsh_se: string | null;
  sasia: number;
  njesia: string;
  description: string | null;
  bill_id: string | null;
  page_number: number;
  quickbooks_synced: boolean;
  created_at: string;
}

interface ExpensesTableProps {
  onEdit: (expense: Expense) => void;
  onViewReceipt: (billId: string) => void;
  onExport: (ids: string[]) => void;
  refreshKey?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ExpensesTable({
  onEdit,
  onViewReceipt,
  onExport,
  refreshKey,
}: ExpensesTableProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const debouncedSearch = useDebounce(search, 300);

  // Fetch
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (category) params.set("category", category);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);

    apiGet<{ expenses: Expense[]; total: number }>(`/expenses?${params}`)
      .then((data) => {
        setExpenses(data.expenses);
        setTotal(data.total);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, pageSize, debouncedSearch, category, dateFrom, dateTo, refreshKey]);

  const totalPages = Math.ceil(total / pageSize);

  // Selection helpers
  const allSelected = expenses.length > 0 && expenses.every((e) => selected.has(e.id));
  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(expenses.map((e) => e.id)));
    }
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  // Bulk actions
  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Fshi ${selected.size} shpenzimet e zgjedhura?`)) return;
    try {
      await apiPost("/expenses/bulk-delete", { ids: Array.from(selected) });
      setSelected(new Set());
      setPage(1);
    } catch (err) {
      console.error(err);
    }
  };

  const handleBulkExport = () => {
    onExport(Array.from(selected));
  };

  // Sum of selected
  const selectedSum = useMemo(() => {
    return expenses
      .filter((e) => selected.has(e.id))
      .reduce((sum, e) => sum + e.amount, 0);
  }, [expenses, selected]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Kërko shpenzime..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={(v) => { setCategory(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Të gjitha kategoritë" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Të gjitha kategoritë</SelectItem>
            {EXPENSE_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          className="w-[150px]"
          placeholder="Nga"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          className="w-[150px]"
          placeholder="Deri"
        />
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
          <span className="text-sm font-medium">
            {selected.size} zgjedhur • {formatCurrency(selectedSum)}
          </span>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={handleBulkExport}>
            <Download className="h-4 w-4 mr-1" /> Eksporto
          </Button>
          <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
            <Trash2 className="h-4 w-4 mr-1" /> Fshi
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="w-10 p-3">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              </th>
              <th className="text-left p-3 font-medium">Data</th>
              <th className="text-left p-3 font-medium">Furnitori</th>
              <th className="text-left p-3 font-medium">Përshkrimi</th>
              <th className="text-left p-3 font-medium">Kategoria</th>
              <th className="text-right p-3 font-medium">Shuma</th>
              <th className="text-left p-3 font-medium">TVSH</th>
              <th className="w-10 p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </td>
              </tr>
            ) : expenses.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-muted-foreground">
                  Nuk u gjetën shpenzime
                </td>
              </tr>
            ) : (
              expenses.map((exp) => (
                <tr
                  key={exp.id}
                  className="border-b hover:bg-muted/50 transition-colors"
                >
                  <td className="p-3">
                    <Checkbox
                      checked={selected.has(exp.id)}
                      onCheckedChange={() => toggleOne(exp.id)}
                    />
                  </td>
                  <td className="p-3 whitespace-nowrap">{formatDate(exp.date)}</td>
                  <td className="p-3">{exp.merchant || "—"}</td>
                  <td className="p-3 max-w-[200px] truncate">{exp.name}</td>
                  <td className="p-3">
                    <Badge variant="secondary" className="text-xs font-normal whitespace-nowrap">
                      {exp.category}
                    </Badge>
                  </td>
                  <td className="p-3 text-right font-mono">{formatCurrency(exp.amount)}</td>
                  <td className="p-3 whitespace-nowrap">
                    {exp.vat_code !== "No VAT" && (
                      <Badge variant="outline" className="text-xs">
                        {exp.vat_code}
                      </Badge>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(exp)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {exp.bill_id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => onViewReceipt(exp.bill_id!)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total} shpenzime gjithsej
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm">
            Faqja {page} / {Math.max(1, totalPages)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
