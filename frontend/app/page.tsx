"use client";

import { useSession } from "@/hooks/useSession";
import { useEffect } from "react";
import { Loader2, Receipt } from "lucide-react";

export default function Home() {
  const { user, loading } = useSession();

  useEffect(() => {
    if (!loading) {
      if (user) {
        window.location.href = "/dashboard";
      } else {
        window.location.href = "/login";
      }
    }
  }, [user, loading]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10">
      <div className="flex items-center gap-3 mb-4">
        <Receipt className="h-10 w-10 text-primary" />
        <span className="text-3xl font-bold text-primary">Fatural</span>
      </div>
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
