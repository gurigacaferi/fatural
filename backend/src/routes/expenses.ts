/**
 * Expense routes – CRUD, filtered list, bulk actions.
 * The "Power Table" backend.
 */
import { Router, Response } from "express";
import { query, getClient } from "../config/database.js";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { requireActiveCompany } from "../middleware/tenancy.js";

const router = Router();
router.use(requireAuth as any, requireActiveCompany as any);

// ---------------------------------------------------------------------------
// GET /api/expenses  (with filters, debounced search, pagination)
// ---------------------------------------------------------------------------
router.get("/", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const {
    search,
    dateFrom,
    dateTo,
    minAmount,
    maxAmount,
    category,
    page: pageStr,
    pageSize: pageSizeStr,
  } = req.query as Record<string, string | undefined>;

  const page = Math.max(1, parseInt(pageStr || "1"));
  const pageSize = Math.min(200, parseInt(pageSizeStr || "100"));
  const offset = (page - 1) * pageSize;

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
  if (minAmount) {
    where += ` AND e.amount >= $${idx}`;
    params.push(parseFloat(minAmount));
    idx++;
  }
  if (maxAmount) {
    where += ` AND e.amount <= $${idx}`;
    params.push(parseFloat(maxAmount));
    idx++;
  }
  if (category) {
    where += ` AND e.category = $${idx}`;
    params.push(category);
    idx++;
  }
  if (search) {
    const term = `%${search.toLowerCase()}%`;
    where += ` AND (e.name ILIKE $${idx} OR e.merchant ILIKE $${idx} OR e.category ILIKE $${idx})`;
    params.push(term);
    idx++;
  }

  const [dataRes, countRes] = await Promise.all([
    query(
      `SELECT e.id, e.name, e.category, e.amount, e.date, e.merchant,
              e.vat_code, e.tvsh_percentage, e.nui, e.nr_fiskal, e.numri_i_tvsh_se,
              e.description, e.sasia, e.njesia, e.bill_id, e.page_number,
              e.quickbooks_synced, e.created_at
         FROM expenses e
         ${where}
         ORDER BY e.date DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, pageSize, offset]
    ),
    query(`SELECT COUNT(*) FROM expenses e ${where}`, params),
  ]);

  return res.json({
    expenses: dataRes.rows,
    total: parseInt(countRes.rows[0].count),
    page,
    pageSize,
  });
});

// ---------------------------------------------------------------------------
// POST /api/expenses  (create one or many – used by Splitter dialog)
// ---------------------------------------------------------------------------
router.post("/", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { expenses } = req.body as { expenses: any[] };

    if (!Array.isArray(expenses) || expenses.length === 0) {
      return res.status(400).json({ error: "expenses array required" });
    }

    const client = await getClient();
    const inserted: string[] = [];

    try {
      await client.query("BEGIN");

      for (const exp of expenses) {
        const id = exp.id || crypto.randomUUID();
        await client.query(
          `INSERT INTO expenses
            (id, company_id, user_id, bill_id, batch_id,
             name, category, amount, date, merchant,
             vat_code, tvsh_percentage, nui, nr_fiskal, numri_i_tvsh_se,
             sasia, njesia, description, page_number)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
          [
            id, user.companyId, user.userId,
            exp.billId || null, exp.batchId || null,
            exp.name, exp.category, exp.amount, exp.date,
            exp.merchant || null, exp.vatCode || "No VAT",
            exp.tvshPercentage || 0,
            exp.nui || null, exp.nrFiskal || null, exp.numriITvshSe || null,
            exp.sasia || 1, exp.njesia || "cope",
            exp.description || null, exp.pageNumber || 1,
          ]
        );
        inserted.push(id);
      }

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    return res.status(201).json({ inserted });
  } catch (err: any) {
    console.error("Create expense error:", err);
    return res.status(500).json({ error: "Failed to create expenses" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/expenses/:id
// ---------------------------------------------------------------------------
router.patch("/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const fields = req.body;

    // Map camelCase body to snake_case columns
    const map: Record<string, string> = {
      name: "name", category: "category", amount: "amount", date: "date",
      merchant: "merchant", vatCode: "vat_code", tvshPercentage: "tvsh_percentage",
      nui: "nui", nrFiskal: "nr_fiskal", numriITvshSe: "numri_i_tvsh_se",
      sasia: "sasia", njesia: "njesia", description: "description",
    };

    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    for (const [key, col] of Object.entries(map)) {
      if (fields[key] !== undefined) {
        sets.push(`${col} = $${idx}`);
        params.push(fields[key]);
        idx++;
      }
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    params.push(req.params.id, user.companyId, user.userId);
    await query(
      `UPDATE expenses SET ${sets.join(", ")}
        WHERE id = $${idx} AND company_id = $${idx + 1} AND user_id = $${idx + 2}`,
      params
    );

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: "Update failed" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/expenses/:id
// ---------------------------------------------------------------------------
router.delete("/:id", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  await query(
    `DELETE FROM expenses WHERE id = $1 AND company_id = $2 AND user_id = $3`,
    [req.params.id, user.companyId, user.userId]
  );
  return res.json({ success: true });
});

// ---------------------------------------------------------------------------
// POST /api/expenses/bulk-delete
// ---------------------------------------------------------------------------
router.post("/bulk-delete", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { ids } = req.body as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids array required" });
    }

    // Use ANY() for efficient bulk delete
    await query(
      `DELETE FROM expenses WHERE id = ANY($1) AND company_id = $2 AND user_id = $3`,
      [ids, user.companyId, user.userId]
    );

    return res.json({ deleted: ids.length });
  } catch {
    return res.status(500).json({ error: "Bulk delete failed" });
  }
});

export default router;
