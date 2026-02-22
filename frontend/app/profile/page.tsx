"use client";

import { useState, useEffect } from "react";
import { useSession } from "@/hooks/useSession";
import { apiPost, apiPatch, apiGet } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { EXPORT_COLUMNS, DEFAULT_EXPORT_COLUMNS } from "@/lib/constants";
import {
  User, ShieldCheck, ShieldOff, Key, ArrowLeft, Loader2, Save,
} from "lucide-react";

export default function ProfilePage() {
  const { user, refreshProfile, logout } = useSession();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [exportCols, setExportCols] = useState<string[]>([...DEFAULT_EXPORT_COLUMNS]);
  const [saving, setSaving] = useState(false);

  // 2FA
  const [twoFASecret, setTwoFASecret] = useState<{ secret: string; qrCodeUrl: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [enabling2FA, setEnabling2FA] = useState(false);

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPw, setChangingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState("");

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || "");
      setLastName(user.lastName || "");
      setExportCols(user.csvExportColumns || [...DEFAULT_EXPORT_COLUMNS]);
    }
  }, [user]);

  if (!user) {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }

  const saveProfile = async () => {
    setSaving(true);
    try {
      await apiPatch("/auth/profile", { firstName, lastName, csvExportColumns: exportCols });
      await refreshProfile();
    } finally {
      setSaving(false);
    }
  };

  const setup2FA = async () => {
    const data = await apiPost<{ secret: string; qrCodeUrl: string }>("/auth/2fa/setup");
    setTwoFASecret(data);
  };

  const enable2FA = async () => {
    setEnabling2FA(true);
    try {
      await apiPost("/auth/2fa/enable", { token: totpCode, secret: twoFASecret!.secret });
      setTwoFASecret(null);
      setTotpCode("");
      await refreshProfile();
    } finally {
      setEnabling2FA(false);
    }
  };

  const disable2FA = async () => {
    if (!confirm("Jeni të sigurt që dëshironi ta çaktivizoni 2FA?")) return;
    await apiPost("/auth/2fa/disable");
    await refreshProfile();
  };

  const changePassword = async () => {
    setChangingPw(true);
    setPwMsg("");
    try {
      await apiPost("/auth/change-password", { currentPassword, newPassword });
      setPwMsg("Fjalëkalimi u ndryshua me sukses");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err: any) {
      setPwMsg(err.message || "Dështoi");
    } finally {
      setChangingPw(false);
    }
  };

  const toggleCol = (key: string) => {
    setExportCols((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-40">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 h-14">
          <Button variant="ghost" size="sm" asChild>
            <a href="/dashboard"><ArrowLeft className="h-4 w-4" /></a>
          </Button>
          <span className="font-bold flex items-center gap-2"><User className="h-5 w-5" /> Profili</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-6">
        {/* Basic info */}
        <Card>
          <CardHeader>
            <CardTitle>Informacioni</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Emri</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Mbiemri</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user.email} disabled />
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={user.role === "admin" ? "default" : "secondary"}>{user.role}</Badge>
              <span className="text-sm text-muted-foreground">
                {user.scanCount}/{user.maxScans} skanime
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Export preferences */}
        <Card>
          <CardHeader>
            <CardTitle>Cilësimet e eksportit CSV</CardTitle>
            <CardDescription>Zgjidhni kolonat parazgjedhur për eksportin</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {EXPORT_COLUMNS.map((col) => (
                <label key={col.key} className="flex items-center gap-2 text-sm cursor-pointer p-1.5 rounded hover:bg-muted">
                  <Checkbox checked={exportCols.includes(col.key)} onCheckedChange={() => toggleCol(col.key)} />
                  {col.label}
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        <Button onClick={saveProfile} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Ruaj ndryshimet
        </Button>

        {/* 2FA */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" /> Autentifikimi me dy faktorë
            </CardTitle>
            <CardDescription>
              {user.twoFactorEnabled ? (
                <Badge variant="success">Aktive</Badge>
              ) : (
                <Badge variant="warning">Jo aktive</Badge>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {user.twoFactorEnabled ? (
              <Button variant="destructive" size="sm" onClick={disable2FA}>
                <ShieldOff className="h-4 w-4 mr-1" /> Çaktivizo 2FA
              </Button>
            ) : twoFASecret ? (
              <div className="space-y-4">
                <div className="flex justify-center">
                  <img src={twoFASecret.qrCodeUrl} alt="QR Code" className="w-48 h-48" />
                </div>
                <p className="text-sm text-center text-muted-foreground">
                  Skanoni kodin QR me aplikacionin tuaj autentifikues
                </p>
                <div className="flex items-end gap-3 max-w-sm mx-auto">
                  <div className="flex-1 space-y-2">
                    <Label>Kodi verifikues</Label>
                    <Input
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value)}
                      placeholder="000000"
                      maxLength={6}
                    />
                  </div>
                  <Button onClick={enable2FA} disabled={enabling2FA || totpCode.length !== 6}>
                    {enabling2FA && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Aktivizo
                  </Button>
                </div>
              </div>
            ) : (
              <Button onClick={setup2FA}>
                <ShieldCheck className="h-4 w-4 mr-1" /> Konfiguro 2FA
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Change password */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" /> Ndrysho fjalëkalimin
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label>Fjalëkalimi aktual</Label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Fjalëkalimi i ri</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            {pwMsg && <p className={`text-sm ${pwMsg.includes("sukses") ? "text-green-600" : "text-destructive"}`}>{pwMsg}</p>}
            <Button onClick={changePassword} disabled={changingPw || !currentPassword || !newPassword}>
              {changingPw && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ndrysho
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
