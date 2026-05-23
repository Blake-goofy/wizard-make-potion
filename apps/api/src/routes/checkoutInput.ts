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
  const hasVerifiedPhone = Boolean(user.phoneNumber && user.phoneVerifiedAt);
  const eventReminderOptIn = hasVerifiedPhone ? user.eventReminderOptIn : false;
  const upcomingEventsOptIn = hasVerifiedPhone ? user.upcomingEventsOptIn : false;

  return {
    ...input,
    customerEmail: user.email,
    customerName: user.displayName,
    customerPhoneNumber: user.phoneNumber ?? undefined,
    eventReminderOptIn,
    upcomingEventsOptIn,
  };
}