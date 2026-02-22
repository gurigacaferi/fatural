"use client";

import { useState, useCallback } from "react";
import { useSession } from "@/hooks/useSession";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MultiFileUploadZone } from "@/components/upload/MultiFileUploadZone";
import { ExpensesTable, type Expense } from "@/components/expenses/ExpensesTable";
import { EditExpenseDialog } from "@/components/expenses/EditExpenseDialog";
import { ExpenseSplitterDialog } from "@/components/expenses/ExpenseSplitterDialog";
import { ExportSettingsModal } from "@/components/expenses/ExportSettingsModal";
import { ReceiptViewer } from "@/components/shared/ReceiptViewer";
import {
  Receipt, Upload, BarChart3, DollarSign, FileText,
  Download, LogOut, User, Settings, Shield,
} from "lucide-react";

type Tab = "upload" | "expenses" | "overview";

export default function DashboardPage() {
  const { user, logout } = useSession();
  const [tab, setTab] = useState<Tab>("expenses");
  const [refreshKey, setRefreshKey] = useState(0);

  // Dialog state
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [splitterBillId, setSplitterBillId] = useState<string | null>(null);
  const [splitterOpen, setSplitterOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportIds, setExportIds] = useState<string[]>([]);
  const [receiptBillId, setReceiptBillId] = useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  if (!user) {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }

  const refresh = () => setRefreshKey((k) => k + 1);

  const handleEdit = (expense: Expense) => {
    setEditExpense(expense);
    setEditOpen(true);
  };

  const handleViewReceipt = (billId: string) => {
    setReceiptBillId(billId);
    setReceiptOpen(true);
  };

  const handleExport = (ids: string[]) => {
    setExportIds(ids);
    setExportOpen(true);
  };

  const performExport = async (dateFrom: string, dateTo: string, columns: string[]) => {
    if (exportIds.length > 0) {
      const csv = await api<string>("/export/selected", {
        method: "POST",
        body: JSON.stringify({ ids: exportIds, columns }),
      });
      downloadCsv(csv);
    } else {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (columns.length > 0) params.set("columns", columns.join(","));
      const csv = await api<string>(`/export/csv?${params}`);
      downloadCsv(csv);
    }
  };

  const downloadCsv = (csv: string) => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fatural_eksport_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "upload", label: "Ngarko", icon: <Upload className="h-4 w-4" /> },
    { key: "expenses", label: "Shpenzimet", icon: <FileText className="h-4 w-4" /> },
    { key: "overview", label: "Pamje", icon: <BarChart3 className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2 text-primary font-bold">
            <Receipt className="h-5 w-5" />
            Fatural
          </div>
          <div className="flex items-center gap-2">
            {user.role === "admin" && (
              <Button variant="ghost" size="sm" asChild>
                <a href="/admin"><Shield className="h-4 w-4 mr-1" /> Admin</a>
              </Button>
            )}
            <Button variant="ghost" size="sm" asChild>
              <a href="/profile"><User className="h-4 w-4 mr-1" /> Profili</a>
            </Button>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4 mr-1" /> Dil
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Tab navigation */}
        <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === t.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "upload" && (
          <Card>
            <CardHeader>
              <CardTitle>Ngarko faturat</CardTitle>
            </CardHeader>
            <CardContent>
              <MultiFileUploadZone onUploadComplete={refresh} />
            </CardContent>
          </Card>
        )}

        {tab === "expenses" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Shpenzimet</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleExport([])}>
                  <Download className="h-4 w-4 mr-1" /> Eksporto CSV
                </Button>
              </div>
            </div>
            <ExpensesTable
              onEdit={handleEdit}
              onViewReceipt={handleViewReceipt}
              onExport={handleExport}
              refreshKey={refreshKey}
            />
          </div>
        )}

        {tab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Skanime të mbetura
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {user.maxScans - user.scanCount}
                  <span className="text-sm font-normal text-muted-foreground ml-1">
                    / {user.maxScans}
                  </span>
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Roli
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                  {user.role}
                </Badge>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  2FA
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant={user.twoFactorEnabled ? "success" : "warning"}>
                  {user.twoFactorEnabled ? "Aktive" : "Jo aktive"}
                </Badge>
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {/* Dialogs */}
      <EditExpenseDialog
        expense={editExpense}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={refresh}
      />
      {splitterBillId && (
        <ExpenseSplitterDialog
          billId={splitterBillId}
          open={splitterOpen}
          onOpenChange={setSplitterOpen}
          onSaved={refresh}
          onViewReceipt={handleViewReceipt}
        />
      )}
      <ExportSettingsModal
        open={exportOpen}
        onOpenChange={setExportOpen}
        onExport={performExport}
        selectedIds={exportIds.length > 0 ? exportIds : undefined}
      />
      <ReceiptViewer
        billId={receiptBillId}
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
      />
    </div>
  );
}
