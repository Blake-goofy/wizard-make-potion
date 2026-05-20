import type { FastifyRequest } from 'fastify';

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  maxAttempts: number;
  windowMs: number;
  message?: string;
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

  return (request: FastifyRequest, keyParts: Array<string | number | null | undefined>) => {
    const now = Date.now();

    if (attempts.size > 1000) {
      for (const [key, entry] of attempts.entries()) {
        if (entry.resetAt <= now) attempts.delete(key);
      }
    }

    const key = [request.ip, ...keyParts].map(normalizeKeyPart).join(':');
    const existingEntry = attempts.get(key);
    const entry = existingEntry && existingEntry.resetAt > now
      ? existingEntry
      : { count: 0, resetAt: now + options.windowMs };

    if (entry.count >= options.maxAttempts) {
      throw createHttpError(options.message ?? 'Too many attempts. Please wait a moment and try again.', 429);
    }

    entry.count += 1;
    attempts.set(key, entry);
  };
}