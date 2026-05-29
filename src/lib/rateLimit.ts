import { redis } from "@/lib/redis";

export async function checkRateLimit(
  ip: string,
  endpoint: string,
  limit: number,
  windowSecs: number
): Promise<boolean> {
  const key = `rl:${endpoint}:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSecs);
  }
  return count <= limit;
}
