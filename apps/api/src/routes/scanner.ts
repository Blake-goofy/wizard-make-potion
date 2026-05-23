import type { FastifyInstance } from 'fastify';
import { scannerSettingsSchema, scanTicketInputSchema } from '@potion/shared';
import { z } from 'zod';
import type { AuthService } from '../services/auth.js';
import type { AppSettingsService } from '../services/appSettings.js';
import type { ScannerService } from '../services/scanner.js';

const scannerAttendanceParamsSchema = z.object({
  eventId: z.string().uuid(),
});

function createHttpError(message: string, statusCode: number) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

export async function registerScannerRoutes(
  server: FastifyInstance,
  deps: { scanner: ScannerService; auth: AuthService; appSettings: AppSettingsService },
) {
  server.get('/api/scanner/events', async (request, reply) => {
    await deps.auth.requireScanner(request);
    const events = await deps.scanner.listEvents();

    return reply.send({ events });
  });

  server.get('/api/scanner/settings', async (request, reply) => {
    await deps.auth.requireScanner(request);
    const settings = scannerSettingsSchema.parse(await deps.appSettings.getScannerSettings());

    return reply.send({ settings });
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

  server.post('/api/scanner/tickets/:ticketId/group-arrived', async (request) => {
    const user = await deps.auth.requireScanner(request);
    const ticketId = z
      .string()
      .uuid()
      .parse((request.params as { ticketId?: string }).ticketId);

    try {
      return await deps.scanner.markGroupArrived(ticketId, user.email);
    } catch (error) {
      if (error instanceof Error && error.message === 'Ticket was not found.') {
        throw createHttpError(error.message, 404);
      }

      throw error;
    }
  });
}
