/**
 * Export routes – CSV download with configurable columns.
 */
import { Router, Response } from "express";
import { query } from "../config/database.js";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { requireActiveCompany } from "../middleware/tenancy.js";
import { buildCsvString, DEFAULT_EXPORT_COLUMNS } from "../utils/csv.js";

const router = Router();
router.use(requireAuth as any, requireActiveCompany as any);

// ---------------------------------------------------------------------------
// GET /api/export/csv?dateFrom=&dateTo=&category=&columns=col1,col2
// ---------------------------------------------------------------------------
router.get("/csv", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { dateFrom, dateTo, category, columns } = req.query as Record<string, string | undefined>;

    let where = `WHERE e.company_id = $1 AND e.user_id = $2`;
    const params: any[] = [user.companyId, user.userId];
    let idx = 3;

    if (dateFrom) {
      where += ` AND e.date >= $${idx}`;
      params.push(dateFrom);
      idx++;
    }
    if (dateTo) {
      where += ` AND e.date <= $${idx}`;
      params.push(dateTo);
      idx++;
    }
    if (category) {
      where += ` AND e.category = $${idx}`;
      params.push(category);
      idx++;
    }

    const result = await query(
      `SELECT e.* FROM expenses e ${where} ORDER BY e.date DESC`,
      params
    );

    // Parse user-selected columns, or fall back to their profile defaults / global defaults
    let selectedColumns: string[] | undefined;
    if (columns) {
      selectedColumns = columns.split(",").map((c) => c.trim());
    } else {
      // Try user profile
      const profile = await query(
        `SELECT csv_export_columns FROM users WHERE id = $1`,
        [user.userId]
      );
      if (profile.rows[0]?.csv_export_columns) {
        selectedColumns = profile.rows[0].csv_export_columns;
      } else {
        selectedColumns = DEFAULT_EXPORT_COLUMNS;
      }
    }

    const csv = buildCsvString(result.rows, selectedColumns);
    const filename = `expenses_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (err: any) {
    console.error("Export CSV error:", err);
    return res.status(500).json({ error: "Export failed" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/export/selected  (export specific expense IDs)
// ---------------------------------------------------------------------------
router.post("/selected", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { ids, columns } = req.body as { ids: string[]; columns?: string[] };

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids array required" });
    }

    const result = await query(
      `SELECT e.* FROM expenses e
       WHERE e.id = ANY($1) AND e.company_id = $2 AND e.user_id = $3
       ORDER BY e.date DESC`,
      [ids, user.companyId, user.userId]
    );

    const selectedColumns = columns || DEFAULT_EXPORT_COLUMNS;
    const csv = buildCsvString(result.rows, selectedColumns);
    const filename = `expenses_selected_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (err: any) {
    console.error("Export selected error:", err);
    return res.status(500).json({ error: "Export failed" });
  }
});

export default router;
