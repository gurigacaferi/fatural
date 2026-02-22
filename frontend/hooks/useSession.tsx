"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  setTokens,
  clearTokens,
  loadTokens,
  getAccessToken,
  setOnLogout,
  apiGet,
  apiPost,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: "admin" | "member";
  companyId: string;
  twoFactorEnabled: boolean;
  scanCount: number;
  maxScans: number;
  csvExportColumns: string[] | null;
}

interface SessionContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ requires2FA?: boolean }>;
  verify2FA: (token: string, tempToken: string) => Promise<void>;
  signup: (code: string, email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  // Boot: load persisted tokens & fetch profile
  useEffect(() => {
    loadTokens();
    setOnLogout(logout);
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    apiGet<User>("/auth/profile")
      .then(setUser)
      .catch(() => clearTokens())
      .finally(() => setLoading(false));
  }, [logout]);

  const login = async (email: string, password: string) => {
    const res = await apiPost<any>("/auth/login", { email, password });
    if (res.requires2FA) {
      return { requires2FA: true, tempToken: res.tempToken };
    }
    setTokens(res.accessToken, res.refreshToken);
    const profile = await apiGet<User>("/auth/profile");
    setUser(profile);
    return {};
  };

  const verify2FA = async (token: string, tempToken: string) => {
    const res = await apiPost<any>("/auth/verify-2fa", { token, tempToken });
    setTokens(res.accessToken, res.refreshToken);
    const profile = await apiGet<User>("/auth/profile");
    setUser(profile);
  };

  const signup = async (
    code: string,
    email: string,
    password: string,
    firstName: string,
    lastName: string
  ) => {
    const res = await apiPost<any>("/auth/signup", {
      invitationCode: code,
      email,
      password,
      firstName,
      lastName,
    });
    setTokens(res.accessToken, res.refreshToken);
    const profile = await apiGet<User>("/auth/profile");
    setUser(profile);
  };

  const refreshProfile = async () => {
    const profile = await apiGet<User>("/auth/profile");
    setUser(profile);
  };

  return (
    <SessionContext.Provider
      value={{ user, loading, login, verify2FA, signup, logout, refreshProfile }}
    >
      {children}
    </SessionContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
