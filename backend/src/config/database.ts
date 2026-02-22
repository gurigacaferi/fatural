/**
 * PostgreSQL connection pool with pgvector support.
 */
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new pg.Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "fatural",
  user: process.env.DB_USER || "fatural",
  password: process.env.DB_PASSWORD || "",
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

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
