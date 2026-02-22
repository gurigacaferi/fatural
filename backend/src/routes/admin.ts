/**
 * Admin routes – invitation management, user management, audit log.
 * All endpoints require the 'admin' role.
 */
import { Router, Response } from "express";
import { query } from "../config/database.js";
import {
  requireAuth,
  requireAdmin,
  AuthenticatedRequest,
} from "../middleware/auth.js";
import { requireActiveCompany } from "../middleware/tenancy.js";
import crypto from "node:crypto";

const router = Router();
router.use(
  requireAuth as any,
  requireActiveCompany as any,
  requireAdmin as any
);

// ---------------------------------------------------------------------------
// POST /api/admin/invitations  – generate invitation code
// ---------------------------------------------------------------------------
router.post("/invitations", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { email, role } = req.body as { email?: string; role?: string };

    const code = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await query(
      `INSERT INTO invitations (id, company_id, code, email, role, expires_at, created_by)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`,
      [user.companyId, code, email || null, role || "member", expiresAt, user.userId]
    );

    return res.status(201).json({ code, expiresAt, email, role: role || "member" });
  } catch (err: any) {
    console.error("Create invitation error:", err);
    return res.status(500).json({ error: "Failed to create invitation" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/invitations
// ---------------------------------------------------------------------------
router.get("/invitations", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const result = await query(
    `SELECT i.id, i.code, i.email, i.role, i.used, i.expires_at, i.created_at,
            u.email AS created_by_email
     FROM invitations i
     LEFT JOIN users u ON u.id = i.created_by
     WHERE i.company_id = $1
     ORDER BY i.created_at DESC`,
    [user.companyId]
  );
  return res.json({ invitations: result.rows });
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/invitations/:id
// ---------------------------------------------------------------------------
router.delete("/invitations/:id", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  await query(
    `DELETE FROM invitations WHERE id = $1 AND company_id = $2 AND used = false`,
    [req.params.id, user.companyId]
  );
  return res.json({ success: true });
});

// ---------------------------------------------------------------------------
// GET /api/admin/users  – list company users
// ---------------------------------------------------------------------------
router.get("/users", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const result = await query(
    `SELECT id, email, first_name, last_name, role, two_factor_enabled,
            scan_count, max_scans, created_at
     FROM users
     WHERE company_id = $1
     ORDER BY created_at`,
    [user.companyId]
  );
  return res.json({ users: result.rows });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/users/:id/role  – change user role
// ---------------------------------------------------------------------------
router.patch("/users/:id/role", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { role } = req.body as { role: string };

  if (!["admin", "member"].includes(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }

  // Prevent self-demotion
  if (req.params.id === user.userId && role !== "admin") {
    return res.status(400).json({ error: "Cannot demote yourself" });
  }

  await query(
    `UPDATE users SET role = $1 WHERE id = $2 AND company_id = $3`,
    [role, req.params.id, user.companyId]
  );

  return res.json({ success: true });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/users/:id/scan-limit  – set scan limit
// ---------------------------------------------------------------------------
router.patch("/users/:id/scan-limit", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { maxScans } = req.body as { maxScans: number };

  await query(
    `UPDATE users SET max_scans = $1 WHERE id = $2 AND company_id = $3`,
    [maxScans, req.params.id, user.companyId]
  );

  return res.json({ success: true });
});

// ---------------------------------------------------------------------------
// GET /api/admin/audit-log
// ---------------------------------------------------------------------------
router.get("/audit-log", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { page: pageStr, pageSize: pageSizeStr } = req.query as Record<string, string>;
  const page = Math.max(1, parseInt(pageStr || "1"));
  const pageSize = Math.min(100, parseInt(pageSizeStr || "50"));

  const result = await query(
    `SELECT a.id, a.action, a.details, a.created_at,
            u.email AS user_email
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.company_id = $1
     ORDER BY a.created_at DESC
     LIMIT $2 OFFSET $3`,
    [user.companyId, pageSize, (page - 1) * pageSize]
  );

  return res.json({ logs: result.rows, page, pageSize });
});

// ---------------------------------------------------------------------------
// GET /api/admin/stats  – company-level statistics
// ---------------------------------------------------------------------------
router.get("/stats", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;

  const [userCount, billCount, expenseSum, recentUploads] = await Promise.all([
    query(`SELECT COUNT(*) FROM users WHERE company_id = $1`, [user.companyId]),
    query(`SELECT COUNT(*) FROM bills WHERE company_id = $1`, [user.companyId]),
    query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE company_id = $1`,
      [user.companyId]
    ),
    query(
      `SELECT COUNT(*) FROM bills WHERE company_id = $1 AND created_at > NOW() - INTERVAL '30 days'`,
      [user.companyId]
    ),
  ]);

  return res.json({
    users: parseInt(userCount.rows[0].count),
    totalBills: parseInt(billCount.rows[0].count),
    totalExpenseAmount: parseFloat(expenseSum.rows[0].total),
    billsLast30Days: parseInt(recentUploads.rows[0].count),
  });
});

export default router;
