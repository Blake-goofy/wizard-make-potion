import { describe, expect, it, vi } from 'vitest';
import { createSmsMessageService } from './smsMessages.js';

describe('sms message service', () => {
  it('queues reminder recipients for send-now actions and processes pending sms delivery', async () => {
    const db = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'message-1', eventId: 'event-1', messageType: 'reminder', messageBody: 'Doors open at 7.', testPhoneNumber: null }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ phoneNumber: '(555) 123-4567' }, { phoneNumber: '(555) 999-0000' }], rowCount: 2 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }),
    };
    const sms = {
      processPending: vi.fn().mockResolvedValue({ processed: 2, pending: 2 }),
    };
    const service = createSmsMessageService({ db: db as never, sms: sms as never });

    const result = await service.sendMessageNow('message-1');

    expect(db.query).toHaveBeenNthCalledWith(2, expect.stringContaining('orders.sms_opt_in = true'), ['event-1']);
    expect(db.query).toHaveBeenNthCalledWith(3,
      expect.stringContaining('insert into sms_outbox'),
      ['+15551234567', 'Doors open at 7.', 'reminder'],
    );
    expect(db.query).toHaveBeenNthCalledWith(4,
      expect.stringContaining('insert into sms_outbox'),
      ['+15559990000', 'Doors open at 7.', 'reminder'],
    );
    expect(sms.processPending).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      processedMessages: 1,
      queuedMessages: 2,
      delivery: { processed: 2, pending: 2 },
    });
  });

  it('queues admin recipients for send-now actions', async () => {
    const db = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'message-admin', eventId: null, messageType: 'admin', messageBody: 'Admin alert', testPhoneNumber: null }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ phoneNumber: '(555) 123-4567' }, { phoneNumber: '(555) 999-0000' }], rowCount: 2 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }),
    };
    const sms = {
      processPending: vi.fn().mockResolvedValue({ processed: 3, pending: 3 }),
    };
    const service = createSmsMessageService({ db: db as never, sms: sms as never });

    const result = await service.sendMessageNow('message-admin');

    expect(db.query).toHaveBeenNthCalledWith(3,
      expect.stringContaining('insert into sms_outbox'),
      ['+15551234567', 'Admin alert', 'admin'],
    );
    expect(db.query).toHaveBeenNthCalledWith(4,
      expect.stringContaining('insert into sms_outbox'),
      ['+15559990000', 'Admin alert', 'admin'],
    );
    expect(result).toEqual({
      processedMessages: 1,
      queuedMessages: 2,
      delivery: { processed: 3, pending: 3 },
    });
  });

  it('queues a test recipient for send-now actions', async () => {
    const db = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'message-test', eventId: null, messageType: 'test', messageBody: 'Test alert', testPhoneNumber: '(555) 111-2222' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }),
    };
    const sms = {
      processPending: vi.fn().mockResolvedValue({ processed: 1, pending: 1 }),
    };
    const service = createSmsMessageService({ db: db as never, sms: sms as never });

    const result = await service.sendMessageNow('message-test');

    expect(db.query).toHaveBeenNthCalledWith(2,
      expect.stringContaining('insert into sms_outbox'),
      ['+15551112222', 'Test alert', 'test'],
    );
    expect(result).toEqual({
      processedMessages: 1,
      queuedMessages: 1,
      delivery: { processed: 1, pending: 1 },
    });
  });

  it('processes only the requested message for send-now actions', async () => {
    const db = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'message-test', eventId: null, messageType: 'test', messageBody: 'Test alert', testPhoneNumber: '(555) 111-2222' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }),
    };
    const sms = {
      processPending: vi.fn().mockResolvedValue({ processed: 1, pending: 1 }),
    };
    const service = createSmsMessageService({ db: db as never, sms: sms as never });

    const result = await service.sendMessageNow('message-test');

    expect(db.query).toHaveBeenNthCalledWith(1, expect.stringContaining('from sms_messages'), ['message-test']);
    expect(db.query).toHaveBeenNthCalledWith(2,
      expect.stringContaining('insert into sms_outbox'),
      ['+15551112222', 'Test alert', 'test'],
    );
    expect(result).toEqual({
      processedMessages: 1,
      queuedMessages: 1,
      delivery: { processed: 1, pending: 1 },
    });
  });
});
