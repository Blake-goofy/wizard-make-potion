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
export const createOrderInputSchema = z.object({
    eventId: z.string().uuid(),
    customerEmail: z.string().email(),
    quantity: z.number().int().positive(),
});
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
});
export const scanEventAttendanceSchema = z.object({
    eventId: z.string().uuid(),
    eventName: z.string().min(1),
    usedTicketCount: z.number().int().nonnegative(),
    totalTicketCount: z.number().int().nonnegative(),
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
const phoneNumberSchema = z
    .string()
    .trim()
    .regex(/^\(\d{3}\) \d{3}-\d{4}$/);
export const createAccountInputSchema = z.object({
    email: z.string().email(),
    displayName: z.string().min(1).max(120),
    password: z.string().min(8),
    phoneNumber: phoneNumberSchema.optional(),
});
export const verifyAccountInputSchema = z.object({
    email: z.string().email(),
    code: z.string().regex(/^\d{6}$/),
});
export const sessionUserSchema = z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    displayName: z.string().min(1),
    role: z.enum(['customer', 'scanner', 'admin']),
    phoneNumber: phoneNumberSchema.nullable(),
});
export const accountProfileSchema = z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    displayName: z.string().min(1),
    role: z.enum(['customer', 'scanner', 'admin']),
    phoneNumber: phoneNumberSchema.nullable(),
});
export const updateAccountInputSchema = z.object({
    phoneNumber: phoneNumberSchema.nullable(),
});
export const loginResponseSchema = z.object({
    token: z.string().min(1),
    user: sessionUserSchema,
});
