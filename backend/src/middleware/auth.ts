/**
 * JWT authentication middleware.
 * Verifies Bearer tokens and attaches user + company to req.
 */
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { query } from "../config/database.js";

const JWT_SECRET = process.env.JWT_SECRET || "change-me";

export interface JwtPayload {
  userId: string;
  companyId: string;
  email: string;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

/**
 * Require a valid JWT. Attaches `req.user` with { userId, companyId, email, role }.
 */
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Require admin role.
 */
export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

/**
 * Issue a fresh access + refresh token pair.
 */
export function signTokens(payload: JwtPayload) {
  const accessToken = jwt.sign(payload, JWT_SECRET, {
    expiresIn: (process.env.JWT_EXPIRES_IN || "15m") as any,
  });

  const refreshToken = jwt.sign(
    { userId: payload.userId, type: "refresh" },
    JWT_SECRET,
    { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || "7d") as any }
  );

  return { accessToken, refreshToken };
}

/**
 * Verify a refresh token and return its payload.
 */
export function verifyRefreshToken(token: string): { userId: string } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload.type !== "refresh") return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}

/**
 * Check company scan limits before allowing upload.
 */
export async function checkScanLimit(companyId: string): Promise<boolean> {
  const result = await query(
    `SELECT monthly_scans_used, monthly_scan_limit FROM companies WHERE id = $1`,
    [companyId]
  );
  if (result.rows.length === 0) return false;
  const { monthly_scans_used, monthly_scan_limit } = result.rows[0];
  return monthly_scans_used < monthly_scan_limit;
}
