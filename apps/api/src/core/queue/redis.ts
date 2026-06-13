/** BullMQ connection options parsed from REDIS_URL. Letting BullMQ own the ioredis
 *  instance avoids dual-version type clashes from importing ioredis directly. */
export function redisConnectionOptions() {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.username ? { username: url.username } : {}),
    ...(url.password ? { password: url.password } : {}),
    maxRetriesPerRequest: null as null,
  };
}
