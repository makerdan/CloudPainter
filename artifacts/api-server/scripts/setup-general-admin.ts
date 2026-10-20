import { pool } from "@workspace/db";
import { getApprovedAdminIdentity, validateAdminDatabaseName } from "../src/lib/adminProvisioning";

const target = process.env.CLOUDPAINTER_ADMIN_TARGET_ENV;
const databaseEnvironment = process.env.CLOUDPAINTER_DATABASE_ENV;
const runtimeEnvironment = process.env.NODE_ENV;
const apply = process.argv.includes("--apply");

const userId = getApprovedAdminIdentity({ target, databaseEnvironment, runtimeEnvironment });
if (process.argv.some(argument => argument !== "--apply" && argument !== process.argv[0] && argument !== process.argv[1])) {
  throw new Error("Only the optional --apply flag is supported.");
}

try {
  const expectedDatabase = process.env.CLOUDPAINTER_DATABASE_NAME;
  if (!expectedDatabase) throw new Error("Set CLOUDPAINTER_DATABASE_NAME to the verified target database name.");
  const actual = await pool.query<{ database_name: string }>("SELECT current_database() AS database_name");
  validateAdminDatabaseName(expectedDatabase, actual.rows[0]?.database_name);
  if (!apply) {
    process.stdout.write(`Validated ${target} admin provisioning target and database name for the approved identity. No database changes made; rerun with --apply to seed.\n`);
  } else {
    await pool.query(
      `INSERT INTO cloudpainter_admin_accounts (user_id, enabled)
       VALUES ($1, true) ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );
    process.stdout.write(`General-admin permission seeded for the approved ${target} identity.\n`);
  }
} finally {
  await pool.end();
}
