/**
 * Bill routes – upload, list, detail, signed-url for viewing.
 */
import { Router, Response } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";

import { query } from "../config/database.js";
import { requireAuth, AuthenticatedRequest, checkScanLimit } from "../middleware/auth.js";
import { requireActiveCompany } from "../middleware/tenancy.js";
import { uploadToGcs, getSignedUrl } from "../services/storage.js";
import { publishBillUpload } from "../services/pubsub.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "image/bmp", "image/heic", "image/heif", "application/pdf",
];

// Middleware: all routes require auth + active company
router.use(requireAuth as any, requireActiveCompany as any);

// ---------------------------------------------------------------------------
// POST /api/bills/upload  (multipart, supports multiple files)
// ---------------------------------------------------------------------------
router.post(
  "/upload",
  upload.array("files", 20),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const files = req.files as Express.Multer.File[];
      const batchId = req.body.batchId || null;

      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files provided" });
      }

      // Check scan limit
      const canScan = await checkScanLimit(user.companyId);
      if (!canScan) {
        return res.status(429).json({ error: "Monthly scan limit reached" });
      }

      const results: { billId: string; filename: string; status: string }[] = [];

      for (const file of files) {
        if (!ALLOWED_TYPES.includes(file.mimetype)) {
          results.push({ billId: "", filename: file.originalname, status: "unsupported" });
          continue;
        }

        const billId = uuidv4();
        const ext = file.originalname.split(".").pop() || "jpg";
        const storagePath = `bills/${user.companyId}/${billId}.${ext}`;

        // Upload to GCS
        await uploadToGcs(storagePath, file.buffer, file.mimetype);

        // Create DB record
        await query(
          `INSERT INTO bills (id, company_id, user_id, batch_id, original_filename, storage_path, file_size_bytes, mime_type, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'queued')`,
          [billId, user.companyId, user.userId, batchId, file.originalname, storagePath, file.size, file.mimetype]
        );

        // Increment company scan counter
        await query(
          `UPDATE companies SET monthly_scans_used = monthly_scans_used + 1 WHERE id = $1`,
          [user.companyId]
        );

        // Publish to Pub/Sub
        await publishBillUpload({
          billId,
          companyId: user.companyId,
          userId: user.userId,
          storagePath,
          mimeType: file.mimetype,
          uploadedAt: new Date().toISOString(),
        });

        results.push({ billId, filename: file.originalname, status: "queued" });
      }

      return res.status(202).json({ results });
    } catch (err: any) {
      console.error("Upload error:", err);
      return res.status(500).json({ error: "Upload failed" });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/bills
// ---------------------------------------------------------------------------
router.get("/", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const status = req.query.status as string | undefined;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = Math.min(100, parseInt(req.query.pageSize as string) || 50);
  const offset = (page - 1) * pageSize;

  let where = `WHERE company_id = $1 AND user_id = $2`;
  const params: any[] = [user.companyId, user.userId];

  if (status && status !== "all") {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }

  const [dataRes, countRes] = await Promise.all([
    query(
      `SELECT id, original_filename, vendor_name, vendor_tax_number, bill_number,
              bill_date, total_amount, currency, status, is_duplicate, duplicate_of_id,
              similarity_score, confidence_score, created_at, processed_at
         FROM bills ${where}
         ORDER BY created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    ),
    query(`SELECT COUNT(*) FROM bills ${where}`, params),
  ]);

  return res.json({
    bills: dataRes.rows,
    total: parseInt(countRes.rows[0].count),
    page,
    pageSize,
  });
});

// ---------------------------------------------------------------------------
// GET /api/bills/:id
// ---------------------------------------------------------------------------
router.get("/:id", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { rows } = await query(
    `SELECT * FROM bills WHERE id = $1 AND company_id = $2 AND user_id = $3`,
    [req.params.id, user.companyId, user.userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: "Bill not found" });
  return res.json(rows[0]);
});

// ---------------------------------------------------------------------------
// GET /api/bills/:id/image  → signed URL for receipt image
// ---------------------------------------------------------------------------
router.get("/:id/image", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { rows } = await query(
    `SELECT storage_path FROM bills WHERE id = $1 AND company_id = $2 AND user_id = $3`,
    [req.params.id, user.companyId, user.userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: "Bill not found" });

  const url = await getSignedUrl(rows[0].storage_path);
  return res.json({ url });
});

// ---------------------------------------------------------------------------
// GET /api/bills/:id/expenses  → expenses for a specific bill
// ---------------------------------------------------------------------------
router.get("/:id/expenses", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { rows } = await query(
    `SELECT * FROM expenses WHERE bill_id = $1 AND company_id = $2 ORDER BY page_number, name`,
    [req.params.id, user.companyId]
  );
  return res.json({ expenses: rows });
});

export default router;
