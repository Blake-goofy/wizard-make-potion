import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import webConfig from '../../../web/vite.config.js';
import { loadConfig } from '../config.js';
import { buildServer } from '../server.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it.each(['development', 'production'] as const)(
  'serves static pages and assets with cache and security headers (%s)',
  async (appEnv) => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('APP_ENV', 'development');
    const config = {
      ...loadConfig(),
      appEnv,
      databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:1/postgres',
      resendApiKey: 're_test',
      stripeSecretKey: undefined,
      telnyxApiKey: undefined,
    };
    const webRoot = mkdtempSync(join(tmpdir(), 'potion-csp-'));
    const dist = join(webRoot, 'apps', 'web', 'dist');
    mkdirSync(join(dist, 'assets'), { recursive: true });
    writeFileSync(join(dist, 'index.html'), '<!doctype html><h1>Test</h1>');
    writeFileSync(join(dist, 'assets', 'check.js'), 'export const check = true;');
    writeFileSync(join(dist, 'check.txt'), 'Public file');
    vi.spyOn(process, 'cwd').mockReturnValue(webRoot);
    let server: Awaited<ReturnType<typeof buildServer>> | undefined;

    try {
      server = await buildServer(config);
      server.get('/api/csp-error', () => {
        throw new Error('Test error');
      });
      for (const [url, statusCode, cacheControl] of [
        ['/', 200, 'no-cache'],
        ['/sign-in', 200, 'no-cache'],
        ['/assets/check.js', 200, 'public, max-age=31536000, immutable'],
        ['/check.txt', 200, 'public, max-age=86400'],
        ['/api/csp-error', 500, undefined],
        ['/api/csp-missing', 404, undefined],
      ] as const) {
        const response = await server.inject({ url });
        expect(response.statusCode).toBe(statusCode);
        expect(response.headers['cache-control']).toBe(cacheControl);
        expect(response.headers['strict-transport-security']).toBe(
          appEnv === 'production' ? 'max-age=31536000' : undefined,
        );
        const policy = response.headers['content-security-policy'];
        expect(policy).toContain("script-src 'self'");
        expect(policy).toContain("object-src 'none'");
        expect(policy).toContain("frame-ancestors 'none'");
        expect(policy).toContain("img-src 'self' data: blob:");
        expect(policy).not.toMatch(/unsafe-inline|unsafe-eval/);
      }
    } finally {
      await server?.close();
      vi.restoreAllMocks();
      expect(dirname(resolve(webRoot))).toBe(resolve(tmpdir()));
      rmSync(webRoot, { recursive: true, force: true });
    }
  },
);

it.each([
  ['production', ''],
  ['production', 'https://api.example.com/path?ignored=value'],
  ['development', ''],
])(
  'limits preview API access and enables HSTS only in production (%s, %s)',
  async (mode, apiBaseUrl) => {
    vi.stubEnv('VITE_API_BASE_URL', apiBaseUrl);
    expect(typeof webConfig).toBe('function');
    if (typeof webConfig !== 'function') throw new Error('Expected Vite config function');
    const config = await webConfig({ command: 'serve', mode, isPreview: true });
    expect(config.preview?.headers?.['Strict-Transport-Security']).toBe(
      mode === 'production' ? 'max-age=31536000' : undefined,
    );
    const policy = config.preview?.headers?.['Content-Security-Policy'];
    const origin = apiBaseUrl ? ' https://api.example.com' : '';
    expect(policy).toContain(`connect-src 'self'${origin};`);
    expect(policy).toContain(`img-src 'self' data: blob:${origin};`);
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toMatch(/unsafe-inline|unsafe-eval|ignored=value/);
    expect(config.server?.headers?.['Content-Security-Policy']).toBeUndefined();
    expect(config.server?.headers?.['Strict-Transport-Security']).toBeUndefined();
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
