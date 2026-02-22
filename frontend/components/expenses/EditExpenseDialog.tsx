"use client";

import { useState, useEffect } from "react";
import { apiPatch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EXPENSE_CATEGORIES, VAT_CODES, NJESIA_OPTIONS } from "@/lib/constants";
import { Loader2 } from "lucide-react";
import type { Expense } from "./ExpensesTable";

interface EditExpenseDialogProps {
  expense: Expense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditExpenseDialog({
  expense,
  open,
  onOpenChange,
  onSaved,
}: EditExpenseDialogProps) {
  const [form, setForm] = useState({
    name: "",
    category: "",
    amount: 0,
    date: "",
    merchant: "",
    vatCode: "",
    tvshPercentage: 0,
    nui: "",
    nrFiskal: "",
    numriITvshSe: "",
    sasia: 1,
    njesia: "cope",
    description: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (expense) {
      setForm({
        name: expense.name || "",
        category: expense.category || "",
        amount: expense.amount || 0,
        date: expense.date?.slice(0, 10) || "",
        merchant: expense.merchant || "",
        vatCode: expense.vat_code || "No VAT",
        tvshPercentage: expense.tvsh_percentage || 0,
        nui: expense.nui || "",
        nrFiskal: expense.nr_fiskal || "",
        numriITvshSe: expense.numri_i_tvsh_se || "",
        sasia: expense.sasia || 1,
        njesia: expense.njesia || "cope",
        description: expense.description || "",
      });
      setError("");
    }
  }, [expense]);

  const handleSave = async () => {
    if (!expense) return;
    setSaving(true);
    setError("");
    try {
      await apiPatch(`/expenses/${expense.id}`, form);
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || "Ruajtja dështoi");
    } finally {
      setSaving(false);
    }
  };

  const update = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ndrysho shpenzimin</DialogTitle>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="grid grid-cols-2 gap-4">
          {/* Name */}
          <div className="col-span-2 space-y-2">
            <Label>Përshkrimi</Label>
            <Input value={form.name} onChange={(e) => update("name", e.target.value)} />
          </div>

          {/* Category */}
          <div className="col-span-2 space-y-2">
            <Label>Kategoria</Label>
            <Select value={form.category} onValueChange={(v) => update("category", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount + Date */}
          <div className="space-y-2">
            <Label>Shuma (€)</Label>
            <Input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => update("amount", parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-2">
            <Label>Data</Label>
            <Input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} />
          </div>

          {/* Merchant */}
          <div className="col-span-2 space-y-2">
            <Label>Furnitori</Label>
            <Input value={form.merchant} onChange={(e) => update("merchant", e.target.value)} />
          </div>

          {/* VAT code + percentage */}
          <div className="space-y-2">
            <Label>Kodi TVSH</Label>
            <Select value={form.vatCode} onValueChange={(v) => update("vatCode", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VAT_CODES.map((code) => (
                  <SelectItem key={code} value={code}>{code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>TVSH %</Label>
            <Input
              type="number"
              step="0.01"
              value={form.tvshPercentage}
              onChange={(e) => update("tvshPercentage", parseFloat(e.target.value) || 0)}
            />
          </div>

          {/* Kosovo fiscal fields */}
          <div className="space-y-2">
            <Label>NUI</Label>
            <Input value={form.nui} onChange={(e) => update("nui", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Nr. Fiskal</Label>
            <Input value={form.nrFiskal} onChange={(e) => update("nrFiskal", e.target.value)} />
          </div>
          <div className="col-span-2 space-y-2">
            <Label>Nr. i TVSH-së</Label>
            <Input value={form.numriITvshSe} onChange={(e) => update("numriITvshSe", e.target.value)} />
          </div>

          {/* Quantity + Unit */}
          <div className="space-y-2">
            <Label>Sasia</Label>
            <Input
              type="number"
              step="0.01"
              value={form.sasia}
              onChange={(e) => update("sasia", parseFloat(e.target.value) || 1)}
            />
          </div>
          <div className="space-y-2">
            <Label>Njësia</Label>
            <Select value={form.njesia} onValueChange={(v) => update("njesia", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {NJESIA_OPTIONS.map((nj) => (
                  <SelectItem key={nj} value={nj}>{nj}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="col-span-2 space-y-2">
            <Label>Shënime</Label>
            <textarea
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anulo
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Ruaj
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
