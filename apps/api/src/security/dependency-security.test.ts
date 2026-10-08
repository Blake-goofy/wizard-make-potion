import { createRequire } from 'node:module';
import Fastify from 'fastify';
import { expect, it } from 'vitest';
import { z } from 'zod';

const require = createRequire(import.meta.url);
const pgRequire = createRequire(require.resolve('pg'));

it('keeps hostile PostgreSQL connection parameters as own properties', () => {
  const { parse } = pgRequire('pg-connection-string');
  const config = parse(
    'postgres://localhost/potion?__proto__=value&constructor=value&prototype=value',
  );

  expect(Object.getPrototypeOf(config)).toBe(null);
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    expect(Object.hasOwn(config, key)).toBe(true);
    expect(config[key]).toBe('value');
  }
});

it('preserves hostile PostgreSQL column names without changing the row prototype', () => {
  const Result = pgRequire('pg/lib/result');
  const result = new Result();
  const names = ['__proto__', 'constructor', 'prototype', 'ticket_id'];
  result.addFields(names.map((name) => ({ name, dataTypeID: 114, format: 'text' })));
  const row = result.parseRow(names.map(() => '{"dependencyPolluted":true}'));

  expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
  for (const key of names) {
    expect(Object.hasOwn(row, key)).toBe(true);
    expect(row[key]).toEqual({ dependencyPolluted: true });
  }
  expect(Object.hasOwn(Object.prototype, 'dependencyPolluted')).toBe(false);
  expect(JSON.parse(JSON.stringify(row))).toHaveProperty('ticket_id.dependencyPolluted', true);
});

it('strips hostile Zod keys and reports them in strict objects', () => {
  const input = JSON.parse('{"safe":"value","__proto__":{"dependencyPolluted":true}}');
  const parsed = z.record(z.string(), z.unknown()).parse(input);
  expect(parsed).toEqual({ safe: 'value' });
  expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
  const normalized = z
    .record(
      z.string().transform(() => '__proto__'),
      z.unknown(),
    )
    .parse(input);
  expect(normalized).toEqual({});
  expect(Object.getPrototypeOf(normalized)).toBe(Object.prototype);
  const strict = z.object({ safe: z.string() }).strict().safeParse(input);
  expect(strict.success).toBe(false);
  if (!strict.success) {
    expect(strict.error.issues).toEqual([
      expect.objectContaining({ code: 'unrecognized_keys', keys: ['__proto__'] }),
    ]);
  }
});

it('formats Zod errors with inherited property names safely', () => {
  const error = new z.ZodError(
    ['__proto__', 'constructor', 'toString'].map((key) => ({
      code: 'custom',
      path: [key, 'dependencyPolluted'],
      message: 'Invalid value',
    })),
  );
  for (const key of ['__proto__', 'constructor', 'toString']) {
    expect(Object.hasOwn(z.formatError(error), key)).toBe(true);
    expect(Object.hasOwn(z.treeifyError(error).properties!, key)).toBe(true);
  }
  expect(Object.hasOwn(Object.prototype, 'dependencyPolluted')).toBe(false);
});

it('trims horizontal tabs in forwarded addresses when proxies are trusted', async () => {
  const server = Fastify({ trustProxy: true });
  server.get('/', (request) => ({ ip: request.ip, ips: request.ips }));
  try {
    const response = await server.inject({
      url: '/',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '\t198.51.100.20\t, \t203.0.113.10\t' },
    });
    expect(response.json()).toEqual({
      ip: '198.51.100.20',
      ips: ['127.0.0.1', '203.0.113.10', '198.51.100.20'],
    });
  } finally {
    await server.close();
  }
});
