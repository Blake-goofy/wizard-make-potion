import { createHash } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { Database } from '@potion/db';

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  maxAttempts: number;
  windowMs: number;
  message?: string;
  db?: Database;
  scope?: string;
};

function createHttpError(message: string, statusCode: number) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

function normalizeKeyPart(value: string | number | null | undefined) {
  return String(value ?? '').trim().toLowerCase();
}

export function createRateLimitGuard(options: RateLimitOptions) {
  const attempts = new Map<string, RateLimitEntry>();
  let nextCleanup = 0;

  return async (request: Pick<FastifyRequest, 'ip'>, keyParts: Array<string | number | null | undefined>) => {
    const now = Date.now();

    if (now >= nextCleanup) {
      for (const [key, entry] of attempts.entries()) {
        if (entry.resetAt <= now) attempts.delete(key);
      }
      nextCleanup = now + 60_000;
    }

    const accountKey = keyParts.map(normalizeKeyPart).join(':');
    // ponytail: bounded local IP/global admission; shared account limits below survive replicas and restarts.
    for (const key of ['global', `ip:${request.ip}`, ...(keyParts.length ? [`account:${accountKey}`] : [])]) {
      const existingEntry = attempts.get(key);
      const entry = existingEntry && existingEntry.resetAt > now
        ? existingEntry
        : { count: 0, resetAt: now + options.windowMs };

      const maximum = key === 'global' ? 500 : options.maxAttempts;
      if (entry.count >= maximum || (!attempts.has(key) && attempts.size >= 4096)) {
        throw createHttpError(options.message ?? 'Too many attempts. Please wait a moment and try again.', 429);
      }

      entry.count += 1;
      attempts.set(key, entry);
    }

    if (options.db) {
      // ponytail: 16,384 shared buckets bound storage; rare collisions throttle conservatively. Upgrade to expiring exact keys if needed.
      const bucket = createHash('sha256').update(`${options.scope}:${accountKey}`).digest().readUInt16BE(0) % 16384;
      const result = await options.db.query<{ count: number }>(
        `insert into security_rate_limits (bucket, count, reset_at)
         values ($1, 1, now() + $2 * interval '1 millisecond')
         on conflict (bucket) do update
         set count = case when security_rate_limits.reset_at <= now() then 1 else security_rate_limits.count + 1 end,
             reset_at = case when security_rate_limits.reset_at <= now() then excluded.reset_at else security_rate_limits.reset_at end
         returning count`,
        [bucket, options.windowMs],
      );
      if (!result.rows[0] || result.rows[0].count > options.maxAttempts) {
        throw createHttpError(options.message ?? 'Too many attempts. Please wait a moment and try again.', 429);
      }
    }
  };
}
