import { getMissingDatabaseVariables, getMysqlPool } from "../lib/mysql.js";

const safeDatabaseReasons = new Set([
  "ER_ACCESS_DENIED_ERROR",
  "ER_BAD_DB_ERROR",
  "ER_CON_COUNT_ERROR",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "DB_PORT_INVALID",
  "DB_CONFIG_MISSING",
]);

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const missing = getMissingDatabaseVariables();
  if (missing.length) {
    return response.status(503).json({
      ok: false,
      error: "database_configuration_missing",
      missing,
    });
  }

  let connection;
  try {
    connection = await getMysqlPool().getConnection();
    await connection.query("SELECT 1");
    return response.status(200).json({
      ok: true,
      database: "connected",
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    const reason = safeDatabaseReasons.has(error?.code) ? error.code : "UNKNOWN_ERROR";
    console.error("MySQL health check failed", reason);
    return response.status(503).json({
      ok: false,
      error: "database_unavailable",
      reason,
    });
  } finally {
    connection?.release();
  }
}
