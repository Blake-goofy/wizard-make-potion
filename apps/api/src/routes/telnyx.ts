import { createPublicKey, verify } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config.js';
import type { SmsService } from '../services/sms.js';

type TelnyxPayload = {
  data?: {
    id?: string;
    event_type?: string;
    occurred_at?: string;
    payload?: Record<string, unknown>;
  };
};

function createHttpError(message: string, statusCode: number) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

function normalizePublicKey(publicKey: string) {
  const trimmed = publicKey.trim();

  if (trimmed.includes('BEGIN PUBLIC KEY')) {
    return trimmed;
  }

  const wrapped = trimmed.match(/.{1,64}/g)?.join('\n') ?? trimmed;
  return `-----BEGIN PUBLIC KEY-----\n${wrapped}\n-----END PUBLIC KEY-----`;
}

function verifyTelnyxSignature(rawBody: Buffer, signature: string, timestamp: string, publicKey: string) {
  const message = Buffer.from(`${timestamp}|${rawBody.toString('utf8')}`, 'utf8');
  return verify(null, message, createPublicKey(normalizePublicKey(publicKey)), Buffer.from(signature, 'base64'));
}

function readPhoneNumber(value: unknown) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return undefined;

  const phoneNumber = (value as { phone_number?: unknown }).phone_number;
  return typeof phoneNumber === 'string' ? phoneNumber : undefined;
}

function readToPhoneNumber(payload: Record<string, unknown>) {
  const toValue = payload.to;

  if (Array.isArray(toValue)) {
    return readPhoneNumber(toValue[0]);
  }

  return readPhoneNumber(toValue);
}

function readMessageText(payload: Record<string, unknown>) {
  const candidate = payload.text ?? payload.body ?? payload.text_body ?? payload.message;
  return typeof candidate === 'string' ? candidate : undefined;
}

export async function registerTelnyxRoutes(server: FastifyInstance, deps: { config: AppConfig; sms: SmsService }) {
  server.post('/api/telnyx/webhook', async (request, reply) => {
    const rawBody = request.body;
    if (!(rawBody instanceof Buffer)) {
      throw createHttpError('Telnyx webhook requires the raw request body.', 400);
    }

    const signatureHeader = request.headers['telnyx-signature-ed25519'];
    const timestampHeader = request.headers['telnyx-timestamp'];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    const timestamp = Array.isArray(timestampHeader) ? timestampHeader[0] : timestampHeader;

    if (typeof signature !== 'string' || typeof timestamp !== 'string') {
      throw createHttpError('Telnyx webhook signature headers are required.', 401);
    }

    if (!deps.config.telnyxPublicKey) {
      throw createHttpError('Telnyx webhook public key is not configured.', 503);
    }

    if (!verifyTelnyxSignature(rawBody, signature, timestamp, deps.config.telnyxPublicKey)) {
      throw createHttpError('Telnyx webhook signature was not accepted.', 401);
    }

    let payload: TelnyxPayload;

    try {
      payload = JSON.parse(rawBody.toString('utf8')) as TelnyxPayload;
    } catch {
      throw createHttpError('Telnyx webhook payload was not valid JSON.', 400);
    }

    const eventType = payload.data?.event_type;
    if (eventType !== 'message.received') {
      return reply.code(202).send({ received: true, ignored: true });
    }

    const messagePayload = payload.data?.payload;
    if (!messagePayload) {
      throw createHttpError('Telnyx webhook payload was incomplete.', 400);
    }

    const fromPhoneNumber = readPhoneNumber(messagePayload.from);
    const toPhoneNumber = readToPhoneNumber(messagePayload);
    const messageText = readMessageText(messagePayload);

    if (!fromPhoneNumber || !messageText) {
      throw createHttpError('Telnyx inbound message is missing phone or text fields.', 400);
    }

    const result = await deps.sms.handleInboundMessage({
      providerEventId: payload.data?.id,
      occurredAt: payload.data?.occurred_at,
      fromPhoneNumber,
      toPhoneNumber,
      messageText,
      rawPayload: payload,
    });

    try {
      await deps.sms.processPending();
    } catch (error) {
      request.log.error({ err: error }, 'Processing pending SMS replies failed');
    }

    return reply.code(200).send({
      received: true,
      duplicate: result.duplicate,
      keyword: result.keyword,
    });
  });
}