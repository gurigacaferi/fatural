/**
 * Auth routes – login, signup (invitation-only), 2FA, token refresh, password reset.
 */
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { query, getClient } from "../config/database.js";
import {
  signTokens,
  verifyRefreshToken,
  requireAuth,
  AuthenticatedRequest,
} from "../middleware/auth.js";
import { generateTotpSecret, verifyTotp } from "../utils/totp.js";

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const { rows } = await query(
      `SELECT u.*, c.is_active AS company_active
         FROM users u
         JOIN companies c ON c.id = u.company_id
        WHERE u.email = $1`,
      [email.toLowerCase()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: "Account is disabled" });
    }
    if (!user.company_active) {
      return res.status(403).json({ error: "Company account is inactive" });
    }

    const passwordMatch = await bcrypt.compare(password, user.hashed_password);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Check if 2FA is required
    if (user.two_factor_enabled) {
      return res.json({
        requires2FA: true,
        userId: user.id,
        message: "2FA token required",
      });
    }

    // Issue tokens
    const payload = {
      userId: user.id,
      companyId: user.company_id,
      email: user.email,
      role: user.role,
    };
    const tokens = signTokens(payload);

    // Store refresh token
    await query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, tokens.refreshToken]
    );

    // Update last login
    await query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [user.id]);

    return res.json({
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        companyId: user.company_id,
        twoFactorEnabled: user.two_factor_enabled,
        csvExportColumns: user.csv_export_columns,
      },
    });
  } catch (err: any) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Login failed" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/verify-2fa  (called after login returns requires2FA=true)
