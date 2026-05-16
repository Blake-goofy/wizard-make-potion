import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { createEmailProvider } from '@potion/email';
import { createDatabase } from '@potion/db';
import type { AppConfig } from './config.js';
import { registerAccountRoutes } from './routes/account.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerEmailRoutes } from './routes/email.js';
import { registerEventRoutes } from './routes/events.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerOrderRoutes } from './routes/orders.js';
import { registerPaymentRoutes } from './routes/payments.js';
import { registerScannerRoutes } from './routes/scanner.js';
import { createAuthService } from './services/auth.js';
import { createEmailQueueService } from './services/emailQueue.js';
import { createOrderService } from './services/orders.js';
import { createScannerService } from './services/scanner.js';

function findWebDistDir() {
  const startDirs = [process.cwd(), dirname(fileURLToPath(import.meta.url))];

  for (const startDir of startDirs) {
    let currentDir = resolve(startDir);

    while (true) {
      const candidateDir = join(currentDir, 'apps', 'web', 'dist');
      const candidateIndex = join(candidateDir, 'index.html');

      if (existsSync(candidateIndex)) return candidateDir;

      const parentDir = dirname(currentDir);
      if (parentDir === currentDir) break;
      currentDir = parentDir;
    }
  }

  return null;
}

export async function buildServer(config: AppConfig) {
  const server = Fastify({ logger: true });
  const webDistDir = findWebDistDir();

  server.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      const hasEmailIssue = error.issues.some((issue) => issue.path.includes('email'));

      return reply.code(400).send({
        message: hasEmailIssue ? 'Please enter a valid email address.' : 'Please check your details and try again.',
      });
    }

    if (error instanceof SyntaxError) {
      return reply.code(400).send({ message: 'Please check your details and try again.' });
    }

    const errorShape = error as { statusCode?: unknown; message?: unknown };
    const statusCode = typeof errorShape.statusCode === 'number' ? errorShape.statusCode : 500;
    const message = statusCode >= 500 || typeof errorShape.message !== 'string'
      ? 'Something went wrong on the server. Please try again.'
      : errorShape.message;

    if (statusCode >= 500) request.log.error(error);

    return reply.code(statusCode).send({ message });
  });

  server.removeContentTypeParser('application/json');
  server.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    if (request.url === '/api/stripe/webhook') {
      done(null, body);
      return;
    }

    try {
      const text = body.toString('utf8');
      done(null, text.length ? JSON.parse(text) : {});
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  const db = createDatabase({ connectionString: config.databaseUrl });
  const emailProvider = createEmailProvider({
    provider: config.emailProvider,
    fromAddress: config.emailFromAddress,
    fromName: config.emailFromName,
    resendApiKey: config.resendApiKey,
  });

  const emailQueue = createEmailQueueService({ db, emailProvider, webOrigin: config.webOrigin });
  const auth = createAuthService(config, db, emailQueue);
  const orders = createOrderService({ db, emailQueue, config });
  const scanner = createScannerService({ db });

  await server.register(cors, { origin: config.webOrigin, credentials: true });

  await registerHealthRoutes(server, { db });
  await registerAccountRoutes(server, { auth });
  await registerEventRoutes(server, { db });
  await registerPaymentRoutes(server, { config, orders });
  await registerOrderRoutes(server, { auth, orders });
  await registerScannerRoutes(server, { scanner, auth });
  await registerAdminRoutes(server, { auth, db, emailQueue, scanner });
  await registerEmailRoutes(server, { auth, emailQueue });

  if (webDistDir) {
    await server.register(fastifyStatic, {
      root: webDistDir,
      wildcard: false,
    });

    server.get('/', async (_request, reply) => reply.sendFile('index.html'));
    server.get('/*', async (request, reply) => {
      if (request.url === '/api' || request.url.startsWith('/api/')) {
        return reply.callNotFound();
      }

      return reply.sendFile('index.html');
    });
  }

  server.addHook('onClose', async () => {
    await db.close();
  });

  return server;
}
