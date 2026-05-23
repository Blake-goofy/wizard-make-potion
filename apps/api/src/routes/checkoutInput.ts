import type { FastifyRequest } from 'fastify';
import type { CreateOrderInput } from '@potion/shared';
import type { AuthService } from '../services/auth.js';

function hasBearerToken(request: FastifyRequest) {
  const header = request.headers.authorization;
  return typeof header === 'string' && header.startsWith('Bearer ');
}

export async function resolveCheckoutInput(request: FastifyRequest, auth: AuthService, input: CreateOrderInput): Promise<CreateOrderInput> {
  if (!hasBearerToken(request)) {
    return input;
  }

  const user = await auth.requireUser(request);

  return {
    ...input,
    customerEmail: user.email,
    customerName: user.displayName,
    eventReminderOptIn: user.eventReminderOptIn,
    upcomingEventsOptIn: user.upcomingEventsOptIn,
  };
}