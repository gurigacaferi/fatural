"use client";

import { useState } from "react";
import { apiPost, apiGet } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EXPENSE_CATEGORIES, VAT_CODES, NJESIA_OPTIONS } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import { Plus, Trash2, Loader2, Split, Eye } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SplitExpense {
  tempId: string;
  name: string;
  category: string;
  amount: number;
  date: string;
  merchant: string;
  vatCode: string;
  tvshPercentage: number;
  nui: string;
  nrFiskal: string;
  numriITvshSe: string;
  sasia: number;
  njesia: string;
  description: string;
  pageNumber: number;
}

interface ExpenseSplitterDialogProps {
  billId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  onViewReceipt: (billId: string) => void;
}

function defaultExpense(page: number = 1): SplitExpense {
  return {
    tempId: crypto.randomUUID(),
    name: "",
    category: "690-09 Te tjera",
    amount: 0,
    date: new Date().toISOString().slice(0, 10),
    merchant: "",
    vatCode: "No VAT",
    tvshPercentage: 0,
    nui: "",
    nrFiskal: "",
    numriITvshSe: "",
    sasia: 1,
    njesia: "cope",
    description: "",
    pageNumber: page,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ExpenseSplitterDialog({
  billId,
  open,
  onOpenChange,
  onSaved,
  onViewReceipt,
}: ExpenseSplitterDialogProps) {
  const [expenses, setExpenses] = useState<SplitExpense[]>([defaultExpense()]);
  const [saving, setSaving] = useState(false);
  const [loadingBill, setLoadingBill] = useState(false);

  // Load existing expenses for this bill
  const loadFromBill = async () => {
    setLoadingBill(true);
    try {
      const data = await apiGet<{ expenses: any[] }>(`/bills/${billId}/expenses`);
      if (data.expenses.length > 0) {
        setExpenses(
          data.expenses.map((e: any) => ({
            tempId: e.id,
            name: e.name || "",
            category: e.category || "690-09 Te tjera",
            amount: e.amount || 0,
            date: e.date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
            merchant: e.merchant || "",
            vatCode: e.vat_code || "No VAT",
            tvshPercentage: e.tvsh_percentage || 0,
            nui: e.nui || "",
            nrFiskal: e.nr_fiskal || "",
            numriITvshSe: e.numri_i_tvsh_se || "",
            sasia: e.sasia || 1,
            njesia: e.njesia || "cope",
            description: e.description || "",
            pageNumber: e.page_number || 1,
          }))
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingBill(false);
    }
  };

  const addRow = () => {
    setExpenses((prev) => [...prev, defaultExpense(prev.length + 1)]);
  };

  const removeRow = (tempId: string) => {
    setExpenses((prev) => prev.filter((e) => e.tempId !== tempId));
  };

  const updateRow = (tempId: string, key: string, value: any) => {
    setExpenses((prev) =>
      prev.map((e) => (e.tempId === tempId ? { ...e, [key]: value } : e))
    );
  };

  const totalAmount = expenses.reduce((s, e) => s + (e.amount || 0), 0);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiPost("/expenses", {
        expenses: expenses.map((e) => ({
          ...e,
          billId,
        })),
      });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Split className="h-5 w-5" /> Ndaj faturën në shpenzime
          </DialogTitle>
          <DialogDescription>
            Shtoni ose ndryshoni shpenzimet e nxjerra nga kjo faturë
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-4">
          <Button variant="outline" size="sm" onClick={loadFromBill} disabled={loadingBill}>
            {loadingBill ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Ngarko nga fatura
          </Button>
          <Button variant="outline" size="sm" onClick={() => onViewReceipt(billId)}>
            <Eye className="h-4 w-4 mr-1" /> Shiko faturën
          </Button>
          <div className="flex-1" />
          <span className="text-sm font-medium">
            Total: {formatCurrency(totalAmount)} • {expenses.length} zëra
          </span>
        </div>

        <div className="space-y-4">
          {expenses.map((exp, index) => (
            <div key={exp.tempId} className="border rounded-lg p-4 space-y-3 relative">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  Zëri #{index + 1}
                </span>
                {expenses.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => removeRow(exp.tempId)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Përshkrimi</Label>
                  <Input
                    value={exp.name}
                    onChange={(e) => updateRow(exp.tempId, "name", e.target.value)}
                    placeholder="Emri i shpenzimit"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Kategoria</Label>
                  <Select
                    value={exp.category}
                    onValueChange={(v) => updateRow(exp.tempId, "category", v)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Shuma (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={exp.amount}
                    onChange={(e) => updateRow(exp.tempId, "amount", parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Data</Label>
                  <Input
                    type="date"
                    value={exp.date}
                    onChange={(e) => updateRow(exp.tempId, "date", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Furnitori</Label>
                  <Input
                    value={exp.merchant}
                    onChange={(e) => updateRow(exp.tempId, "merchant", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Kodi TVSH</Label>
                  <Select
                    value={exp.vatCode}
                    onValueChange={(v) => updateRow(exp.tempId, "vatCode", v)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VAT_CODES.map((code) => (
                        <SelectItem key={code} value={code}>{code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">TVSH %</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={exp.tvshPercentage}
                    onChange={(e) => updateRow(exp.tempId, "tvshPercentage", parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">NUI</Label>
                  <Input value={exp.nui} onChange={(e) => updateRow(exp.tempId, "nui", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nr. Fiskal</Label>
                  <Input value={exp.nrFiskal} onChange={(e) => updateRow(exp.tempId, "nrFiskal", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Sasia</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={exp.sasia}
                    onChange={(e) => updateRow(exp.tempId, "sasia", parseFloat(e.target.value) || 1)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Njësia</Label>
                  <Select
                    value={exp.njesia}
                    onValueChange={(v) => updateRow(exp.tempId, "njesia", v)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {NJESIA_OPTIONS.map((nj) => (
                        <SelectItem key={nj} value={nj}>{nj}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))}
        </div>

        <Button variant="outline" onClick={addRow} className="w-full mt-2">
          <Plus className="h-4 w-4 mr-2" /> Shto zërin tjetër
        </Button>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Anulo</Button>
          <Button onClick={handleSave} disabled={saving || expenses.length === 0}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Ruaj {expenses.length} shpenzime
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
