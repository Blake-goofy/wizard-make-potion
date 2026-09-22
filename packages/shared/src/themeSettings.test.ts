import { describe, expect, it } from 'vitest';
import { defaultThemeSettings, themeSettingsSchema } from './schemas.ts';

describe('theme settings', () => {
  it('accepts the default accessible theme', () => {
    expect(themeSettingsSchema.parse(defaultThemeSettings)).toEqual(defaultThemeSettings);
  });

  it('only accepts six-digit hex colors', () => {
    expect(() => themeSettingsSchema.parse({ ...defaultThemeSettings, accentColor: 'orange' })).toThrow();
  });

  it('rejects colors without readable background contrast', () => {
    expect(() => themeSettingsSchema.parse({
      backgroundColor: '#ffffff',
      textColor: '#eeeeee',
      accentColor: '#111111',
      dangerColor: '#990000',
      successColor: '#006600',
      warningColor: '#664400',
    })).toThrow('Theme colors must have at least 4.5:1 contrast against the background.');
  });
});
