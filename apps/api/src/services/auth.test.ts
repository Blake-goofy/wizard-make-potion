import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config.js';
import { createAuthService } from './auth.js';

function createConfig(): AppConfig {
  return {
    nodeEnv: 'development',
    appEnv: 'development',
    apiPort: 8787,
    webOrigin: 'http://localhost:5173',
    corsOrigins: ['http://localhost:5173'],
    databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    authSessionSecret: 'test-session-secret',
    resendApiKey: undefined,
    telnyxApiKey: 'telnyx-test-key',
    telnyxSmsFromNumber: '+15550000000',
    telnyxMessagingProfileId: undefined,
    telnyxPublicKey: undefined,
    stripeSecretKey: 'sk_test_configured',
    stripePublishableKey: 'pk_test_configured',
    stripeWebhookSecret: 'whsec_test_configured',
  };
}

function createBearerToken(config: AppConfig, userId: string) {
  const payload = Buffer.from(JSON.stringify({ sub: userId, iat: Date.now() }), 'utf8').toString('base64url');
  const signature = createHmac('sha256', config.authSessionSecret).update(payload).digest('hex');
  return `Bearer ${payload}.${signature}`;
}

describe('auth service', () => {
  it('queues signup verification codes by email', async () => {
    const clientQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
    const db = {
      query: vi.fn().mockResolvedValueOnce({ rows: [], rowCount: 0 }),
      transaction: vi.fn(async (callback: (client: { query: typeof clientQuery }) => Promise<unknown>) => callback({ query: clientQuery })),
    };
    const emailQueue = { processPending: vi.fn() };
    const sms = { queueMessage: vi.fn(), processPending: vi.fn() };
    const auth = createAuthService(createConfig(), db as never, emailQueue as never, {
      sms: sms as never,
      canSendSms: true,
    });

    const result = await auth.createAccount({
      email: 'guest@example.com',
      displayName: 'Guest Buyer',
      password: 'correct horse battery staple',
      phoneNumber: '(555) 123-4567',
      eventReminderOptIn: false,
      upcomingEventsOptIn: false,
    });

    expect(clientQuery).toHaveBeenCalledTimes(2);
    expect(emailQueue.processPending).toHaveBeenCalledTimes(1);
    expect(sms.queueMessage).not.toHaveBeenCalled();
    expect(result).toEqual({
      email: 'guest@example.com',
      verificationDestination: 'guest@example.com',
      message: 'Verification code queued for email delivery.',
    });
  });

  it('queues and confirms account phone verification codes for the saved phone number', async () => {
    const activePhoneNumber = '(555) 123-4567';
    const verificationCode = '123456';
    const config = createConfig();
    const userId = '00000000-0000-4000-8000-000000000099';
    const codeHash = createHmac('sha256', config.authSessionSecret)
      .update(`${userId}:${activePhoneNumber}:${verificationCode}`)
      .digest('hex');
    const clientQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: 'guest@example.com',
          displayName: 'Guest Buyer',
          role: 'customer',
          phoneNumber: activePhoneNumber,
          phoneVerifiedAt: '2026-05-23T12:00:00.000Z',
          eventReminderOptIn: false,
          upcomingEventsOptIn: false,
          smsOptIn: false,
        }],
        rowCount: 1,
      });
    const db = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: userId,
            email: 'guest@example.com',
            displayName: 'Guest Buyer',
            role: 'customer',
            phoneNumber: activePhoneNumber,
            phoneVerifiedAt: null,
            eventReminderOptIn: false,
            upcomingEventsOptIn: false,
            smsOptIn: false,
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{
            id: userId,
            email: 'guest@example.com',
            displayName: 'Guest Buyer',
            role: 'customer',
            phoneNumber: activePhoneNumber,
            phoneVerifiedAt: null,
            eventReminderOptIn: false,
            upcomingEventsOptIn: false,
            smsOptIn: false,
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'verify-1',
            codeHash,
          }],
          rowCount: 1,
        }),
      transaction: vi.fn(async (callback: (client: { query: typeof clientQuery }) => Promise<unknown>) => callback({ query: clientQuery })),
    };
    const emailQueue = { processPending: vi.fn() };
    const sms = { queueMessage: vi.fn(), processPending: vi.fn() };
    const auth = createAuthService(config, db as never, emailQueue as never, {
      sms: sms as never,
      canSendSms: true,
    });
    const request = { headers: { authorization: createBearerToken(config, userId) } } as never;

    const requestResult = await auth.requestPhoneVerification(request);

    expect(sms.queueMessage).toHaveBeenCalledWith({
      toPhoneNumber: activePhoneNumber,
      messageBody: expect.stringContaining('Wizard Make Potion verification code:'),
      messageType: 'transactional',
    });
    expect(requestResult).toEqual({
      phoneNumber: activePhoneNumber,
      message: 'Verification code queued for text delivery.',
    });

  const verifiedAccount = await auth.verifyPhoneNumber(request, { code: verificationCode });

    expect(verifiedAccount.phoneNumber).toBe(activePhoneNumber);
    expect(clientQuery).toHaveBeenNthCalledWith(2,
      expect.stringContaining('set phone_verified_at = now()'),
      [userId],
    );
    expect(emailQueue.processPending).not.toHaveBeenCalled();
    expect(sms.processPending).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenNthCalledWith(4,
      expect.stringContaining('from phone_verification_codes'),
      [userId, activePhoneNumber],
    );
  });
});