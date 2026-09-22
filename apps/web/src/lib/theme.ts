import type { ThemeSettings } from '@potion/shared';

const themeTokenBySetting: Record<keyof ThemeSettings, string> = {
  backgroundColor: '--color-background',
  textColor: '--color-text',
  accentColor: '--color-accent',
  dangerColor: '--color-danger',
  successColor: '--color-success',
  warningColor: '--color-warning',
};

export function applyThemeSettings(theme: ThemeSettings) {
  for (const [setting, token] of Object.entries(themeTokenBySetting) as [
    keyof ThemeSettings,
    string,
  ][]) {
    document.documentElement.style.setProperty(token, theme[setting]);
  }
}
