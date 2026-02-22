/**
 * PostgreSQL connection pool with pgvector support.
 * In Cloud Run, connect via Unix socket (/cloudsql/<INSTANCE_CONNECTION_NAME>).
 * Locally, connect via TCP host/port.
 */
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

// Cloud SQL Auth Proxy (Unix socket) takes precedence in production
const instanceConnectionName = process.env.INSTANCE_CONNECTION_NAME;

const poolConfig: pg.PoolConfig = instanceConnectionName
  ? {
      // Cloud Run: Unix socket provided by the Cloud SQL proxy sidecar
      host: `/cloudsql/${instanceConnectionName}`,
      database: process.env.DB_NAME || "fatural",
      user: process.env.DB_USER || "fatural-app",
      password: process.env.DB_PASSWORD || "",
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    }
  : {
      // Local development: TCP
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "5432"),
      database: process.env.DB_NAME || "fatural",
      user: process.env.DB_USER || "fatural",
      password: process.env.DB_PASSWORD || "",
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    };

const pool = new pg.Pool(poolConfig);

// Register pgvector type on first connection
pool.on("connect", async (client) => {
  await client.query("SET search_path TO public");
  // pgvector is handled automatically by the extension
});

pool.on("error", (err) => {
  console.error("Unexpected pool error:", err);
});

/** Run a parameterised query. */
export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

/** Get a dedicated client for transactions. */
export async function getClient() {
  const client = await pool.connect();
  return client;
}

/** Health-check: attempt a simple SELECT 1. */
export async function checkConnection(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export default pool;
