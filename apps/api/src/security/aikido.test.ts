import { createHmac, pbkdf2Sync, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { Pool } from 'pg';
import Fastify from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '../../../../packages/db/src/index.js';
import type { AppConfig } from '../config.js';
import { createAuthService } from '../services/auth.js';
import { decryptAuthEmail, encryptAuthEmail } from '../services/emailQueue.js';
import { createOrderService } from '../services/orders.js';
import { createSmsService } from '../services/sms.js';
import { createSmsMessageService } from '../services/smsMessages.js';
import { createRateLimitGuard } from './rateLimit.js';
import { registerAdminRoutes } from '../routes/admin.js';
import { registerScannerRoutes } from '../routes/scanner.js';

// Run with SECURITY_TEST_DATABASE_URL pointing at local Supabase's postgres database.
// A uniquely named disposable database keeps the development database untouched.
const maintenanceUrl = process.env.SECURITY_TEST_DATABASE_URL;
describe.skipIf(!maintenanceUrl)('Aikido regressions against PostgreSQL', () => {
  const databaseName = `potion_security_test_${randomUUID().replaceAll('-', '')}`;
  const secret = 'security-regression-secret';
  const password = 'test-password-123';
  const passwordHash = `pbkdf2$sha256$1$c2FsdA$${pbkdf2Sync(password, 'salt', 1, 32, 'sha256').toString('base64url')}`;
  const phone = '(555) 123-4567';
  let maintenance: Pool;
  let db: ReturnType<typeof createDatabase>;
  let config: AppConfig;
  const emailQueue = { processPending: vi.fn(), enqueueTicketEmail: vi.fn() };
  const sms = { queueMessage: vi.fn(), processPending: vi.fn() };
  const provider = { send: vi.fn().mockResolvedValue({ providerMessageId: 'message-id' }) };
  const auth = () => createAuthService(config, db, emailQueue as never, { sms: sms as never, canSendSms: true });
  const request = (token: string, ip = '127.0.0.1') => ({ ip, headers: { authorization: `Bearer ${token}` } }) as never;

  beforeAll(async () => {
    const url = new URL(maintenanceUrl!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Security tests require local PostgreSQL.');
    maintenance = new Pool({ connectionString: url.toString() });
    await maintenance.query(`create database ${databaseName}`);
    url.pathname = `/${databaseName}`;
    db = createDatabase({ connectionString: url.toString() });
    const migrations = new URL('../../../../supabase/migrations/', import.meta.url);
    for (const file of readdirSync(migrations).filter((file) => file.endsWith('.sql')).sort()) {
      await db.query(readFileSync(new URL(file, migrations), 'utf8'));
    }
    config = {
      nodeEnv: 'test', appEnv: 'development', apiPort: 8787,
      webOrigin: 'http://localhost:5173', corsOrigins: ['http://localhost:5173'],
      databaseUrl: url.toString(), authSessionSecret: secret,
    } as AppConfig;
  }, 30_000);

  beforeEach(async () => {
    await db.query('truncate users, events, email_outbox, sms_outbox, sms_inbound_events, sms_stop_list, sms_messages, security_rate_limits cascade');
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await db?.close();
    if (maintenance) {
      if (!/^potion_security_test_[0-9a-f]{32}$/.test(databaseName)) throw new Error('Unexpected test database name.');
      await maintenance.query(`drop database if exists ${databaseName}`);
      await maintenance.end();
    }
  });

  async function addUser(email = 'member@example.com', role = 'customer', optedIn = true, verified = true) {
    const result = await db.query(
      `insert into users (email, display_name, role, password_hash, phone_number, sms_opt_in, phone_verified_at)
       values ($1, 'Member', $2, $3, $4, $5, case when $6 then now() else null end) returning id`,
      [email, role, passwordHash, phone, optedIn, verified],
    );
    const session = await auth().login({ email, password });
    return { id: result.rows[0].id as string, token: session.token };
  }

  async function addOrder(email = 'member@example.com', quantity = 2) {
    const event = await db.query(
      `insert into events (slug, name, starts_at, address, ticket_price_cents) values ($1, 'Test', now() + interval '1 day', 'Address', 1000) returning id`,
      [randomUUID()],
    );
    const order = await db.query(
      `insert into orders (event_id, customer_email, customer_phone_number, sms_opt_in, quantity,
                           subtotal_cents, tax_cents, total_cents, status, payment_provider, payment_provider_reference, completed_at)
       values ($1, $2, $3, true, $4, 2000, 0, 2000, 'completed', 'stripe', $5, now()) returning id`,
      [event.rows[0].id, email, phone, quantity, randomUUID()],
    );
    return { id: order.rows[0].id as string, eventId: event.rows[0].id as string };
  }

  async function readEmailCode() {
    const result = await db.query('select html_body, text_body, encrypted_body from email_outbox order by created_at desc limit 1');
    expect(result.rows[0].html_body).toBe('');
    expect(result.rows[0].text_body).toBe('');
    return decryptAuthEmail(result.rows[0].encrypted_body, secret).textBody.match(/\b\d{6}\b/)![0];
  }

  it('canonicalizes US numbers without aliasing international senders', async () => {
    const result = await db.query(`select sms_phone($1) as formatted, sms_phone('+15551234567') as e164, sms_phone('+445551234567') as international`, [phone]);
    expect(result.rows[0]).toEqual({ formatted: '+15551234567', e164: '+15551234567', international: null });
    await expect(createSmsService({ db }).handleInboundMessage({ providerEventId: 'international', fromPhoneNumber: '+445551234567', messageText: 'START', rawPayload: {} })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('does not reactivate privileged users even with a pre-existing valid signup code', async () => {
    const user = await addUser('admin@example.com', 'admin');
    await db.query('update users set is_active = false where id = $1', [user.id]);
    const code = '123456';
    const codeHash = createHmac('sha256', secret).update(`admin@example.com:${code}`).digest('hex');
    await db.query(`insert into account_verification_codes (email, display_name, password_hash, code_hash, expires_at) values ('admin@example.com', 'Intruder', $1, $2, now() + interval '1 hour')`, [passwordHash, codeHash]);
    await expect(auth().verifyAccount({ email: 'admin@example.com', code })).rejects.toMatchObject({ statusCode: 401 });
    expect((await db.query('select role, is_active from users where id = $1', [user.id])).rows[0]).toEqual({ role: 'admin', is_active: false });
  });

  it('returns the same registration response for new and active accounts', async () => {
    await addUser();
    const input = { displayName: 'Member', password, smsOptIn: false };
    const existing = await auth().createAccount({ ...input, email: 'member@example.com' });
    const fresh = await auth().createAccount({ ...input, email: 'fresh@example.com' });
    expect(existing.message).toBe(fresh.message);
    expect(existing.verificationDestination).toBe('member@example.com');
    expect((await db.query(`select count(*)::int as count from account_verification_codes where email = 'member@example.com'`)).rows[0].count).toBe(0);
  });

  it('consumes a signup code only once under concurrent verification', async () => {
    await auth().createAccount({ email: 'fresh@example.com', displayName: 'Fresh', password, smsOptIn: false });
    const code = await readEmailCode();
    const results = await Promise.allSettled([auth().verifyAccount({ email: 'fresh@example.com', code }), auth().verifyAccount({ email: 'fresh@example.com', code })]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const success = results.find((result) => result.status === 'fulfilled')!;
    if (success.status === 'fulfilled') await expect(auth().requireUser(request(success.value.token))).resolves.toMatchObject({ email: 'fresh@example.com' });
  });

  it('revokes existing sessions on password change and reset', async () => {
    const user = await addUser();
    await auth().changePassword(request(user.token), { currentPassword: password, newPassword: 'new-password-123' });
    await expect(auth().requireUser(request(user.token))).rejects.toMatchObject({ statusCode: 401 });
    const next = await auth().login({ email: 'member@example.com', password: 'new-password-123' });
    await auth().requestPasswordReset({ email: 'member@example.com' });
    const code = await readEmailCode();
    await auth().resetPassword({ email: 'member@example.com', code, newPassword: 'reset-password-123' });
    await expect(auth().requireUser(request(next.token))).rejects.toMatchObject({ statusCode: 401 });
    await expect(auth().resetPassword({ email: 'member@example.com', code, newPassword: password })).rejects.toMatchObject({ statusCode: 401 });
  });

  it('keeps one active admin under concurrent demotions and blocks self-deletion', async () => {
    const first = await addUser('first@example.com', 'admin');
    const second = await addUser('second@example.com', 'admin');
    const results = await Promise.allSettled([
      auth().updateAdminUser(request(first.token), first.id, { role: 'customer', isActive: true }),
      auth().updateAdminUser(request(second.token), second.id, { role: 'customer', isActive: true }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const remaining = (await db.query(`select email from users where role = 'admin' and is_active = true`)).rows;
    expect(remaining).toHaveLength(1);
    const session = await auth().login({ email: remaining[0].email, password });
    await expect(auth().deleteAccount(request(session.token))).rejects.toMatchObject({ statusCode: 409 });
  });

  it('shares guessing limits across new guards and rotating IPs', async () => {
    for (let index = 0; index < 8; index++) {
      await createRateLimitGuard({ db, scope: 'verify', maxAttempts: 8, windowMs: 900_000 })({ ip: `10.0.0.${index}` }, ['member@example.com']);
    }
    await expect(createRateLimitGuard({ db, scope: 'verify', maxAttempts: 8, windowMs: 900_000 })({ ip: '10.0.1.1' }, ['member@example.com'])).rejects.toMatchObject({ statusCode: 429 });
  });

  it('limits verification SMS sends and guesses by account across IPs', async () => {
    const user = await addUser();
    for (let index = 0; index < 3; index++) await auth().requestPhoneVerification(request(user.token, `10.0.0.${index}`));
    await expect(auth().requestPhoneVerification(request(user.token, '10.0.1.1'))).rejects.toMatchObject({ statusCode: 429 });
    expect(sms.queueMessage).toHaveBeenCalledTimes(3);
    for (let index = 0; index < 8; index++) await expect(auth().verifyPhoneNumber(request(user.token, `10.0.2.${index}`), { code: 'bad-code' })).rejects.toMatchObject({ statusCode: 401 });
    await expect(auth().verifyPhoneNumber(request(user.token, '10.0.3.1'), { code: 'bad-code' })).rejects.toMatchObject({ statusCode: 429 });
  });

  it('does not verify a number changed after challenge validation', async () => {
    const user = await addUser();
    await auth().requestPhoneVerification(request(user.token));
    const code = sms.queueMessage.mock.calls[0][0].messageBody.match(/\b\d{6}\b/)[0];
    const racedDb = { ...db, transaction: async (callback: Parameters<typeof db.transaction>[0]) => {
      await db.query(`update users set phone_number = '(555) 999-0000', phone_verified_at = null where id = $1`, [user.id]);
      return db.transaction(callback);
    } };
    const racedAuth = createAuthService(config, racedDb, emailQueue as never, { sms: sms as never, canSendSms: true });
    await expect(racedAuth.verifyPhoneNumber(request(user.token), { code })).rejects.toMatchObject({ statusCode: 404 });
    expect((await db.query('select phone_verified_at from users where id = $1', [user.id])).rows[0].phone_verified_at).toBeNull();
  });

  it('refuses mismatched, unsettled, and cancelled Stripe payments before ticket creation', async () => {
    const order = await addOrder();
    await db.query(`update orders set status = 'pending', payment_provider_reference = 'cs_original' where id = $1`, [order.id]);
    const orders = createOrderService({ db, config, emailQueue: emailQueue as never, appSettings: {} as never });
    const checkoutKey = randomUUID();
    await db.query(`update orders set checkout_idempotency_key = $2, created_at = now() - interval '2 days' where id = $1`, [order.id, checkoutKey]);
    await expect(orders.getExistingStripeCheckout(
      { eventId: order.eventId, customerEmail: 'member@example.com', customerPhoneNumber: phone, smsOptIn: true, quantity: 1 },
      checkoutKey, { quantity: 1, subtotalCents: 1000, taxCents: 0, totalCents: 1000 },
    )).rejects.toMatchObject({ statusCode: 409 });
    const session = { id: 'cs_original', payment_status: 'paid', amount_total: 2000, currency: 'usd' } as const;
    for (const invalid of [{ ...session, id: 'cs_reused_key' }, { ...session, amount_total: 1000 }, { ...session, currency: 'eur' }, { ...session, payment_status: 'unpaid' as const }]) {
      await expect(orders.completeStripeOrder(order.id, invalid)).rejects.toMatchObject({ statusCode: 409 });
    }
    expect((await db.query('select count(*)::int as count from tickets')).rows[0].count).toBe(0);
    await orders.completeStripeOrder(order.id, session);
    await orders.completeStripeOrder(order.id, session);
    expect((await db.query('select count(*)::int as count from tickets')).rows[0].count).toBe(2);
    expect(emailQueue.enqueueTicketEmail).toHaveBeenCalledTimes(1);
    await db.query(`update orders set status = 'cancelled' where id = $1`, [order.id]);
    await expect(orders.completeStripeOrder(order.id, session)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('quotes concurrent development orders without deadlocking the ten-connection pool', async () => {
    const order = await addOrder();
    const orders = createOrderService({ db, config, emailQueue: emailQueue as never,
      appSettings: { getEventSettings: vi.fn().mockResolvedValue({ eventExpiryBufferMinutes: 360 }) } as never });
    const results = await Promise.all(Array.from({ length: 10 }, () => orders.createDevCompletedOrder({ eventId: order.eventId, customerEmail: 'guest@example.com', quantity: 1 })));
    expect(results).toHaveLength(10);
    expect((await db.query('select count(*)::int as count from tickets')).rows[0].count).toBe(10);
  });

  it('permits genuine free checkout sessions and rejects nonzero unpaid totals', async () => {
    const order = await addOrder();
    await db.query(`update orders set status = 'pending', payment_provider_reference = 'cs_free', subtotal_cents = 0, total_cents = 0 where id = $1`, [order.id]);
    const orders = createOrderService({ db, config, emailQueue: emailQueue as never, appSettings: {} as never });
    const session = { id: 'cs_free', payment_status: 'no_payment_required', amount_total: 0, currency: 'usd' } as const;
    await expect(orders.completeStripeOrder(order.id, { ...session, amount_total: 1000 })).rejects.toMatchObject({ statusCode: 409 });
    await orders.completeStripeOrder(order.id, session);
    expect((await db.query('select count(*)::int as count from tickets')).rows[0].count).toBe(2);
  });

  it('suppresses opted-out admins, unverified guests, historical consent, and STOP aliases', async () => {
    await addUser('member@example.com', 'admin', false);
    const order = await addOrder();
    await addOrder('guest@example.com');
    const delivery = createSmsService({ db, smsProvider: provider });
    const messages = createSmsMessageService({ db, sms: delivery });
    for (const messageType of ['reminder', 'upcoming_event', 'admin'] as const) {
      const message = await messages.createMessage({ eventId: messageType === 'reminder' ? order.eventId : null, messageType, label: 'Test', messageBody: 'Hello', status: 'draft' });
      expect((await messages.sendMessageNow(message.id)).queuedMessages).toBe(0);
    }
    await db.query('update users set sms_opt_in = true');
    await db.query(`insert into sms_stop_list(phone_number) values ('+15551234567')`);
    const message = await messages.createMessage({ messageType: 'admin', label: 'Test', messageBody: 'Hello', status: 'draft' });
    expect((await messages.sendMessageNow(message.id)).queuedMessages).toBe(0);
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('cancels queued messages on STOP and scopes webhook dispatch to its own reply', async () => {
    await addUser();
    const service = createSmsService({ db, smsProvider: provider });
    await service.queueMessage({ toPhoneNumber: phone, messageBody: 'Queued verification' });
    const event = { providerEventId: 'stop-event', fromPhoneNumber: '+15551234567', messageText: 'STOP', rawPayload: {} };
    await service.handleInboundMessage(event);
    await service.handleInboundMessage(event);
    await service.processPending('stop-event');
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(provider.send.mock.calls[0][0].messageBody).toContain('unsubscribed');
    expect((await db.query(`select status from sms_outbox where message_body = 'Queued verification'`)).rows[0].status).toBe('failed');
  });

  it('rechecks STOP at dispatch and avoids duplicate sends by concurrent workers', async () => {
    await addUser();
    const service = createSmsService({ db, smsProvider: provider });
    await service.queueMessage({ toPhoneNumber: phone, messageBody: 'Do not send' });
    await db.query(`insert into sms_stop_list(phone_number) values ($1)`, [phone]);
    await service.processPending();
    expect(provider.send).not.toHaveBeenCalled();
    await db.query('delete from sms_stop_list');
    await service.queueMessage({ toPhoneNumber: phone, messageBody: 'Send once' });
    await Promise.all([service.processPending(), service.processPending()]);
    expect(provider.send).toHaveBeenCalledTimes(1);
  });

  it('limits keyword replies without dropping STOP consent changes', async () => {
    await addUser();
    const service = createSmsService({ db, smsProvider: provider });
    for (let index = 0; index < 4; index++) await service.handleInboundMessage({ providerEventId: `help-${index}`, fromPhoneNumber: phone, messageText: 'HELP', rawPayload: {} });
    await service.handleInboundMessage({ providerEventId: 'stop', fromPhoneNumber: phone, messageText: 'STOP', rawPayload: {} });
    expect((await db.query(`select count(*)::int as count from sms_outbox where message_type = 'reply'`)).rows[0].count).toBe(3);
    expect((await db.query('select sms_opt_in from users')).rows[0].sms_opt_in).toBe(false);
  });

  it('does not let replayed or older delivery events overwrite delivered status', async () => {
    await db.query(`insert into sms_outbox(to_phone, message_body, message_type, status, provider_message_id) values ($1, 'Test', 'reply', 'accepted', 'msg')`, [phone]);
    const service = createSmsService({ db });
    const event = { providerMessageId: 'msg', status: 'delivered' as const, occurredAt: new Date().toISOString() };
    expect((await service.recordDeliveryStatus(event)).updated).toBe(true);
    expect((await service.recordDeliveryStatus(event)).updated).toBe(false);
    expect((await service.recordDeliveryStatus({ ...event, status: 'failed', occurredAt: new Date(Date.now() + 1000).toISOString() })).updated).toBe(false);
  });

  it('authorizes uploads before parsing and keeps scanner credentials and attribution private', async () => {
    const user = await addUser('scanner@example.com', 'scanner');
    const order = await addOrder();
    await db.query(`insert into tickets(order_id, scan_token) values ($1, 'secret-ticket-token')`, [order.id]);
    const server = Fastify();
    const parser = vi.fn((_request, body, done) => done(null, body));
    server.addContentTypeParser('image/png', { parseAs: 'buffer' }, parser);
    const scanner = { scanTicket: vi.fn().mockResolvedValue({ status: 'not_found' }) };
    await registerAdminRoutes(server, { auth: auth(), db, emailQueue, scanner, smsMessages: {}, appSettings: {} } as never);
    await registerScannerRoutes(server, { auth: auth(), scanner, appSettings: {} } as never);
    try {
      const upload = await server.inject({ method: 'PUT', url: `/api/admin/events/${order.eventId}/image`, headers: { 'content-type': 'image/png' }, payload: Buffer.alloc(100) });
      expect(upload.statusCode).toBe(401);
      expect(parser).not.toHaveBeenCalled();
      const tickets = await server.inject({ url: '/api/admin/tickets', headers: { authorization: `Bearer ${user.token}` } });
      expect(tickets.statusCode).toBe(200);
      expect(tickets.json().tickets).toHaveLength(1);
      expect(tickets.body).not.toContain('secret-ticket-token');
      expect(tickets.json().tickets[0]).not.toHaveProperty('scanToken');
      const scan = await server.inject({ method: 'POST', url: '/api/scanner/scan', headers: { authorization: `Bearer ${user.token}` }, payload: { scanToken: 'provided-token', eventId: order.eventId, scannerLabel: 'forged-admin' } });
      expect(scan.statusCode).toBe(200);
      expect(scanner.scanTicket).toHaveBeenCalledWith(expect.objectContaining({ scannerLabel: 'scanner@example.com' }));
    } finally {
      await server.close();
    }
  });
});

it('encrypts authentication mail and rejects tampering or the wrong key', () => {
  const email = { htmlBody: '<p>123456</p>', textBody: '123456' };
  const encrypted = encryptAuthEmail(email, 'secret');
  expect(encrypted).not.toContain('123456');
  expect(decryptAuthEmail(encrypted, 'secret')).toEqual(email);
  expect(() => decryptAuthEmail(encrypted, 'other-secret')).toThrow();
  const [iv, tag, ciphertext] = encrypted.split('.');
  const changed = Buffer.from(ciphertext!, 'base64url');
  changed[0] = changed[0]! ^ 1;
  expect(() => decryptAuthEmail(`${iv}.${tag}.${changed.toString('base64url')}`, 'secret')).toThrow();
});

it('bounds admission state and limits registration when emails vary', async () => {
  const guard = createRateLimitGuard({ maxAttempts: 3, windowMs: 900_000 });
  for (let index = 0; index < 3; index++) await guard({ ip: '127.0.0.1' }, [`${index}@example.com`]);
  await expect(guard({ ip: '127.0.0.1' }, ['another@example.com'])).rejects.toMatchObject({ statusCode: 429 });
  const flood = createRateLimitGuard({ maxAttempts: 3, windowMs: 900_000 });
  for (let index = 0; index < 500; index++) await flood({ ip: `ip-${index}` }, [`${index}@example.com`]);
  await expect(flood({ ip: 'new-ip' }, ['new-email'])).rejects.toMatchObject({ statusCode: 429 });
});
