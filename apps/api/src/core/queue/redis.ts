/** BullMQ connection options parsed from REDIS_URL. Letting BullMQ own the ioredis
 *  instance avoids dual-version type clashes from importing ioredis directly. */
export function redisConnectionOptions() {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.username ? { username: url.username } : {}),
    ...(url.password ? { password: url.password } : {}),
    // Managed Redis (Upstash, etc.) uses rediss:// (TLS). Because we pass discrete
    // host/port options rather than the URL string, ioredis won't auto-enable TLS —
    // set it explicitly when the scheme is rediss:, or the socket stays plaintext
    // and the provider drops the connection.
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    maxRetriesPerRequest: null as null,
  };
}
