/**
 * QuickBooks Online integration routes – OAuth 2.0 + expense sync.
 */
import { Router, Response } from "express";
import { query } from "../config/database.js";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { requireActiveCompany } from "../middleware/tenancy.js";
import {
  getAuthorizeUrl,
  exchangeCodeForTokens,
  sendExpensesToQuickBooks,
} from "../services/quickbooks.js";

const router = Router();
router.use(requireAuth as any, requireActiveCompany as any);

// ---------------------------------------------------------------------------
// GET /api/quickbooks/authorize  – redirect user to QB consent screen
// ---------------------------------------------------------------------------
router.get("/authorize", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const state = Buffer.from(JSON.stringify({ userId: user.userId })).toString("base64url");
  const url = getAuthorizeUrl(state);
  return res.json({ url });
});

// ---------------------------------------------------------------------------
// GET /api/quickbooks/callback  – QB redirects here after consent
// ---------------------------------------------------------------------------
router.get("/callback", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code, state, realmId } = req.query as Record<string, string>;
    const { userId } = JSON.parse(Buffer.from(state, "base64url").toString());

    const tokens = await exchangeCodeForTokens(code);

    // Upsert the integration row
    await query(
      `INSERT INTO quickbooks_integrations (id, user_id, company_id, realm_id, access_token, refresh_token, token_expires_at)
       VALUES (gen_random_uuid(), $1,
         (SELECT company_id FROM users WHERE id = $1), $2, $3, $4, $5)
       ON CONFLICT (user_id)
       DO UPDATE SET realm_id = $2, access_token = $3, refresh_token = $4, token_expires_at = $5, updated_at = NOW()`,
      [
        userId,
        realmId,
        tokens.accessToken,
        tokens.refreshToken,
        tokens.expiresAt,
      ]
    );

    // Redirect to frontend settings page
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    return res.redirect(`${frontendUrl}/dashboard?qb=connected`);
  } catch (err: any) {
    console.error("QuickBooks callback error:", err);
    return res.status(500).json({ error: "QuickBooks connection failed" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/quickbooks/sync-expenses  – push selected expenses to QB
// ---------------------------------------------------------------------------
router.post("/sync-expenses", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { expenseIds } = req.body as { expenseIds: string[] };

    if (!Array.isArray(expenseIds) || expenseIds.length === 0) {
      return res.status(400).json({ error: "expenseIds array required" });
    }

    // Fetch expenses
    const result = await query(
      `SELECT * FROM expenses
       WHERE id = ANY($1) AND company_id = $2 AND user_id = $3
         AND quickbooks_synced = false`,
      [expenseIds, user.companyId, user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "No unsynced expenses found" });
    }

    const syncResult = await sendExpensesToQuickBooks(user.userId, result.rows);

    // Mark expenses as synced
    await query(
      `UPDATE expenses SET quickbooks_synced = true
       WHERE id = ANY($1)`,
      [expenseIds]
    );

    return res.json({ synced: result.rows.length, details: syncResult });
  } catch (err: any) {
    console.error("QuickBooks sync error:", err);
    return res.status(500).json({ error: "Sync failed" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/quickbooks/status  – check connection status
// ---------------------------------------------------------------------------
router.get("/status", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const result = await query(
    `SELECT realm_id, token_expires_at, created_at, updated_at
     FROM quickbooks_integrations
     WHERE user_id = $1`,
    [user.userId]
  );

  if (result.rows.length === 0) {
    return res.json({ connected: false });
  }

  const row = result.rows[0];
  return res.json({
    connected: true,
    realmId: row.realm_id,
    tokenExpiresAt: row.token_expires_at,
    connectedAt: row.created_at,
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/quickbooks/disconnect
// ---------------------------------------------------------------------------
router.delete("/disconnect", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  await query(`DELETE FROM quickbooks_integrations WHERE user_id = $1`, [user.userId]);
  return res.json({ success: true });
});

export default router;
