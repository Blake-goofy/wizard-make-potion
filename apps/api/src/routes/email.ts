import type { FastifyInstance } from 'fastify';
import type { AuthService } from '../services/auth.js';
import type { EmailQueueService } from '../services/emailQueue.js';

export async function registerEmailRoutes(
  server: FastifyInstance,
  deps: { auth: AuthService; emailQueue: EmailQueueService },
) {
  server.get('/api/dev/email-outbox', async (request) => {
    await deps.auth.requireAdmin(request);
    return deps.emailQueue.listOutbox();
  });

  server.post('/api/dev/email-outbox/process', async (request) => {
    await deps.auth.requireAdmin(request);
    return deps.emailQueue.processPending();
  });
}
