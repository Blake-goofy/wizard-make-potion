// Build shared + web with VITE_API_BASE_URL='' first, then run: npx tsx scripts/check-checkout-back.ts
// Uses local fake checkout only; never creates a Stripe session or payment.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';

const event = {
  id: 'checkout-back-test', slug: 'checkout-back-test', name: 'Checkout back test',
  startsAt: '2030-10-31T20:00:00Z', address: 'Test venue', description: null,
  ticketPriceCents: 2500, taxRateBps: 0, minTicketsPerOrder: 1, maxTicketsPerOrder: 6,
  isActive: true, imageUpdatedAt: null,
};
const attempts: string[] = [];
let releaseCheckout: (() => void) | undefined;
const server = await preview({
  configFile: false,
  envDir: false,
  root: fileURLToPath(new URL('../apps/web', import.meta.url)),
  preview: { host: '127.0.0.1', port: 0 },
  plugins: [{
    name: 'local-checkout-test',
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url === '/mock-stripe') {
          response.setHeader('Content-Type', 'text/html');
          response.end('<!doctype html><title>Fake checkout</title><h1>Fake checkout</h1>');
          return;
        }
        if (!request.url?.startsWith('/api/')) return next();
        response.setHeader('Content-Type', 'application/json');
        if (request.url === '/api/payments/stripe-checkout') {
          attempts.push(String(request.headers['idempotency-key']));
          releaseCheckout = () => response.end(JSON.stringify({
            orderId: `test-order-${attempts.length}`,
            checkoutUrl: '/mock-stripe',
          }));
        } else if (request.url === `/api/events/${event.slug}`) {
          response.end(JSON.stringify({ event }));
        } else if (request.url === '/api/auth/me') {
          response.end(JSON.stringify({ user: {
            id: 'test-user', email: 'test@example.com', name: 'Test User', role: 'customer',
          } }));
        } else if (request.url === '/api/theme') {
          response.end(JSON.stringify({ theme: {} }));
        } else {
          response.statusCode = 404;
          response.end('{}');
        }
      });
    },
  }],
});
const browser = await chromium.launch({
  channel: 'chromium',
  // Playwright disables BFCache by default; this check must exercise a real cached Back navigation.
  ignoreDefaultArgs: ['--disable-back-forward-cache'],
});

try {
  const baseUrl = server.resolvedUrls?.local[0];
  assert(baseUrl);
  for (const signedIn of [false, true]) {
    const context = await browser.newContext();
    await context.addInitScript((signedIn) => {
      if (signedIn) localStorage.setItem('sessionToken', 'local-test-session');
      window.addEventListener('pageshow', (event) => {
        sessionStorage.setItem('restored-from-cache', String(event.persisted));
      });
    }, signedIn);
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    await page.goto(`${baseUrl}events/${event.slug}${signedIn ? '' : '/guest-checkout'}`);
    if (!signedIn) {
      await page.getByLabel('Name', { exact: true }).fill('Test Buyer');
      await page.getByLabel('Email', { exact: true }).fill('test@example.com');
    }
    await page.getByRole('combobox', { name: 'Quantity' }).selectOption('2');
    for (let round = 0; round < 2; round += 1) {
      const before = attempts.length;
      await page.getByRole('button', { name: 'Buy tickets' }).click();
      await expect.poll(() => attempts.length).toBe(before + 1);
      // Ordinary pageshow must not unlock an in-flight checkout or bypass duplicate protection.
      await page.evaluate(() => {
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
        document.querySelector('form')!.requestSubmit();
      });
      await expect(page.getByRole('button', { name: 'Opening Stripe' })).toBeDisabled();
      assert.equal(attempts.length, before + 1);
      releaseCheckout!();
      await page.waitForURL('**/mock-stripe');
      await page.goBack({ waitUntil: 'commit' });
      await expect.poll(() => page.evaluate(() => sessionStorage.getItem('restored-from-cache'))).toBe('true');
      await expect(page.getByRole('button', { name: 'Buy tickets' })).toBeEnabled();
      await expect(page.getByRole('status', { name: 'Opening Stripe' })).toHaveCount(0);
      await expect(page.getByRole('combobox', { name: 'Quantity' })).toHaveValue('2');
      if (!signedIn) {
        await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Test Buyer');
        await expect(page.getByLabel('Email', { exact: true })).toHaveValue('test@example.com');
      }
    }
    await context.close();
  }
  assert.equal(new Set(attempts).size, 4, 'Returning buyers must receive a fresh checkout attempt ID');
} finally {
  await browser.close();
  server.httpServer.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
}

