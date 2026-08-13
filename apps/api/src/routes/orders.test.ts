import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@potion/shared';
import type { AuthService } from '../services/auth.js';
import type { OrderService } from '../services/orders.js';
import { registerOrderRoutes } from './orders.js';

function createAuth(): AuthService {
  return {
    requireUser: vi.fn(async (request) => {
      if (request.headers.authorization === 'Bearer signed-in-token') {
        return {
          id: '00000000-0000-4000-8000-000000000099',
          email: 'member@example.com',
          displayName: 'Signed In Member',
          role: 'customer',
          phoneNumber: '(555) 222-3333',
          phoneVerifiedAt: '2026-05-23T12:00:00.000Z',
          smsOptIn: true,
        } satisfies SessionUser;
      }

      throw Object.assign(new Error('Sign-in required.'), { statusCode: 401 });
    }),
  } as unknown as AuthService;
}

function createOrders(): OrderService {
  return {
    createDevCompletedOrder: vi.fn().mockResolvedValue({ orderId: '00000000-0000-4000-8000-000000000123' }),
    listCustomerOrders: vi.fn(),
    getOrderConfirmation: vi.fn(),
  } as unknown as OrderService;
}

async function createServer(auth = createAuth(), orders = createOrders()) {
  const server = Fastify();

  server.setErrorHandler((error, _request, reply) => {
    const errorShape = error as { statusCode?: unknown; message?: unknown };
    const statusCode = typeof errorShape.statusCode === 'number' ? errorShape.statusCode : 500;
    const message = typeof errorShape.message === 'string' ? errorShape.message : 'Something went wrong on the server. Please try again.';

    return reply.code(statusCode).send({ message });
  });

  await registerOrderRoutes(server, { auth, orders });
  return { server, auth, orders };
}

describe('order routes', () => {
  it('overrides dev-complete checkout email and SMS consent from the signed-in account', async () => {
    const { server, auth, orders } = await createServer();

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/orders/dev-complete',
        headers: { Authorization: 'Bearer signed-in-token' },
        payload: {
          eventId: '00000000-0000-4000-8000-000000000001',
          customerEmail: 'guest@example.com',
          smsOptIn: false,
          quantity: 1,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(auth.requireUser).toHaveBeenCalledTimes(1);
      expect(orders.createDevCompletedOrder).toHaveBeenCalledWith(expect.objectContaining({
        customerEmail: 'member@example.com',
        smsOptIn: true,
      }));
    } finally {
      await server.close();
    }
  });
});
