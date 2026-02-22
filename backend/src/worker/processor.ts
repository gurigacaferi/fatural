/**
 * Pub/Sub Worker – HTTP push endpoint for Cloud Run.
 *
 * Google Cloud Pub/Sub push subscription delivers messages as HTTP POST
 * requests to this service's URL. We verify the OIDC token (Cloud Run
 * handles this automatically when invoker auth is required) and process
 * the bill described in the message payload.
 *
 * Flow:
 * 1. Receive POST / from Pub/Sub push subscription
 * 2. Decode base64 message.data → BillUploadMessage
 * 3. Download image(s) from GCS
 * 4. Extract expense data via Gemini Flash
 * 5. Generate embedding for duplicate detection
 * 6. Check vector similarity (pgvector cosine, threshold 0.95)
 * 7. Save expenses to DB
 * 8. Update bill status (processed / duplicate / error)
 * 9. Return 200 OK (non-2xx causes Pub/Sub to retry)
 */
import express, { Request, Response } from "express";
import { query, getClient } from "../config/database.js";
import { geminiService } from "../services/gemini.js";
import { downloadFromGcs } from "../services/storage.js";

const PORT = parseInt(process.env.PORT || "8080", 10);
const SIMILARITY_THRESHOLD = 0.95;

interface BillUploadMessage {
  billId: string;
  companyId: string;
  userId: string;
  /** Single file path (sent by API) */
  storagePath?: string;
  mimeType?: string;
  uploadedAt?: string;
  /** Legacy: multiple file paths */
  filePaths?: string[];
  batchId?: string;
}

// ---------------------------------------------------------------------------
// Process a single bill
// ---------------------------------------------------------------------------
async function processBill(msg: BillUploadMessage): Promise<void> {
  const { billId, companyId, userId, batchId } = msg;

  // Normalise file paths: accept either storagePath (single) or filePaths (array)
  const filePaths: string[] =
    msg.filePaths && msg.filePaths.length > 0
      ? msg.filePaths
      : msg.storagePath
      ? [msg.storagePath]
      : [];

  if (filePaths.length === 0) {
    console.error(`[Worker] No file paths in message for bill ${billId}`);
    await query(
      `UPDATE bills SET status = 'error', error_message = 'No file paths provided' WHERE id = $1`,
      [billId]
    );
    return;
  }

  console.log(`[Worker] Processing bill ${billId} (${filePaths.length} files)`);

  // Update bill status → processing
  await query(`UPDATE bills SET status = 'processing' WHERE id = $1`, [billId]);

  try {
    // 1. Download files from GCS
    const imageBuffers: Buffer[] = [];
    const mimeTypes: string[] = [];
    for (const fp of filePaths) {
      const buf = await downloadFromGcs(fp);
      imageBuffers.push(buf);
      // Infer MIME from extension
      const ext = fp.split(".").pop()?.toLowerCase() || "jpeg";
      const mimeMap: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        gif: "image/gif",
        bmp: "image/bmp",
        heic: "image/heic",
        heif: "image/heif",
        pdf: "application/pdf",
      };
      mimeTypes.push(mimeMap[ext] || "image/jpeg");
    }

    // 2. Extract expense data via Gemini
    const extracted = await geminiService.extractFromImages(
      imageBuffers,
      mimeTypes
    );

    if (!extracted || extracted.length === 0) {
      await query(
        `UPDATE bills SET status = 'error', error_message = 'No data extracted' WHERE id = $1`,
        [billId]
      );
      return;
    }

    // 3. Generate embedding for the bill
    const embeddingText = geminiService.buildEmbeddingText(extracted);
    const embedding = await geminiService.generateEmbedding(embeddingText);

    // 4. Store embedding on bill & check for duplicates
    if (embedding) {
      await query(
        `UPDATE bills SET embedding = $1::vector WHERE id = $2`,
        [`[${embedding.join(",")}]`, billId]
      );

      // Check similarity against existing bills in same company (exclude self)
      const dupCheck = await query(
        `SELECT id, 1 - (embedding <=> $1::vector) AS similarity
         FROM bills
         WHERE company_id = $2
           AND id != $3
           AND embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector
         LIMIT 1`,
        [`[${embedding.join(",")}]`, companyId, billId]
      );

      if (
        dupCheck.rows.length > 0 &&
        parseFloat(dupCheck.rows[0].similarity) >= SIMILARITY_THRESHOLD
      ) {
        await query(
          `UPDATE bills
           SET status = 'duplicate',
               duplicate_of = $2,
               error_message = $3
           WHERE id = $1`,
          [
            billId,
            dupCheck.rows[0].id,
            `Duplicate detected (${(parseFloat(dupCheck.rows[0].similarity) * 100).toFixed(1)}% similarity)`,
          ]
        );
        console.log(
          `[Worker] Bill ${billId} flagged as duplicate of ${dupCheck.rows[0].id}`
        );
        return;
      }
    }

    // 5. Save extracted expenses
    const client = await getClient();
    try {
      await client.query("BEGIN");

      for (let i = 0; i < extracted.length; i++) {
        const exp = extracted[i];
        await client.query(
          `INSERT INTO expenses
            (id, company_id, user_id, bill_id, batch_id,
             name, category, amount, date, merchant,
             vat_code, tvsh_percentage, nui, nr_fiskal, numri_i_tvsh_se,
             sasia, njesia, description, page_number)
           VALUES (gen_random_uuid(), $1, $2, $3, $4,
                   $5, $6, $7, $8, $9,
                   $10, $11, $12, $13, $14,
                   $15, $16, $17, $18)`,
          [
            companyId,
            userId,
            billId,
            batchId || null,
            exp.name || "Unnamed expense",
            exp.category || "690-09 Te tjera",
            exp.amount || 0,
            exp.date || new Date().toISOString().slice(0, 10),
            exp.merchant || null,
            exp.vatCode || "No VAT",
            exp.tvshPercentage ?? 0,
            exp.nui || null,
            exp.nrFiskal || null,
            exp.numriITvshSe || null,
            exp.sasia ?? 1,
            exp.njesia || "cope",
            exp.description || null,
            exp.pageNumber ?? i + 1,
          ]
        );
      }

      // Update bill status & increment user scan count
      await client.query(
        `UPDATE bills SET status = 'processed', page_count = $2 WHERE id = $1`,
        [billId, extracted.length]
      );
      await client.query(
        `UPDATE users SET scan_count = scan_count + 1 WHERE id = $1`,
        [userId]
      );

      // Audit log
      await client.query(
        `INSERT INTO audit_logs (id, company_id, user_id, action, details)
         VALUES (gen_random_uuid(), $1, $2, 'bill_processed', $3)`,
        [
          companyId,
          userId,
          JSON.stringify({
            billId,
            expenseCount: extracted.length,
            fileCount: filePaths.length,
          }),
        ]
      );

      await client.query("COMMIT");
      console.log(
        `[Worker] Bill ${billId} processed – ${extracted.length} expenses saved`
      );
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error(`[Worker] Error processing bill ${billId}:`, err);
    await query(
      `UPDATE bills SET status = 'error', error_message = $2 WHERE id = $1`,
      [billId, err.message?.slice(0, 500) || "Unknown error"]
    );
  }
}

