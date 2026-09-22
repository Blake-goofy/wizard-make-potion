import { describe, expect, it, vi } from 'vitest';
import { defaultThemeSettings } from '@potion/shared';
import { createAppSettingsService } from './appSettings.js';

describe('app settings', () => {
  it('returns the default theme when stored values are absent', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{}] }) };
    const service = createAppSettingsService({ db: db as never });

    await expect(service.getThemeSettings()).resolves.toEqual(defaultThemeSettings);
  });

  it('validates and persists theme colors', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValue({ rows: [{ ...defaultThemeSettings, accentColor: '#abcdef' }] }),
    };
    const service = createAppSettingsService({ db: db as never });
    const theme = { ...defaultThemeSettings, accentColor: '#abcdef' };

    await expect(service.updateThemeSettings(theme)).resolves.toEqual(theme);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('update app_settings'),
      Object.values(theme),
    );
  });
});
