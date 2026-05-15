import { buildServer } from './server.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const server = await buildServer(config);

try {
  await server.listen({ port: config.apiPort, host: '0.0.0.0' });
  server.log.info(`API listening on http://localhost:${config.apiPort}`);
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
