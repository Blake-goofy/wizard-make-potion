import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from './config.js';

const originalEnv = { ...process.env };

afterEach(() => {
  vi.unstubAllEnvs();
  process.env = { ...originalEnv };
});

describe('loadConfig', () => {
  it('uses dev Stripe and Resend values for development app mode', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('STRIPE_SECRET_KEY_DEV', 'sk_dev');
    vi.stubEnv('STRIPE_PUBLISHABLE_KEY_DEV', 'pk_dev');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET_DEV', 'whsec_dev');
    vi.stubEnv('RESEND_API_KEY_DEV', 're_dev');
    vi.stubEnv('TELNYX_API_KEY_DEV', 'telnyx_dev');
    vi.stubEnv('TELNYX_SMS_FROM_NUMBER_DEV', '+18445550001');
    vi.stubEnv('TELNYX_MESSAGING_PROFILE_ID_DEV', 'profile-dev');
    vi.stubEnv('TELNYX_PUBLIC_KEY_DEV', 'telnyx_public_dev');
    vi.stubEnv('DATABASE_URL_DEV', 'postgresql://dev-db');

    const config = loadConfig();

    expect(config.appEnv).toBe('development');
    expect(config.stripeSecretKey).toBe('sk_dev');
    expect(config.stripePublishableKey).toBe('pk_dev');
    expect(config.stripeWebhookSecret).toBe('whsec_dev');
    expect(config.resendApiKey).toBe('re_dev');
    expect(config.telnyxApiKey).toBe('telnyx_dev');
    expect(config.telnyxSmsFromNumber).toBe('+18445550001');
    expect(config.telnyxMessagingProfileId).toBe('profile-dev');
    expect(config.telnyxPublicKey).toBe('telnyx_public_dev');
    expect(config.databaseUrl).toBe('postgresql://dev-db');
  });

  it('uses prod Stripe and Resend values only with production node runtime', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('WEB_ORIGIN', 'https://wizardmakepotion.com');
    vi.stubEnv('STRIPE_SECRET_KEY_PROD', 'sk_prod');
    vi.stubEnv('STRIPE_PUBLISHABLE_KEY_PROD', 'pk_prod');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET_PROD', 'whsec_prod');
    vi.stubEnv('RESEND_API_KEY_PROD', 're_prod');
    vi.stubEnv('TELNYX_API_KEY_PROD', 'telnyx_prod');
    vi.stubEnv('TELNYX_SMS_FROM_NUMBER_PROD', '+18445559999');
    vi.stubEnv('TELNYX_MESSAGING_PROFILE_ID_PROD', 'profile-prod');
    vi.stubEnv('TELNYX_PUBLIC_KEY_PROD', 'telnyx_public_prod');
    vi.stubEnv('DATABASE_URL_PROD', 'postgresql://prod-db');

    const config = loadConfig();

    expect(config.appEnv).toBe('production');
    expect(config.stripeSecretKey).toBe('sk_prod');
    expect(config.stripePublishableKey).toBe('pk_prod');
    expect(config.stripeWebhookSecret).toBe('whsec_prod');
    expect(config.resendApiKey).toBe('re_prod');
    expect(config.telnyxApiKey).toBe('telnyx_prod');
    expect(config.telnyxSmsFromNumber).toBe('+18445559999');
    expect(config.telnyxMessagingProfileId).toBe('profile-prod');
    expect(config.telnyxPublicKey).toBe('telnyx_public_prod');
    expect(config.databaseUrl).toBe('postgresql://prod-db');
  });

  it('ignores unsuffixed provider keys', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('RESEND_API_KEY', 're_base');
    vi.stubEnv('TELNYX_API_KEY', 'telnyx_base');
    vi.stubEnv('TELNYX_SMS_FROM_NUMBER', '+18445550001');
    vi.stubEnv('TELNYX_MESSAGING_PROFILE_ID', 'profile-base');
    vi.stubEnv('TELNYX_PUBLIC_KEY', 'telnyx_public_base');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_base');
    vi.stubEnv('STRIPE_PUBLISHABLE_KEY', 'pk_base');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_base');
    delete process.env.RESEND_API_KEY_DEV;
    delete process.env.TELNYX_API_KEY_DEV;
    delete process.env.TELNYX_SMS_FROM_NUMBER_DEV;
    delete process.env.TELNYX_MESSAGING_PROFILE_ID_DEV;
    delete process.env.TELNYX_PUBLIC_KEY_DEV;
    delete process.env.STRIPE_SECRET_KEY_DEV;
    delete process.env.STRIPE_PUBLISHABLE_KEY_DEV;
    delete process.env.STRIPE_WEBHOOK_SECRET_DEV;

    const config = loadConfig();

    expect(config.resendApiKey).toBeUndefined();
    expect(config.telnyxApiKey).toBeUndefined();
    expect(config.telnyxSmsFromNumber).toBeUndefined();
    expect(config.telnyxMessagingProfileId).toBeUndefined();
    expect(config.telnyxPublicKey).toBeUndefined();
    expect(config.stripeSecretKey).toBeUndefined();
    expect(config.stripePublishableKey).toBeUndefined();
    expect(config.stripeWebhookSecret).toBeUndefined();
  });

  it('uses the canonical web origin plus extra CORS origins', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('WEB_ORIGIN', 'https://wizardmakepotion.com');
    vi.stubEnv('WEB_ORIGINS', 'https://www.wizardmakepotion.com, https://potionweb-development.up.railway.app, https://wizardmakepotion.com');

    const config = loadConfig();

    expect(config.webOrigin).toBe('https://wizardmakepotion.com');
    expect(config.corsOrigins).toEqual([
      'https://wizardmakepotion.com',
      'https://www.wizardmakepotion.com',
      'https://potionweb-development.up.railway.app',
    ]);
  });

  it('requires a production database URL for production app mode', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('WEB_ORIGIN', 'https://wizardmakepotion.com');
    vi.stubEnv('STRIPE_SECRET_KEY_PROD', 'sk_prod');
    vi.stubEnv('STRIPE_PUBLISHABLE_KEY_PROD', 'pk_prod');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET_PROD', 'whsec_prod');
    vi.stubEnv('RESEND_API_KEY_PROD', 're_prod');
    delete process.env.DATABASE_URL_PROD;

    expect(() => loadConfig()).toThrow('DATABASE_URL_PROD is required when APP_ENV=production');
  });

  it('requires a public https web origin for production app mode', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('DATABASE_URL_PROD', 'postgresql://prod-db');
    vi.stubEnv('STRIPE_SECRET_KEY_PROD', 'sk_prod');
    vi.stubEnv('STRIPE_PUBLISHABLE_KEY_PROD', 'pk_prod');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET_PROD', 'whsec_prod');
    vi.stubEnv('RESEND_API_KEY_PROD', 're_prod');
    delete process.env.WEB_ORIGIN;

    expect(() => loadConfig()).toThrow('WEB_ORIGIN must be the public https site origin when APP_ENV=production');
  });

  it('requires production provider keys for production app mode', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('WEB_ORIGIN', 'https://wizardmakepotion.com');
    vi.stubEnv('DATABASE_URL_PROD', 'postgresql://prod-db');
    delete process.env.STRIPE_SECRET_KEY_PROD;

    expect(() => loadConfig()).toThrow('STRIPE_SECRET_KEY_PROD is required when APP_ENV=production');
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