"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { EXPORT_COLUMNS, DEFAULT_EXPORT_COLUMNS } from "@/lib/constants";
import { Download, Loader2, Settings2 } from "lucide-react";

interface ExportSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (dateFrom: string, dateTo: string, columns: string[]) => Promise<void>;
  selectedIds?: string[];
}

export function ExportSettingsModal({
  open,
  onOpenChange,
  onExport,
  selectedIds,
}: ExportSettingsModalProps) {
  const [columns, setColumns] = useState<string[]>([...DEFAULT_EXPORT_COLUMNS]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exporting, setExporting] = useState(false);

  const toggleColumn = (key: string) => {
    setColumns((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const selectAll = () => setColumns(EXPORT_COLUMNS.map((c) => c.key));
  const selectNone = () => setColumns([]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await onExport(dateFrom, dateTo, columns);
      onOpenChange(false);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" /> Cilësimet e eksportit CSV
          </DialogTitle>
          <DialogDescription>
            {selectedIds && selectedIds.length > 0
              ? `Eksporto ${selectedIds.length} shpenzimet e zgjedhura`
              : "Eksporto shpenzimet sipas filtrave"}
          </DialogDescription>
        </DialogHeader>

        {/* Date range (only if not exporting selected) */}
        {!selectedIds?.length && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Nga data</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Deri në</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
        )}

        {/* Column selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Kolonat</Label>
            <div className="flex gap-2 text-xs">
              <button onClick={selectAll} className="text-primary hover:underline">
                Zgjedh të gjitha
              </button>
              <span className="text-muted-foreground">•</span>
              <button onClick={selectNone} className="text-primary hover:underline">
                Asnjë
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto">
            {EXPORT_COLUMNS.map((col) => (
              <label
                key={col.key}
                className="flex items-center gap-2 text-sm cursor-pointer p-1.5 rounded hover:bg-muted"
              >
                <Checkbox
                  checked={columns.includes(col.key)}
                  onCheckedChange={() => toggleColumn(col.key)}
                />
                {col.label}
              </label>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anulo
          </Button>
          <Button onClick={handleExport} disabled={exporting || columns.length === 0}>
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Eksporto CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
