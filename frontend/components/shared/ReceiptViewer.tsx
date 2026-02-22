"use client";

import { useState, useEffect } from "react";
import { apiGet } from "@/lib/api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface ReceiptViewerProps {
  billId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReceiptViewer({ billId, open, onOpenChange }: ReceiptViewerProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!billId || !open) return;
    setLoading(true);
    apiGet<{ url: string }>(`/bills/${billId}/image`)
      .then((data) => setImageUrl(data.url))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [billId, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Fatura</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center min-h-[400px]">
          {loading ? (
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt="Fatura"
              className="max-w-full max-h-[70vh] object-contain rounded"
            />
          ) : (
            <p className="text-muted-foreground">Imazhi nuk u gjet</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
