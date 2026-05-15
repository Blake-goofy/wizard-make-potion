import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from './config.js';

const originalEnv = { ...process.env };

afterEach(() => {
  vi.unstubAllEnvs();
  process.env = { ...originalEnv };
});

describe('loadConfig', () => {
  it('uses dev Stripe and Resend values for local app mode', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('STRIPE_SECRET_KEY_DEV', 'sk_dev');
    vi.stubEnv('STRIPE_PUBLISHABLE_KEY_DEV', 'pk_dev');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET_DEV', 'whsec_dev');
    vi.stubEnv('RESEND_API_KEY_DEV', 're_dev');
    vi.stubEnv('EMAIL_FROM_ADDRESS_DEV', 'dev@wizardmakepotion.com');
    vi.stubEnv('EMAIL_FROM_NAME_DEV', 'Wizard Make Potion Dev');
    vi.stubEnv('DATABASE_URL_DEV', 'postgresql://dev-db');

    const config = loadConfig();

    expect(config.appEnv).toBe('development');
    expect(config.stripeSecretKey).toBe('sk_dev');
    expect(config.stripePublishableKey).toBe('pk_dev');
    expect(config.stripeWebhookSecret).toBe('whsec_dev');
    expect(config.resendApiKey).toBe('re_dev');
    expect(config.emailFromAddress).toBe('dev@wizardmakepotion.com');
    expect(config.emailFromName).toBe('Wizard Make Potion Dev');
    expect(config.databaseUrl).toBe('postgresql://dev-db');
  });

  it('uses prod Stripe and Resend values only with production node runtime', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY_PROD', 'sk_prod');
    vi.stubEnv('STRIPE_PUBLISHABLE_KEY_PROD', 'pk_prod');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET_PROD', 'whsec_prod');
    vi.stubEnv('RESEND_API_KEY_PROD', 're_prod');
    vi.stubEnv('EMAIL_FROM_ADDRESS_PROD', 'tickets@wizardmakepotion.com');
    vi.stubEnv('DATABASE_URL_PROD', 'postgresql://prod-db');

    const config = loadConfig();

    expect(config.appEnv).toBe('production');
    expect(config.stripeSecretKey).toBe('sk_prod');
    expect(config.stripePublishableKey).toBe('pk_prod');
    expect(config.stripeWebhookSecret).toBe('whsec_prod');
    expect(config.resendApiKey).toBe('re_prod');
    expect(config.emailFromAddress).toBe('tickets@wizardmakepotion.com');
    expect(config.databaseUrl).toBe('postgresql://prod-db');
  });

  it('ignores unsuffixed provider keys', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('RESEND_API_KEY', 're_base');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_base');
    vi.stubEnv('STRIPE_PUBLISHABLE_KEY', 'pk_base');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_base');
    delete process.env.RESEND_API_KEY_DEV;
    delete process.env.STRIPE_SECRET_KEY_DEV;
    delete process.env.STRIPE_PUBLISHABLE_KEY_DEV;
    delete process.env.STRIPE_WEBHOOK_SECRET_DEV;

    const config = loadConfig();

    expect(config.resendApiKey).toBeUndefined();
    expect(config.stripeSecretKey).toBeUndefined();
    expect(config.stripePublishableKey).toBeUndefined();
    expect(config.stripeWebhookSecret).toBeUndefined();
  });

  it('requires a production database URL for production app mode', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ENV', 'production');

    expect(() => loadConfig()).toThrow('DATABASE_URL_PROD is required when APP_ENV=production');
  });

  it('keeps supporting legacy development Stripe keys and admin session secret', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('AUTH_SESSION_SECRET', undefined);
    delete process.env.AUTH_SESSION_SECRET;
    vi.stubEnv('STRIPE_SECRET_KEY_DEV', 'sk_dev');
    vi.stubEnv('STRIPE_PUBLISHABLE_KEY_DEV', 'pk_dev');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET_DEV', 'whsec_dev');
    vi.stubEnv('ADMIN_SESSION_SECRET', 'legacy-secret');

    const config = loadConfig();

    expect(config.appEnv).toBe('development');
    expect(config.stripeSecretKey).toBe('sk_dev');
    expect(config.stripePublishableKey).toBe('pk_dev');
    expect(config.stripeWebhookSecret).toBe('whsec_dev');
    expect(config.authSessionSecret).toBe('legacy-secret');
  });

  it('rejects prod app mode outside production node runtime', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_ENV', 'production');

    expect(() => loadConfig()).toThrow('APP_ENV=production requires NODE_ENV=production');
  });

  it('rejects dev app mode with production node runtime', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ENV', 'development');

    expect(() => loadConfig()).toThrow('APP_ENV=development cannot run with NODE_ENV=production');
  });
});