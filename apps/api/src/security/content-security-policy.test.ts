import { afterEach, expect, it, vi } from 'vitest';
import webConfig from '../../../web/vite.config.js';
import { loadConfig } from '../config.js';
import { buildServer } from '../server.js';

afterEach(() => vi.unstubAllEnvs());

it('sets an enforced CSP on API HTML, errors, and missing routes', async () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('APP_ENV', 'development');
  const server = await buildServer({
    ...loadConfig(),
    databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:1/postgres',
    resendApiKey: 're_test',
    stripeSecretKey: undefined,
    telnyxApiKey: undefined,
  });
  server.get('/api/csp-test', (_request, reply) =>
    reply.type('text/html').send('<!doctype html><h1>Test</h1>'),
  );
  server.get('/api/csp-error', () => {
    throw new Error('Test error');
  });

  try {
    for (const [url, statusCode] of [
      ['/api/csp-test', 200],
      ['/api/csp-error', 500],
      ['/api/csp-missing', 404],
    ] as const) {
      const response = await server.inject({ url });
      expect(response.statusCode).toBe(statusCode);
      const policy = response.headers['content-security-policy'];
      expect(policy).toContain("script-src 'self'");
      expect(policy).toContain("object-src 'none'");
      expect(policy).toContain("frame-ancestors 'none'");
      expect(policy).toContain("img-src 'self' data: blob:");
      expect(policy).not.toMatch(/unsafe-inline|unsafe-eval/);
    }
  } finally {
    await server.close();
  }
});

it.each(['', 'https://api.example.com/path?ignored=value'])(
  'limits preview API access to the configured origin (%s)',
  async (apiBaseUrl) => {
    vi.stubEnv('VITE_API_BASE_URL', apiBaseUrl);
    expect(typeof webConfig).toBe('function');
    if (typeof webConfig !== 'function') throw new Error('Expected Vite config function');
    const config = await webConfig({ command: 'serve', mode: 'production', isPreview: true });
    const policy = config.preview?.headers?.['Content-Security-Policy'];
    const origin = apiBaseUrl ? ' https://api.example.com' : '';
    expect(policy).toContain(`connect-src 'self'${origin};`);
    expect(policy).toContain(`img-src 'self' data: blob:${origin};`);
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toMatch(/unsafe-inline|unsafe-eval|ignored=value/);
    expect(config.server?.headers?.['Content-Security-Policy']).toBeUndefined();
  },
);

it.each(['data:text/html,test', "https://api.example.com;script-src 'unsafe-inline'"])(
  'rejects invalid API origins (%s)',
  async (apiBaseUrl) => {
    vi.stubEnv('VITE_API_BASE_URL', apiBaseUrl);
    if (typeof webConfig !== 'function') throw new Error('Expected Vite config function');
    await expect(async () =>
      webConfig({ command: 'serve', mode: 'production', isPreview: true }),
    ).rejects.toThrow();
  },
);
