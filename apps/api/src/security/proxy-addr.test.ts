import Fastify from 'fastify';
import { expect, it } from 'vitest';

it.each([
  ['::ffff:10.0.0.0/8', '203.0.113.10', '203.0.113.10'],
  ['::ffff:10.0.0.0/8', '::ffff:203.0.113.10', '::ffff:203.0.113.10'],
  [['::ffff:10.0.0.0/8', '::1/128'], '203.0.113.10', '203.0.113.10'],
  [['::ffff:10.0.0.0/8', '::1/128'], '::ffff:203.0.113.10', '::ffff:203.0.113.10'],
  ['::ffff:10.0.0.0/104', '203.0.113.10', '203.0.113.10'],
  ['::ffff:10.0.0.0/104', '10.1.2.3', '198.51.100.20'],
  [['::ffff:10.0.0.0/104', '::1/128'], '203.0.113.10', '203.0.113.10'],
  [['::ffff:10.0.0.0/104', '::1/128'], '::ffff:10.1.2.3', '198.51.100.20'],
] satisfies Array<[string | string[], string, string]>)(
  'resolves IP using trust %j and peer %s to %s',
  async (trustProxy, remoteAddress, expectedIp) => {
    const server = Fastify({ trustProxy });
    server.get('/', (request) => ({ ip: request.ip, ips: request.ips }));

    try {
      const response = await server.inject({
        url: '/',
        remoteAddress,
        headers: { 'x-forwarded-for': '198.51.100.20' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        ip: expectedIp,
        ips: expectedIp === remoteAddress ? [remoteAddress] : [remoteAddress, expectedIp],
      });
    } finally {
      await server.close();
    }
  },
);
