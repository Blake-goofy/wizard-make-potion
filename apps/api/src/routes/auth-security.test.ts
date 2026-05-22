import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthService } from '../services/auth.js';
import type { EmailQueueService } from '../services/emailQueue.js';
import type { ScannerService } from '../services/scanner.js';
import { registerAdminRoutes } from './admin.js';

type AdminRouteDeps = Parameters<typeof registerAdminRoutes>[1];

function createStatusError(message: string, statusCode: number) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

function createAuth(): AuthService {
  return {
    createAccount: vi.fn(),
    verifyAccount: vi.fn(),
    login: vi.fn(),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    requireUser: vi.fn(),
    requireAdmin: vi.fn(),
    requireScanner: vi.fn(),
    getCurrentUser: vi.fn(),
    listAdminUsers: vi.fn(),
    updateAdminUser: vi.fn(),
    getAccountProfile: vi.fn(),
    updateAccount: vi.fn(),
    changePassword: vi.fn(),
    deleteAccount: vi.fn(),
  } as unknown as AuthService;
}

async function createServer(auth = createAuth()) {
  const server = Fastify();
  const emailQueue = { processPending: vi.fn() } as unknown as EmailQueueService;

  server.setErrorHandler((error, _request, reply) => {
    const errorShape = error as { statusCode?: unknown; message?: unknown; expose?: unknown };
    const statusCode = typeof errorShape.statusCode === 'number' ? errorShape.statusCode : 500;
    const canExposeMessage = statusCode < 500 || errorShape.expose === true;
    const message = !canExposeMessage || typeof errorShape.message !== 'string'
      ? 'Something went wrong on the server. Please try again.'
      : errorShape.message;

    return reply.code(statusCode).send({ message });
  });

  await registerAdminRoutes(server, {
    auth,
    db: {} as AdminRouteDeps['db'],
    emailQueue,
    scanner: {} as ScannerService,
  });

  return { server, auth };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('auth route guardrails', () => {
  it('throttles repeated login attempts before they continue hitting password verification', async () => {
    const auth = createAuth();
    vi.mocked(auth.login).mockRejectedValue(createStatusError('Invalid email or password.', 401));
    const { server } = await createServer(auth);

    try {
      for (let index = 0; index < 10; index += 1) {
        const response = await server.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: 'login-throttle@example.com', password: 'wrong-password' },
        });

        expect(response.statusCode).toBe(401);
      }

      const throttledResponse = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'login-throttle@example.com', password: 'wrong-password' },
      });

      expect(throttledResponse.statusCode).toBe(429);
      expect(throttledResponse.json()).toEqual({ message: 'Too many attempts. Please wait a moment and try again.' });
      expect(auth.login).toHaveBeenCalledTimes(10);
    } finally {
      await server.close();
    }
  });

  it('throttles password reset request spam for the same address', async () => {
    const auth = createAuth();
    vi.mocked(auth.requestPasswordReset).mockResolvedValue({
      email: 'reset-throttle@example.com',
      message: 'If an account exists for that email, a reset code has been queued for delivery.',
    });
    const { server } = await createServer(auth);

    try {
      for (let index = 0; index < 3; index += 1) {
        const response = await server.inject({
          method: 'POST',
          url: '/api/auth/password-reset/request',
          payload: { email: 'reset-throttle@example.com' },
        });

        expect(response.statusCode).toBe(200);
      }

      const throttledResponse = await server.inject({
        method: 'POST',
        url: '/api/auth/password-reset/request',
        payload: { email: 'reset-throttle@example.com' },
      });

      expect(throttledResponse.statusCode).toBe(429);
      expect(auth.requestPasswordReset).toHaveBeenCalledTimes(3);
    } finally {
      await server.close();
    }
  });

  it('throttles verification-code guessing for the same address', async () => {
    const auth = createAuth();
    vi.mocked(auth.verifyAccount).mockRejectedValue(createStatusError('Invalid or expired verification code.', 401));
    const { server } = await createServer(auth);

    try {
      for (let index = 0; index < 8; index += 1) {
        const response = await server.inject({
          method: 'POST',
          url: '/api/auth/verify',
          payload: { email: 'verify-throttle@example.com', code: '123456' },
        });

        expect(response.statusCode).toBe(401);
      }

      const throttledResponse = await server.inject({
        method: 'POST',
        url: '/api/auth/verify',
        payload: { email: 'verify-throttle@example.com', code: '123456' },
      });

      expect(throttledResponse.statusCode).toBe(429);
      expect(auth.verifyAccount).toHaveBeenCalledTimes(8);
    } finally {
      await server.close();
    }
  });

  it('requires admin access for user management routes', async () => {
    const auth = createAuth();
    vi.mocked(auth.listAdminUsers).mockRejectedValue(createStatusError('Admin access required.', 403));
    vi.mocked(auth.updateAdminUser).mockRejectedValue(createStatusError('Admin access required.', 403));
    const { server } = await createServer(auth);

    try {
      const listResponse = await server.inject({
        method: 'GET',
        url: '/api/admin/users',
      });

      expect(listResponse.statusCode).toBe(403);

      const updateResponse = await server.inject({
        method: 'PUT',
        url: '/api/admin/users/11111111-1111-1111-8111-111111111111',
        payload: { role: 'scanner', isActive: true },
      });

      expect(updateResponse.statusCode).toBe(403);
      expect(auth.listAdminUsers).toHaveBeenCalledTimes(1);
      expect(auth.updateAdminUser).toHaveBeenCalledTimes(1);
    } finally {
      await server.close();
    }
  });
});