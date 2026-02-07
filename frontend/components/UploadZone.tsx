"use client";

import { useCallback, useState } from "react";
import { Upload, Loader2, CheckCircle2, XCircle } from "lucide-react";

const API_URL = "https://fatural-api-p4woo2xebq-ey.a.run.app";

interface UploadZoneProps {
  companyId: string;
  onUploadComplete?: () => void;
}

export default function UploadZone({ companyId, onUploadComplete }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      uploadFile(files[0]);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadFile(files[0]);
    }
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    setUploadStatus("idle");
    setProgress(0);

    const formData = new FormData();
    formData.append("file", file);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setProgress((prev) => Math.min(prev + 10, 90));
    }, 200);

    try {
      const response = await fetch(`${API_URL}/upload`, {
        method: "POST",
        headers: { "X-Company-Id": companyId },
        body: formData,
      });

      clearInterval(progressInterval);
      setProgress(100);

      const data = await response.json();

      if (response.ok) {
        setUploadStatus("success");
        setMessage(`Bill uploaded! Processing will begin shortly.`);
        onUploadComplete?.();
      } else {
        setUploadStatus("error");
        setMessage(data.detail || "Upload failed");
      }
    } catch (error) {
      clearInterval(progressInterval);
      setUploadStatus("error");
      setMessage("Network error occurred");
    } finally {
      setUploading(false);
      setTimeout(() => {
        setUploadStatus("idle");
        setProgress(0);
      }, 3000);
    }
  };

  return (
    <div className="bg-white rounded-xl border-2 border-gray-200 p-8">
      <h3 className="text-xl font-semibold mb-4">Upload Bill</h3>

      <div
        className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer ${
          isDragging
            ? "border-purple-500 bg-purple-50"
            : "border-gray-300 hover:border-purple-400 hover:bg-gray-50"
        }`}
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <input
          id="file-input"
          type="file"
          className="hidden"
          accept="image/*,.pdf"
          onChange={handleFileSelect}
          disabled={uploading}
        />

        {uploading ? (
          <div className="space-y-4">
            <Loader2 className="w-12 h-12 text-purple-600 mx-auto animate-spin" />
            <p className="text-gray-600">Uploading...</p>
            <div className="w-full bg-gray-200 rounded-full h-2 max-w-md mx-auto">
              <div
                className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : uploadStatus === "success" ? (
          <div className="space-y-2">
            <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto" />
            <p className="text-green-600 font-medium">{message}</p>
          </div>
        ) : uploadStatus === "error" ? (
          <div className="space-y-2">
            <XCircle className="w-12 h-12 text-red-600 mx-auto" />
            <p className="text-red-600 font-medium">{message}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="w-12 h-12 text-gray-400 mx-auto" />
            <p className="text-lg font-medium text-gray-700">
              Click to upload or drag and drop
            </p>
            <p className="text-sm text-gray-500">
              JPG, PNG, or PDF (Max 10MB)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
