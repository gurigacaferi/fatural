"use client";

import { useState, useEffect } from "react";
import { useSession } from "@/hooks/useSession";
import { apiGet, apiPost, apiDelete, apiPatch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Shield, UserPlus, Copy, Trash2, Loader2, Users, BarChart3, Receipt, ArrowLeft,
} from "lucide-react";

export default function AdminPage() {
  const { user } = useSession();
  const [tab, setTab] = useState<"invitations" | "users" | "stats">("invitations");

  if (!user) {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }
  if (user.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Nuk keni qasje në panelin e administrimit.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-40">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <a href="/dashboard"><ArrowLeft className="h-4 w-4" /></a>
            </Button>
            <div className="flex items-center gap-2 text-primary font-bold">
              <Shield className="h-5 w-5" /> Admin
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 space-y-6">
        <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
          {[
            { key: "invitations" as const, label: "Ftesat", icon: <UserPlus className="h-4 w-4" /> },
            { key: "users" as const, label: "Përdoruesit", icon: <Users className="h-4 w-4" /> },
            { key: "stats" as const, label: "Statistika", icon: <BarChart3 className="h-4 w-4" /> },
          ].map((t) => (
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

        {tab === "invitations" && <InvitationsTab />}
        {tab === "users" && <UsersTab />}
        {tab === "stats" && <StatsTab />}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invitations tab
// ---------------------------------------------------------------------------
function InvitationsTab() {
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("member");
  const [createdCode, setCreatedCode] = useState("");

  const fetchInvitations = async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ invitations: any[] }>("/admin/invitations");
      setInvitations(data.invitations);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInvitations(); }, []);

  const createInvitation = async () => {
    setCreating(true);
    try {
      const data = await apiPost<{ code: string }>("/admin/invitations", {
        email: newEmail || undefined,
        role: newRole,
      });
      setCreatedCode(data.code);
      setNewEmail("");
      fetchInvitations();
    } finally {
      setCreating(false);
    }
  };

  const deleteInvitation = async (id: string) => {
    await apiDelete(`/admin/invitations/${id}`);
    fetchInvitations();
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  return (
    <div className="space-y-6">
      {/* Create invitation */}
      <Card>
        <CardHeader>
          <CardTitle>Krijo ftesë të re</CardTitle>
          <CardDescription>Gjeneroni një kod ftese për përdorues të rinj</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label>Email (opsionale)</Label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="email@shembull.com"
              />
            </div>
            <div className="w-32 space-y-2">
              <Label>Roli</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Anëtar</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={createInvitation} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <UserPlus className="h-4 w-4 mr-1" />}
              Gjeneroni
            </Button>
          </div>
          {createdCode && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
              <code className="flex-1 font-mono text-sm">{createdCode}</code>
              <Button variant="outline" size="sm" onClick={() => copyCode(createdCode)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle>Ftesat ekzistuese</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
          ) : invitations.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">Asnjë ftesë</p>
          ) : (
            <div className="space-y-2">
              {invitations.map((inv) => (
                <div key={inv.id} className="flex items-center gap-3 p-3 border rounded-lg">
                  <code className="font-mono text-xs flex-1 truncate">{inv.code}</code>
                  {inv.email && <span className="text-sm text-muted-foreground">{inv.email}</span>}
                  <Badge variant={inv.role === "admin" ? "default" : "secondary"}>{inv.role}</Badge>
                  <Badge variant={inv.used ? "outline" : "success"}>
                    {inv.used ? "E përdorur" : "Aktive"}
                  </Badge>
                  {!inv.used && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyCode(inv.code)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => deleteInvitation(inv.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users tab
// ---------------------------------------------------------------------------
function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<{ users: any[] }>("/admin/users")
      .then((d) => setUsers(d.users))
      .finally(() => setLoading(false));
  }, []);

  const changeRole = async (userId: string, role: string) => {
    await apiPatch(`/admin/users/${userId}/role`, { role });
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
  };

  if (loading) return <Loader2 className="h-6 w-6 animate-spin mx-auto mt-8" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Përdoruesit e kompanisë</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 p-3 border rounded-lg">
              <div className="flex-1">
                <p className="text-sm font-medium">{u.first_name} {u.last_name}</p>
                <p className="text-xs text-muted-foreground">{u.email}</p>
              </div>
              <Badge variant={u.two_factor_enabled ? "success" : "warning"}>
                2FA: {u.two_factor_enabled ? "Po" : "Jo"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {u.scan_count}/{u.max_scans} skanime
              </span>
              <Select value={u.role} onValueChange={(v) => changeRole(u.id, v)}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Anëtar</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Stats tab
// ---------------------------------------------------------------------------
function StatsTab() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet("/admin/stats")
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader2 className="h-6 w-6 animate-spin mx-auto mt-8" />;
  if (!stats) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {[
        { label: "Përdorues", value: stats.users, icon: Users },
        { label: "Fatura gjithsej", value: stats.totalBills, icon: Receipt },
        { label: "Shuma totale", value: `€${stats.totalExpenseAmount.toFixed(2)}`, icon: BarChart3 },
        { label: "Fatura (30 ditë)", value: stats.billsLast30Days, icon: Receipt },
      ].map((s) => (
        <Card key={s.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <s.icon className="h-4 w-4" /> {s.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{s.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
