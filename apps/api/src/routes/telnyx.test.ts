import { generateKeyPairSync, sign } from 'node:crypto';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config.js';
import type { SmsService } from '../services/sms.js';
import { registerTelnyxRoutes } from './telnyx.js';

const keyPair = generateKeyPairSync('ed25519');

function createConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'development',
    appEnv: 'development',
    apiPort: 8787,
    webOrigin: 'http://localhost:5173',
    corsOrigins: ['http://localhost:5173'],
    databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    authSessionSecret: 'test-session-secret',
    resendApiKey: undefined,
    telnyxApiKey: undefined,
    telnyxSmsFromNumber: undefined,
    telnyxMessagingProfileId: undefined,
    telnyxPublicKey: keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    stripeSecretKey: 'sk_test_configured',
    stripePublishableKey: 'pk_test_configured',
    stripeWebhookSecret: 'whsec_test_configured',
    ...overrides,
  };
}

function createSms(): SmsService {
  return {
    handleInboundMessage: vi.fn().mockResolvedValue({
      duplicate: false,
      keyword: 'STOP',
      replyMessage: 'reply',
      storedPhoneNumber: '(555) 123-4567',
    }),
    processPending: vi.fn().mockResolvedValue({ processed: 1, pending: 1 }),
  } as unknown as SmsService;
}

function signPayload(payload: string, timestamp: string) {
  return sign(null, Buffer.from(`${timestamp}|${payload}`, 'utf8'), keyPair.privateKey).toString('base64');
}

async function createServer(config = createConfig(), sms = createSms()) {
  const server = Fastify();

  server.setErrorHandler((error, _request, reply) => {
    const errorShape = error as { statusCode?: unknown; message?: unknown };
    const statusCode = typeof errorShape.statusCode === 'number' ? errorShape.statusCode : 500;
    const message = typeof errorShape.message === 'string'
      ? errorShape.message
      : 'Something went wrong on the server. Please try again.';

    return reply.code(statusCode).send({ message });
  });

  server.removeContentTypeParser('application/json');
  server.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });

  await registerTelnyxRoutes(server, { config, sms });
  return { server, sms };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('telnyx webhook route', () => {
  it('verifies the signature and forwards inbound STOP messages to the SMS service', async () => {
    const { server, sms } = await createServer();
    const payload = JSON.stringify({
      data: {
        id: '4ef8c3a6-4195-4389-b3a6-38e3cb9eb4ae',
        event_type: 'message.received',
        occurred_at: '2026-05-23T15:00:00.000Z',
        payload: {
          from: { phone_number: '+1 (555) 123-4567' },
          to: [{ phone_number: '+1 (555) 000-0000' }],
          text: 'STOP',
        },
      },
    });
    const timestamp = `${Math.floor(Date.now() / 1000)}`;

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/telnyx/webhook',
        headers: {
          'Content-Type': 'application/json',
          'telnyx-timestamp': timestamp,
          'telnyx-signature-ed25519': signPayload(payload, timestamp),
        },
        payload,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ received: true, duplicate: false, keyword: 'STOP' });
      expect(sms.handleInboundMessage).toHaveBeenCalledWith(expect.objectContaining({
        providerEventId: '4ef8c3a6-4195-4389-b3a6-38e3cb9eb4ae',
        fromPhoneNumber: '+1 (555) 123-4567',
        toPhoneNumber: '+1 (555) 000-0000',
        messageText: 'STOP',
      }));
      expect(sms.processPending).toHaveBeenCalledTimes(1);
    } finally {
      await server.close();
    }
  });

  it('rejects invalid Telnyx signatures', async () => {
    const { server, sms } = await createServer();
    const payload = JSON.stringify({
      data: {
        id: '4ef8c3a6-4195-4389-b3a6-38e3cb9eb4ae',
        event_type: 'message.received',
        payload: {
          from: { phone_number: '+15551234567' },
          to: [{ phone_number: '+15550000000' }],
          text: 'HELP',
        },
      },
    });

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/telnyx/webhook',
        headers: {
          'Content-Type': 'application/json',
          'telnyx-timestamp': '1716476400',
          'telnyx-signature-ed25519': 'invalid-signature',
        },
        payload,
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ message: 'Telnyx webhook signature was not accepted.' });
      expect(sms.handleInboundMessage).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('acknowledges non-inbound message events without processing them', async () => {
    const { server, sms } = await createServer();
    const payload = JSON.stringify({
      data: {
        id: '4ef8c3a6-4195-4389-b3a6-38e3cb9eb4ae',
        event_type: 'message.finalized',
        payload: {},
      },
    });
    const timestamp = '1716476400';

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/telnyx/webhook',
        headers: {
          'Content-Type': 'application/json',
          'telnyx-timestamp': timestamp,
          'telnyx-signature-ed25519': signPayload(payload, timestamp),
        },
        payload,
      });

      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ received: true, ignored: true });
      expect(sms.handleInboundMessage).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });
});