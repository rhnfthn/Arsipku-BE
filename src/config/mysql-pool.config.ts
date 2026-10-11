export function getPoolSize(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Shared pool settings for the backend and TypeORM CLI/testing tools. */
export function mysqlPoolOptions(connectionLimit: number) {
  return {
    connectionLimit,
    // mysql2 only starts its idle cleanup timer when maxIdle < connectionLimit.
    maxIdle: Math.max(0, connectionLimit - 1),
    idleTimeout: 60_000,
    waitForConnections: true,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  };
}
