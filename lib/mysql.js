import mysql from "mysql2/promise";

const requiredVariables = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"];
let pool;

function getDatabaseConfig() {
  const missing = requiredVariables.filter((name) => !process.env[name]);
  const port = Number(process.env.DB_PORT || 3306);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    const error = new Error("DB_PORT must be a valid TCP port");
    error.code = "DB_PORT_INVALID";
    throw error;
  }

  if (missing.length) {
    const error = new Error("Database environment is incomplete");
    error.code = "DB_CONFIG_MISSING";
    error.missing = missing;
    throw error;
  }

  return {
    host: process.env.DB_HOST,
    port,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    waitForConnections: true,
    connectionLimit: 2,
    maxIdle: 1,
    idleTimeout: 30_000,
    queueLimit: 0,
    connectTimeout: 8_000,
    enableKeepAlive: true,
  };
}

export function getMysqlPool() {
  if (!pool) pool = mysql.createPool(getDatabaseConfig());
  return pool;
}

export function getMissingDatabaseVariables() {
  return requiredVariables.filter((name) => !process.env[name]);
}
