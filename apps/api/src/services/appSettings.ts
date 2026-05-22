import type { Database } from '@potion/db';
import { z } from 'zod';

const defaultAppSettings = {
  eventExpiryBufferMinutes: 360,
  scanDebounceMs: 3000,
  emailFromAddress: 'onboarding@resend.dev',
  emailFromName: 'Wizard Make Potion Tickets',
};

const appSettingsSchema = z.object({
  eventExpiryBufferMinutes: z.number().int().positive(),
  scanDebounceMs: z.number().int().positive(),
  emailFromAddress: z.string().email(),
  emailFromName: z.string().trim().min(1),
});

export type AppSettingsService = ReturnType<typeof createAppSettingsService>;

async function readAppSettings(db: Database) {
  const result = await db.query(
    `select event_expiry_buffer_minutes as "eventExpiryBufferMinutes",
            scan_debounce_ms as "scanDebounceMs",
            email_from_address as "emailFromAddress",
            email_from_name as "emailFromName"
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
  };
}