// ---------------------------------------------------------------------------
router.post("/verify-2fa", async (req: Request, res: Response) => {
  try {
    const { userId, token } = req.body;
    if (!userId || !token) {
      return res.status(400).json({ error: "userId and token required" });
    }

    const { rows } = await query(
      `SELECT u.*, c.is_active AS company_active
         FROM users u
         JOIN companies c ON c.id = u.company_id
        WHERE u.id = $1`,
      [userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: "User not found" });

    const user = rows[0];
    if (!user.two_factor_secret) {
      return res.status(400).json({ error: "2FA not set up" });
    }

    const valid = verifyTotp(token, user.two_factor_secret);
    if (!valid) {
      return res.status(401).json({ error: "Invalid 2FA token" });
    }

    const payload = {
      userId: user.id,
      companyId: user.company_id,
      email: user.email,
      role: user.role,
    };
    const tokens = signTokens(payload);

    await query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, tokens.refreshToken]
    );
    await query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [user.id]);

    return res.json({
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        companyId: user.company_id,
        twoFactorEnabled: user.two_factor_enabled,
        csvExportColumns: user.csv_export_columns,
      },
    });
  } catch (err: any) {
    console.error("2FA verify error:", err);
    return res.status(500).json({ error: "Verification failed" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/signup  (invitation-only)
// ---------------------------------------------------------------------------
router.post("/signup", async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, invitationCode } = req.body;
    if (!email || !password || !invitationCode) {
      return res
        .status(400)
        .json({ error: "Email, password, and invitation code are required" });
    }

    // Validate invitation
    const { rows: invRows } = await query(
      `SELECT * FROM invitations
        WHERE code = $1
          AND email = $2
          AND is_used = false
          AND expires_at > NOW()`,
      [invitationCode, email.toLowerCase()]
    );

    if (invRows.length === 0) {
      return res
        .status(400)
        .json({ error: "Invalid, expired, or already-used invitation code" });
    }

    const invitation = invRows[0];

    // Check for existing user
    const { rows: existing } = await query(
      `SELECT id FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    const client = await getClient();
    try {
      await client.query("BEGIN");

      await client.query(
        `INSERT INTO users (id, company_id, email, hashed_password, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, $5, $6, 'user')`,
        [
          userId,
          invitation.company_id,
          email.toLowerCase(),
          hashedPassword,
          firstName || null,
          lastName || null,
        ]
      );

      await client.query(
        `UPDATE invitations SET is_used = true, used_by = $1 WHERE id = $2`,
        [userId, invitation.id]
      );

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    // Auto-login
    const payload = {
      userId,
      companyId: invitation.company_id,
      email: email.toLowerCase(),
      role: "user",
    };
    const tokens = signTokens(payload);

    return res.status(201).json({
      ...tokens,
      user: {
        id: userId,
        email: email.toLowerCase(),
        firstName: firstName || null,
        lastName: lastName || null,
        role: "user",
        companyId: invitation.company_id,
        twoFactorEnabled: false,
        csvExportColumns: null,
      },
    });
  } catch (err: any) {
    console.error("Signup error:", err);
    return res.status(500).json({ error: "Signup failed" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/refresh
// ---------------------------------------------------------------------------
router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token required" });
    }

    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    // Check token exists in DB
    const { rows } = await query(
      `SELECT rt.*, u.company_id, u.email, u.role
         FROM refresh_tokens rt
         JOIN users u ON u.id = rt.user_id
        WHERE rt.token = $1 AND rt.expires_at > NOW()`,
      [refreshToken]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Refresh token expired or revoked" });
    }

    const row = rows[0];

    // Rotate: delete old, issue new
    await query(`DELETE FROM refresh_tokens WHERE token = $1`, [refreshToken]);

    const newPayload = {
      userId: row.user_id,
      companyId: row.company_id,
      email: row.email,
      role: row.role,
    };
    const tokens = signTokens(newPayload);

    await query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [row.user_id, tokens.refreshToken]
    );

    return res.json(tokens);
  } catch (err: any) {
    return res.status(500).json({ error: "Token refresh failed" });
  }
});

// ---------------------------------------------------------------------------
// 2FA Setup (authenticated)
// ---------------------------------------------------------------------------
router.post(
  "/2fa/setup",
  requireAuth as any,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { secret, uri, qrCodeUrl } = await generateTotpSecret(user.email);

      // Store the secret temporarily (not yet enabled)
      await query(`UPDATE users SET two_factor_secret = $1 WHERE id = $2`, [
        secret,
        user.userId,
      ]);

      return res.json({ secret, uri, qrCodeUrl });
    } catch (err: any) {
      return res.status(500).json({ error: "2FA setup failed" });
    }
  }
);

router.post(
  "/2fa/enable",
  requireAuth as any,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { token } = req.body;
      const user = req.user!;

      const { rows } = await query(
        `SELECT two_factor_secret FROM users WHERE id = $1`,
        [user.userId]
      );
      if (!rows[0]?.two_factor_secret) {
        return res.status(400).json({ error: "Run /2fa/setup first" });
      }

      const valid = verifyTotp(token, rows[0].two_factor_secret);
      if (!valid) {
        return res.status(401).json({ error: "Invalid verification code" });
      }

      await query(
        `UPDATE users SET two_factor_enabled = true WHERE id = $1`,
        [user.userId]
      );

      return res.json({ enabled: true });
    } catch (err: any) {
      return res.status(500).json({ error: "2FA enable failed" });
    }
  }
);

router.post(
  "/2fa/disable",
  requireAuth as any,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await query(
        `UPDATE users SET two_factor_enabled = false, two_factor_secret = NULL WHERE id = $1`,
        [req.user!.userId]
      );
      return res.json({ enabled: false });
    } catch {
      return res.status(500).json({ error: "2FA disable failed" });
    }
  }
);

// ---------------------------------------------------------------------------
// Profile (authenticated)
// ---------------------------------------------------------------------------
router.get(
  "/profile",
  requireAuth as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const { rows } = await query(
      `SELECT id, email, first_name, last_name, role, company_id, two_factor_enabled, csv_export_columns
         FROM users WHERE id = $1`,
      [req.user!.userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: "User not found" });
    const u = rows[0];
    return res.json({
      id: u.id,
      email: u.email,
      firstName: u.first_name,
      lastName: u.last_name,
      role: u.role,
      companyId: u.company_id,
      twoFactorEnabled: u.two_factor_enabled,
      csvExportColumns: u.csv_export_columns,
    });
  }
);

router.patch(
  "/profile",
  requireAuth as any,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { firstName, lastName, csvExportColumns } = req.body;
      await query(
        `UPDATE users SET first_name = COALESCE($1, first_name),
                          last_name  = COALESCE($2, last_name),
                          csv_export_columns = COALESCE($3, csv_export_columns)
          WHERE id = $4`,
        [firstName, lastName, csvExportColumns ? JSON.stringify(csvExportColumns) : null, req.user!.userId]
      );
      return res.json({ success: true });
    } catch {
      return res.status(500).json({ error: "Profile update failed" });
    }
  }
);

router.post(
  "/change-password",
  requireAuth as any,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }
      const hashed = await bcrypt.hash(newPassword, 12);
      await query(`UPDATE users SET hashed_password = $1 WHERE id = $2`, [
        hashed,
        req.user!.userId,
      ]);
      return res.json({ success: true });
    } catch {
      return res.status(500).json({ error: "Password change failed" });
    }
  }
);

export default router;
