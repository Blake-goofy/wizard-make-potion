import cors from '@fastify/cors';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerAccountRoutes } from './account.js';

afterEach(() => {
  vi.clearAllMocks();
});

describe('cors preflight', () => {
  it('allows account update requests from the web origin', async () => {
    const server = Fastify();

    await server.register(cors, {
      origin: 'https://wizardmakepotion.com',
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });

    await registerAccountRoutes(server, {
      auth: {
        createAccount: vi.fn(),
        verifyAccount: vi.fn(),
        login: vi.fn(),
        requestPasswordReset: vi.fn(),
        resetPassword: vi.fn(),
        requireUser: vi.fn(),
        requireAdmin: vi.fn(),
        requireScanner: vi.fn(),
        getCurrentUser: vi.fn(),
        getAccountProfile: vi.fn(),
        updateAccount: vi.fn(),
        changePassword: vi.fn(),
        deleteAccount: vi.fn(),
      },
    });

    try {
      const response = await server.inject({
        method: 'OPTIONS',
        url: '/api/account',
        headers: {
          origin: 'https://wizardmakepotion.com',
          'access-control-request-method': 'PUT',
          'access-control-request-headers': 'content-type',
        },
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('https://wizardmakepotion.com');
      expect(response.headers['access-control-allow-methods']).toContain('PUT');
    } finally {
      await server.close();
    }
  });
});