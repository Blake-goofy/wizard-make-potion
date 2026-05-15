import type { FastifyInstance } from 'fastify';
import { scanTicketInputSchema } from '@potion/shared';
import { z } from 'zod';
import type { AuthService } from '../services/auth.js';
import type { ScannerService } from '../services/scanner.js';

const scannerAttendanceParamsSchema = z.object({
  eventId: z.string().uuid(),
});

export async function registerScannerRoutes(
  server: FastifyInstance,
  deps: { scanner: ScannerService; auth: AuthService },
) {
  server.get('/api/scanner/events', async (request, reply) => {
    await deps.auth.requireScanner(request);
    const events = await deps.scanner.listEvents();

    return reply.send({ events });
  });

  server.get('/api/scanner/events/:eventId/attendance', async (request, reply) => {
    await deps.auth.requireScanner(request);
    const { eventId } = scannerAttendanceParamsSchema.parse(request.params);
    const attendance = await deps.scanner.getEventAttendance(eventId);

    if (!attendance) {
      return reply.code(404).send({ message: 'The requested resource could not be found.' });
    }

    return reply.send({ attendance });
  });

  server.post('/api/scanner/scan', async (request, reply) => {
    await deps.auth.requireScanner(request);
    const input = scanTicketInputSchema.parse(request.body);
    const result = await deps.scanner.scanTicket(input);

    return reply.send(result);
  });
}
