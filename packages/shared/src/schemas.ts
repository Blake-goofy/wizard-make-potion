import { z } from 'zod';

const isoDatetimeSchema = z
  .union([z.string().datetime(), z.date()])
  .transform((value) => (value instanceof Date ? value.toISOString() : value));

export const eventSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
  startsAt: isoDatetimeSchema,
  address: z.string().min(1),
  description: z.string().nullable(),
  ticketPriceCents: z.number().int().nonnegative(),
  taxRateBps: z.number().int().min(0),
  minTicketsPerOrder: z.number().int().positive(),
  maxTicketsPerOrder: z.number().int().positive(),
  isActive: z.boolean(),
});

const adminEventBaseInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  startsAt: z.string().datetime(),
  address: z.string().trim().min(1).max(240),
  description: z.string().trim().min(1).max(2000),
  ticketPriceCents: z.number().int().nonnegative(),
});

const phoneNumberSchema = z
  .string()
  .trim()
  .regex(/^\(\d{3}\) \d{3}-\d{4}$/);

type SmsPhoneValue = {
  smsOptIn?: boolean;
  phoneNumber?: string | null;
  customerPhoneNumber?: string | null;
};

function hasSmsAlertsEnabled(value: SmsPhoneValue) {
  return Boolean(value.smsOptIn);
}

function addSmsPhoneRequirement<T extends z.ZodRawShape>(schema: z.ZodObject<T>, phoneField: 'phoneNumber' | 'customerPhoneNumber') {
  return schema.superRefine((value, ctx) => {
    const smsValue = value as SmsPhoneValue;
    if (!hasSmsAlertsEnabled(smsValue)) return;

    const phoneValue = phoneField === 'phoneNumber' ? smsValue.phoneNumber : smsValue.customerPhoneNumber;
    if (typeof phoneValue === 'string' && phoneValue.trim().length > 0) return;

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [String(phoneField)],
      message: 'Phone number is required when text alerts are enabled.',
    });
  });
}

const notificationPreferenceInputShape = {
  smsOptIn: z.boolean(),
};

const notificationPreferenceOutputShape = {
  smsOptIn: z.boolean(),
};

export const adminEventCreateInputSchema = adminEventBaseInputSchema;

export const adminEventUpdateInputSchema = adminEventBaseInputSchema.extend({
  isActive: z.boolean(),
});

export const createOrderRequestSchema = z.object({
  eventId: z.string().uuid(),
  customerEmail: z.string().email(),
  customerName: z.string().trim().min(1).max(120).optional(),
  customerPhoneNumber: phoneNumberSchema.optional(),
  smsOptIn: notificationPreferenceInputShape.smsOptIn.optional(),
  quantity: z.number().int().positive(),
});

export const createOrderInputSchema = addSmsPhoneRequirement(createOrderRequestSchema, 'customerPhoneNumber');

export const pricingQuoteSchema = z.object({
  quantity: z.number().int().positive(),
  subtotalCents: z.number().int().nonnegative(),
  taxCents: z.number().int().nonnegative(),
  totalCents: z.number().int().nonnegative(),
});

export const scanTicketInputSchema = z.object({
  scanToken: z.string().min(1),
  eventId: z.string().uuid(),
  scannerLabel: z.string().min(1).optional(),
});

const ticketViewSchema = z.object({
  id: z.string().uuid(),
  ticketNumber: z.number().int().positive(),
  scanToken: z.string().min(1),
  usedAt: isoDatetimeSchema.nullable(),
});

export const scanTicketDetailSchema = ticketViewSchema.extend({
  eventId: z.string().uuid(),
  eventName: z.string().min(1),
  eventStartsAt: isoDatetimeSchema,
  orderId: z.string().uuid(),
  customerEmail: z.string().email(),
  customerName: z.string().trim().min(1),
  orderUsedTicketCount: z.number().int().nonnegative(),
  orderTicketCount: z.number().int().positive(),
});

export const scanEventAttendanceSchema = z.object({
  eventId: z.string().uuid(),
  eventName: z.string().min(1),
  usedTicketCount: z.number().int().nonnegative(),
  totalTicketCount: z.number().int().nonnegative(),
});

export const scannerSettingsSchema = z.object({
  scanDebounceMs: z.number().int().positive(),
});

export const scanTicketResultSchema = z.object({
  status: z.enum(['valid', 'already_used', 'not_found']),
  message: z.string().min(1),
  ticket: scanTicketDetailSchema.optional(),
  attendance: scanEventAttendanceSchema.optional(),
});

export const updateTicketUsageInputSchema = z.object({
  used: z.boolean(),
});

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const passwordSchema = z.string().min(8).max(128);

export const createAccountInputSchema = addSmsPhoneRequirement(z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(120),
  password: passwordSchema,
  phoneNumber: phoneNumberSchema.optional(),
  ...notificationPreferenceInputShape,
}), 'phoneNumber');

export const verifyAccountInputSchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
});

export const verifyPhoneNumberInputSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

const userRoleSchema = z.enum(['customer', 'scanner', 'admin']);

export const sessionUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1),
  role: userRoleSchema,
  phoneNumber: phoneNumberSchema.nullable(),
  phoneVerifiedAt: isoDatetimeSchema.nullable(),
  ...notificationPreferenceOutputShape,
});

export const accountProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1),
  role: userRoleSchema,
  phoneNumber: phoneNumberSchema.nullable(),
  phoneVerifiedAt: isoDatetimeSchema.nullable(),
  ...notificationPreferenceOutputShape,
});

export const adminManagedUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1),
  role: userRoleSchema,
  isActive: z.boolean(),
});

export const updateAccountInputSchema = addSmsPhoneRequirement(z.object({
  displayName: z.string().trim().min(1).max(120),
  phoneNumber: phoneNumberSchema.nullable(),
  ...notificationPreferenceInputShape,
}), 'phoneNumber');

export const adminUserUpdateInputSchema = z.object({
  role: userRoleSchema,
  isActive: z.boolean(),
});

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const requestPasswordResetInputSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordInputSchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
  newPassword: passwordSchema,
});

export const loginResponseSchema = z.object({
  token: z.string().min(1),
  user: sessionUserSchema,
});

export type EventRecord = z.infer<typeof eventSchema>;
export type AdminEventCreateInput = z.infer<typeof adminEventCreateInputSchema>;
export type AdminEventUpdateInput = z.infer<typeof adminEventUpdateInputSchema>;
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;
export type PricingQuote = z.infer<typeof pricingQuoteSchema>;
export type TicketView = z.infer<typeof ticketViewSchema>;
export type ScanTicketInput = z.infer<typeof scanTicketInputSchema>;
export type ScanTicketDetail = z.infer<typeof scanTicketDetailSchema>;
export type ScanEventAttendance = z.infer<typeof scanEventAttendanceSchema>;
export type ScannerSettings = z.infer<typeof scannerSettingsSchema>;
export type ScanTicketResult = z.infer<typeof scanTicketResultSchema>;
export type UpdateTicketUsageInput = z.infer<typeof updateTicketUsageInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type CreateAccountInput = z.infer<typeof createAccountInputSchema>;
export type VerifyAccountInput = z.infer<typeof verifyAccountInputSchema>;
export type VerifyPhoneNumberInput = z.infer<typeof verifyPhoneNumberInputSchema>;
export type SessionUser = z.infer<typeof sessionUserSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type AccountProfile = z.infer<typeof accountProfileSchema>;
export type AdminManagedUser = z.infer<typeof adminManagedUserSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountInputSchema>;
export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateInputSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetInputSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;