// ---------------------------------------------------------------------------
// HTTP push handler (Cloud Run receives POST from Pub/Sub push subscription)
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());

/** Health check – Cloud Run startup probe */
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

/**
 * POST /  — Pub/Sub push envelope:
 * {
 *   "message": { "data": "<base64>", "messageId": "...", "publishTime": "..." },
 *   "subscription": "projects/.../subscriptions/..."
 * }
 */
app.post("/", async (req: Request, res: Response) => {
  try {
    const envelope = req.body as {
      message?: { data?: string; messageId?: string };
      subscription?: string;
    };

    if (!envelope?.message?.data) {
      console.error("[Worker] Invalid Pub/Sub envelope – missing message.data");
      // Ack by returning 200 to avoid infinite retry of bad messages
      return res.status(200).json({ error: "Invalid envelope" });
    }

    let payload: BillUploadMessage;
    try {
      const decoded = Buffer.from(envelope.message.data, "base64").toString(
        "utf-8"
      );
      payload = JSON.parse(decoded);
    } catch (parseErr) {
      console.error("[Worker] Failed to parse message data:", parseErr);
      // Ack bad messages so they don't loop forever
      return res.status(200).json({ error: "Bad message payload" });
    }

    console.log(
      `[Worker] Received push for bill ${payload.billId} (msgId: ${envelope.message.messageId})`
    );

    await processBill(payload);

    // Return 200 → Pub/Sub considers message delivered
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("[Worker] Unhandled error in push handler:", err);
    // Return 500 → Pub/Sub will retry according to retry policy
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`[Worker] HTTP push server listening on port ${PORT}`);
});
