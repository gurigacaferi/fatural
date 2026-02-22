"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { apiUpload } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, X, FileImage, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface QueuedFile {
  file: File;
  id: string;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
}

interface UploadZoneProps {
  onUploadComplete?: () => void;
  batchId?: string;
}

const ACCEPTED_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
  "image/gif": [".gif"],
  "image/bmp": [".bmp"],
  "application/pdf": [".pdf"],
};

export function MultiFileUploadZone({ onUploadComplete, batchId }: UploadZoneProps) {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback((accepted: File[]) => {
    const newFiles: QueuedFile[] = accepted.map((file) => ({
      file,
      id: crypto.randomUUID(),
      status: "queued" as const,
    }));
    setQueue((prev) => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: 20,
    multiple: true,
  });

  const removeFile = (id: string) => {
    setQueue((prev) => prev.filter((f) => f.id !== id));
  };

  const uploadAll = async () => {
    if (queue.length === 0) return;
    setUploading(true);

    const pending = queue.filter((f) => f.status === "queued");
    for (let i = 0; i < pending.length; i += 5) {
      const chunk = pending.slice(i, i + 5);
      const formData = new FormData();
      chunk.forEach((qf) => formData.append("files", qf.file));
      if (batchId) formData.append("batchId", batchId);

      setQueue((prev) =>
        prev.map((f) =>
          chunk.find((c) => c.id === f.id) ? { ...f, status: "uploading" as const } : f
        )
      );

      try {
        await apiUpload("/bills/upload", formData);
        setQueue((prev) =>
          prev.map((f) =>
            chunk.find((c) => c.id === f.id) ? { ...f, status: "done" as const } : f
          )
        );
      } catch (err: any) {
        setQueue((prev) =>
          prev.map((f) =>
            chunk.find((c) => c.id === f.id)
              ? { ...f, status: "error" as const, error: err.message }
              : f
          )
        );
      }
    }

    setUploading(false);
    onUploadComplete?.();
  };

  const clearDone = () => {
    setQueue((prev) => prev.filter((f) => f.status !== "done"));
  };

  const statusIcon = (status: QueuedFile["status"]) => {
    switch (status) {
      case "uploading": return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case "done": return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "error": return <AlertCircle className="h-4 w-4 text-destructive" />;
      default: return <FileImage className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/50"
        )}
      >
        <input {...getInputProps()} />
        <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm font-medium">
          {isDragActive ? "Lëshoni skedarët këtu..." : "Tërhiqni & lëshoni faturat këtu"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          JPG, PNG, WebP, HEIC, PDF • deri në 20 skedarë njëkohësisht
        </p>
      </div>

      {queue.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {queue.length} skedarë{" "}
              <Badge variant="secondary" className="ml-1">
                {queue.filter((f) => f.status === "done").length} gati
              </Badge>
            </p>
            <div className="flex gap-2">
              {queue.some((f) => f.status === "done") && (
                <Button variant="ghost" size="sm" onClick={clearDone}>
                  Pastro të kryerat
                </Button>
              )}
              <Button
                size="sm"
                onClick={uploadAll}
                disabled={uploading || !queue.some((f) => f.status === "queued")}
              >
                {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Ngarko të gjitha
              </Button>
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {queue.map((qf) => (
              <div key={qf.id} className="flex items-center gap-2 text-sm p-2 rounded bg-muted/50">
                {statusIcon(qf.status)}
                <span className="flex-1 truncate">{qf.file.name}</span>
                <span className="text-xs text-muted-foreground">
                  {(qf.file.size / 1024).toFixed(0)} KB
                </span>
                {qf.status === "queued" && (
                  <button onClick={() => removeFile(qf.id)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
                {qf.error && <span className="text-xs text-destructive">{qf.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
