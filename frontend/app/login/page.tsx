"use client";

import { useState } from "react";
import { useSession } from "@/hooks/useSession";
import { LoginForm } from "@/components/auth/LoginForm";
import { SignupForm } from "@/components/auth/SignupForm";
import { Receipt } from "lucide-react";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const { user } = useSession();

  // If already logged in, redirect
  if (typeof window !== "undefined" && user) {
    window.location.href = "/dashboard";
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 text-primary">
            <Receipt className="h-8 w-8" />
            <span className="text-2xl font-bold">Fatural</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Skanimi i faturave me AI për tregun e Kosovës
          </p>
        </div>

        {mode === "login" ? (
          <LoginForm />
        ) : (
          <SignupForm onSwitchToLogin={() => setMode("login")} />
        )}

        {mode === "login" && (
          <p className="text-sm text-center text-muted-foreground">
            Nuk keni llogari?{" "}
            <button
              onClick={() => setMode("signup")}
              className="text-primary hover:underline"
            >
              Regjistrohuni me kod ftese
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
