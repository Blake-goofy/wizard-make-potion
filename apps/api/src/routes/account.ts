import type { FastifyInstance } from 'fastify';
import { updateAccountInputSchema } from '@potion/shared';
import type { AuthService } from '../services/auth.js';

export async function registerAccountRoutes(server: FastifyInstance, deps: { auth: AuthService }) {
  server.get('/api/account', async (request) => {
    const account = await deps.auth.getAccountProfile(request);
    return { account };
  });

  server.put('/api/account', async (request) => {
    const input = updateAccountInputSchema.parse(request.body);
    const account = await deps.auth.updateAccount(request, input);
    return { account };
  });

  server.delete('/api/account', async (request) => {
    await deps.auth.deleteAccount(request);
    return { deleted: true };
  });
}