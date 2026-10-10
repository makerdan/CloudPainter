import { pool } from "@workspace/db";

// Idempotent initial approval. Does not elevate or re-enable an existing row.
// Production Clerk identities may differ; absent membership always fails closed.
try {
  await pool.query(`INSERT INTO image_generation_accounts (user_id, role)
    VALUES ($1, 'admin') ON CONFLICT (user_id) DO NOTHING`,
    ["user_3CXNXKFCFdZJTtcdKojJO0Ia4xB"]);
} finally {
  await pool.end();
}
