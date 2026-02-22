/**
 * Fatural Backend – Express API entry point.
 */
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

import { checkConnection } from "./config/database.js";
import authRoutes from "./routes/auth.js";
import billRoutes from "./routes/bills.js";
import expenseRoutes from "./routes/expenses.js";
import exportRoutes from "./routes/export.js";
import quickbooksRoutes from "./routes/quickbooks.js";
import adminRoutes from "./routes/admin.js";

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || "4000");

// Trust Cloud Run / GCP load balancer proxy
app.set("trust proxy", 1);

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));

// Global rate-limit (100 req / 15 min per IP)
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use("/api/auth", authRoutes);
app.use("/api/bills", billRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/quickbooks", quickbooksRoutes);
app.use("/api/admin", adminRoutes);

// ---------------------------------------------------------------------------
// Health checks
// ---------------------------------------------------------------------------
app.get("/", (_req, res) => {
  res.json({ service: "Fatural API", status: "healthy", version: "2.0.0" });
});

app.get("/health", async (_req, res) => {
  const dbOk = await checkConnection();
  res.json({
    status: dbOk ? "healthy" : "degraded",
    database: dbOk ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Unhandled error:", err);
    res.status(err.status || 500).json({
      error: err.message || "Internal server error",
    });
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 Fatural API running on http://localhost:${PORT}`);
});

export default app;
