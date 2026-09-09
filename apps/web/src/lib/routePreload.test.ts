import { describe, expect, it, vi } from 'vitest';
import { createRoutePreloader } from './routePreload';

describe('createRoutePreloader', () => {
  it('reuses the same in-flight and completed route import', async () => {
    const load = vi.fn(async () => ({ default: 'route' }));
    const preload = createRoutePreloader(load);

    const first = preload();
    const second = preload();

    expect(first).toBe(second);
    await expect(first).resolves.toEqual({ default: 'route' });
    await preload();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('allows a failed route import to be retried', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ default: 'route' });
    const preload = createRoutePreloader(load);

    await expect(preload()).rejects.toThrow('network error');
    expect(() => preload.read()).toThrow('network error');
    await expect(preload()).resolves.toEqual({ default: 'route' });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('reads a route synchronously after it has been preloaded', async () => {
    const module = { default: 'route' };
    const preload = createRoutePreloader(async () => module);

    let suspendedOn: unknown;
    try {
      preload.read();
    } catch (error) {
      suspendedOn = error;
    }

    expect(suspendedOn).toBeInstanceOf(Promise);
    await suspendedOn;
    expect(preload.read()).toBe(module);
  });
});
