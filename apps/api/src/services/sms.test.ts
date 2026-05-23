import { describe, expect, it, vi } from 'vitest';
import { createSmsService } from './sms.js';

describe('sms service', () => {
  it('normalizes transactional SMS recipients before queueing them', async () => {
    const db = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
      transaction: vi.fn(),
    };
    const sms = createSmsService({ db: db as never, smsProvider: null });

    await sms.queueMessage({
      toPhoneNumber: '(555) 123-4567',
      messageBody: 'Verification code: 123456',
      messageType: 'transactional',
    });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('insert into sms_outbox'),
      ['+15551234567', null, 'Verification code: 123456', 'transactional'],
    );
  });

  it('queues HELP replies with the inbound Telnyx destination as the sender number', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 1 });
    const db = {
      transaction: vi.fn(async (callback: (client: { query: typeof query }) => Promise<unknown>) => callback({ query })),
      query: vi.fn(),
    };
    const sms = createSmsService({ db: db as never, smsProvider: null });

    const result = await sms.handleInboundMessage({
      providerEventId: 'event-1',
      occurredAt: '2026-05-23T15:00:00.000Z',
      fromPhoneNumber: '+1 (555) 123-4567',
      toPhoneNumber: '+1 (555) 000-0000',
      messageText: 'HELP',
      rawPayload: { hello: 'world' },
    });

    expect(result.keyword).toBe('HELP');
    expect(query).toHaveBeenNthCalledWith(2,
      expect.stringContaining('insert into sms_outbox'),
      ['+15551234567', '+15550000000', expect.stringContaining('Wizard Make Potion alerts:')],
    );
  });

  it('sends pending SMS jobs through the configured provider and marks them sent', async () => {
    const provider = {
      send: vi.fn().mockResolvedValue({ providerMessageId: 'msg-123' }),
    };
    const db = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'sms-1', toPhone: '+15551234567', fromPhoneNumber: '+15550000000', messageBody: 'Reply body' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }),
      transaction: vi.fn(),
    };
    const sms = createSmsService({ db: db as never, smsProvider: provider as never });

    const result = await sms.processPending();

    expect(provider.send).toHaveBeenCalledWith({
      toPhoneNumber: '+15551234567',
      fromPhoneNumber: '+15550000000',
      messageBody: 'Reply body',
    });
    expect(db.query).toHaveBeenNthCalledWith(2,
      expect.stringContaining("set status = 'sent'"),
      ['sms-1', 'msg-123'],
    );
    expect(result).toEqual({ processed: 1, pending: 1 });
  });
});