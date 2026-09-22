import type { Database } from '@potion/db';
import {
  defaultThemeSettings,
  themeSettingsSchema,
  themeSettingsShape,
  type ThemeSettings,
} from '@potion/shared';
import { z } from 'zod';

const defaultAppSettings = {
  eventExpiryBufferMinutes: 360,
  scanDebounceMs: 3000,
  emailFromAddress: 'onboarding@resend.dev',
  emailFromName: 'Wizard Make Potion Tickets',
  ...defaultThemeSettings,
};

const appSettingsSchema = z.object({
  eventExpiryBufferMinutes: z.number().int().positive(),
  scanDebounceMs: z.number().int().positive(),
  emailFromAddress: z.string().email(),
  emailFromName: z.string().trim().min(1),
  ...themeSettingsShape,
});

export type AppSettingsService = ReturnType<typeof createAppSettingsService>;

async function readAppSettings(db: Database) {
  const result = await db.query(
    `select event_expiry_buffer_minutes as "eventExpiryBufferMinutes",
            scan_debounce_ms as "scanDebounceMs",
            email_from_address as "emailFromAddress",
            email_from_name as "emailFromName",
            theme_background_color as "backgroundColor",
            theme_text_color as "textColor",
            theme_accent_color as "accentColor",
            theme_danger_color as "dangerColor",
            theme_success_color as "successColor",
            theme_warning_color as "warningColor"
     from app_settings
     where id = true
     limit 1`,
  );

  return appSettingsSchema.parse({
    ...defaultAppSettings,
    ...(result.rows[0] ?? {}),
  });
}

export function createAppSettingsService(deps: { db: Database }) {
  return {
    async get() {
      return readAppSettings(deps.db);
    },

    async getEventSettings() {
      const settings = await readAppSettings(deps.db);

      return {
        eventExpiryBufferMinutes: settings.eventExpiryBufferMinutes,
      };
    },

    async getEmailSettings() {
      const settings = await readAppSettings(deps.db);

      return {
        emailFromAddress: settings.emailFromAddress,
        emailFromName: settings.emailFromName,
      };
    },

    async getScannerSettings() {
      const settings = await readAppSettings(deps.db);

      return {
        scanDebounceMs: settings.scanDebounceMs,
      };
    },

    async getThemeSettings() {
      return themeSettingsSchema.parse(await readAppSettings(deps.db));
    },

    async updateThemeSettings(input: ThemeSettings) {
      const settings = themeSettingsSchema.parse(input);
      const result = await deps.db.query(
        `update app_settings
         set theme_background_color = $1,
             theme_text_color = $2,
             theme_accent_color = $3,
             theme_danger_color = $4,
             theme_success_color = $5,
             theme_warning_color = $6,
             updated_at = now()
         where id = true
         returning theme_background_color as "backgroundColor",
                   theme_text_color as "textColor",
                   theme_accent_color as "accentColor",
                   theme_danger_color as "dangerColor",
                   theme_success_color as "successColor",
                   theme_warning_color as "warningColor"`,
        [
          settings.backgroundColor,
          settings.textColor,
          settings.accentColor,
          settings.dangerColor,
          settings.successColor,
          settings.warningColor,
        ],
      );

      return themeSettingsSchema.parse(result.rows[0]);
    },
  };
}
