/**
 * Multi-tenant isolation middleware.
 * Ensures all queries are scoped to the authenticated user's company.
 */
import { Response, NextFunction } from "express";
import { query } from "../config/database.js";
import { AuthenticatedRequest } from "./auth.js";

/**
 * Verify that the user's company exists and is active.
 * Must be used AFTER requireAuth.
 */
export async function requireActiveCompany(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user?.companyId) {
    return res.status(400).json({ error: "No company context" });
  }

  const result = await query(
    `SELECT id, is_active, subscription_tier FROM companies WHERE id = $1`,
    [req.user.companyId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Company not found" });
  }

  if (!result.rows[0].is_active) {
    return res.status(403).json({ error: "Company account is inactive" });
  }

  next();
}
