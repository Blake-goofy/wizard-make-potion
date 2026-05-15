import type { FastifyInstance } from 'fastify';
import type { Database } from '@potion/db';

export async function registerHealthRoutes(server: FastifyInstance, deps: { db: Database }) {
  server.get('/api/health', async () => {
    const database = await deps.db.health();

    return {
      ok: database.ok,
      service: 'wizard-make-potion-api',
      database,
    };
  });
}
