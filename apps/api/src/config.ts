import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const defaultAuthSessionSecret = 'dev-session-secret-change-me';

function findEnvFile(fileName: string) {
  const startDirs = [process.cwd(), dirname(fileURLToPath(import.meta.url))];

  for (const startDir of startDirs) {
    let currentDir = resolve(startDir);

    while (true) {
      const candidatePath = join(currentDir, fileName);

      if (existsSync(candidatePath)) return candidatePath;

      const parentDir = dirname(currentDir);
      if (parentDir === currentDir) break;
      currentDir = parentDir;
    }
  }

  return fileName;
}

loadDotenv({ path: findEnvFile('.env.local') });
loadDotenv({ path: findEnvFile('.env') });

type AppEnv = 'development' | 'production';

function resolveAppEnv(nodeEnv: 'development' | 'test' | 'production', appEnv?: AppEnv) {
  const resolvedAppEnv = appEnv ?? (nodeEnv === 'production' ? 'production' : 'development');

  if (resolvedAppEnv === 'production' && nodeEnv !== 'production') {
    throw new Error('APP_ENV=production requires NODE_ENV=production');
  }

  if (resolvedAppEnv === 'development' && nodeEnv === 'production') {
    throw new Error('APP_ENV=development cannot run with NODE_ENV=production');
  }

  return resolvedAppEnv;
}

function getStageOverrideKey(baseKey: string, appEnv: AppEnv) {
  return `${baseKey}_${appEnv === 'production' ? 'PROD' : 'DEV'}`;
}

function readAppModeValue(env: Record<string, unknown>, baseKey: string, appEnv: AppEnv) {
  const overrideKey = getStageOverrideKey(baseKey, appEnv);
  const overrideValue = env[overrideKey];

  return typeof overrideValue === 'string' && overrideValue.length > 0
    ? overrideValue
    : undefined;
}

function readDatabaseUrl(env: Record<string, unknown>, appEnv: AppEnv) {
  const databaseUrl = readAppModeValue(env, 'DATABASE_URL', appEnv);

  if (databaseUrl && databaseUrl !== 'replace-with-production-database-url') return databaseUrl;
  if (appEnv === 'development') return 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

  throw new Error('DATABASE_URL_PROD is required when APP_ENV=production');
}

function readCorsOrigins(webOrigin: string, webOrigins?: string) {
  const origins = webOrigins
    ?.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0) ?? [];

  return Array.from(new Set([webOrigin, ...origins]));
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['development', 'production']).optional(),
  PORT: z.coerce.number().int().positive().optional(),
  API_PORT: z.coerce.number().int().positive().default(8787),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  WEB_ORIGINS: z.string().optional(),
  DATABASE_URL_DEV: z.string().optional(),
  DATABASE_URL_PROD: z.string().optional(),
  AUTH_SESSION_SECRET: z.string().optional(),
  ADMIN_SESSION_SECRET: z.string().optional(),
  EMAIL_FROM_ADDRESS_DEV: z.string().email().optional(),
  EMAIL_FROM_ADDRESS_PROD: z.string().email().optional(),
  EMAIL_FROM_NAME_DEV: z.string().optional(),
  EMAIL_FROM_NAME_PROD: z.string().optional(),
  RESEND_API_KEY_DEV: z.string().optional(),
  RESEND_API_KEY_PROD: z.string().optional(),
  STRIPE_SECRET_KEY_DEV: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY_DEV: z.string().optional(),
  STRIPE_WEBHOOK_SECRET_DEV: z.string().optional(),
  STRIPE_SECRET_KEY_PROD: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY_PROD: z.string().optional(),
  STRIPE_WEBHOOK_SECRET_PROD: z.string().optional(),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig() {
  const env = envSchema.parse(process.env);
  const appEnv = resolveAppEnv(env.NODE_ENV, env.APP_ENV);

  return {
    nodeEnv: env.NODE_ENV,
    appEnv,
    apiPort: env.PORT ?? env.API_PORT,
    webOrigin: env.WEB_ORIGIN,
    corsOrigins: readCorsOrigins(env.WEB_ORIGIN, env.WEB_ORIGINS),
    databaseUrl: readDatabaseUrl(env, appEnv),
    authSessionSecret: env.AUTH_SESSION_SECRET ?? env.ADMIN_SESSION_SECRET ?? defaultAuthSessionSecret,
    emailFromAddress: readAppModeValue(env, 'EMAIL_FROM_ADDRESS', appEnv) ?? 'onboarding@resend.dev',
    emailFromName: readAppModeValue(env, 'EMAIL_FROM_NAME', appEnv) ?? 'Wizard Make Potion Tickets',
    resendApiKey: readAppModeValue(env, 'RESEND_API_KEY', appEnv),
    stripeSecretKey: readAppModeValue(env, 'STRIPE_SECRET_KEY', appEnv),
    stripePublishableKey: readAppModeValue(env, 'STRIPE_PUBLISHABLE_KEY', appEnv),
    stripeWebhookSecret: readAppModeValue(env, 'STRIPE_WEBHOOK_SECRET', appEnv),
  };
}
