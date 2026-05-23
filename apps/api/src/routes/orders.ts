import type { FastifyInstance } from 'fastify';
import { createOrderInputSchema, createOrderRequestSchema } from '@potion/shared';
import { z } from 'zod';
import type { AuthService } from '../services/auth.js';
import type { OrderService } from '../services/orders.js';
import { resolveCheckoutInput } from './checkoutInput.js';

export async function registerOrderRoutes(server: FastifyInstance, deps: { auth: AuthService; orders: OrderService }) {
  server.post('/api/orders/dev-complete', async (request, reply) => {
    const requestedInput = createOrderRequestSchema.parse(request.body);
    const input = createOrderInputSchema.parse(await resolveCheckoutInput(request, deps.auth, requestedInput));
    const result = await deps.orders.createDevCompletedOrder(input);

    return reply.code(201).send(result);
  });

  server.get('/api/account/orders', async (request) => {
    const user = await deps.auth.requireUser(request);
    return deps.orders.listCustomerOrders(user.email);
  });

  server.get('/api/orders/:orderId/confirmation', async (request, reply) => {
    const orderId = z.string().uuid().parse((request.params as { orderId?: string }).orderId);
    const order = await deps.orders.getOrderConfirmation(orderId);

    if (!order) {
      return reply.code(404).send({ message: 'Purchased tickets were not found.' });
    }

    return { order };
  });
}
