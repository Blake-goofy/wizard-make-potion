import { describe, expect, it } from 'vitest';
import { adminUserUpdateInputSchema, changePasswordInputSchema, createAccountInputSchema, createOrderInputSchema, updateAccountInputSchema } from './schemas.js';

describe('shared input schemas', () => {
  it('accepts guest checkout contact and opt-in fields', () => {
    expect(createOrderInputSchema.parse({
      eventId: '00000000-0000-4000-8000-000000000001',
      customerEmail: 'guest@example.com',
      customerName: 'Guest Buyer',
      customerPhoneNumber: '(555) 123-4567',
      eventReminderOptIn: true,
      upcomingEventsOptIn: true,
      quantity: 2,
    })).toEqual({
      eventId: '00000000-0000-4000-8000-000000000001',
      customerEmail: 'guest@example.com',
      customerName: 'Guest Buyer',
      customerPhoneNumber: '(555) 123-4567',
      eventReminderOptIn: true,
      upcomingEventsOptIn: true,
      quantity: 2,
    });
  });

  it('rejects invalid guest checkout phone numbers', () => {
    expect(() => createOrderInputSchema.parse({
      eventId: '00000000-0000-4000-8000-000000000001',
      customerEmail: 'guest@example.com',
      customerName: 'Guest Buyer',
      customerPhoneNumber: '555-123-4567',
      quantity: 2,
    })).toThrow();
  });

  it('accepts account notification preferences on registration', () => {
    expect(createAccountInputSchema.parse({
      email: 'guest@example.com',
      displayName: 'Guest Buyer',
      password: 'correct horse battery staple',
      eventReminderOptIn: true,
      upcomingEventsOptIn: false,
    })).toEqual({
      email: 'guest@example.com',
      displayName: 'Guest Buyer',
      password: 'correct horse battery staple',
      eventReminderOptIn: true,
      upcomingEventsOptIn: false,
    });
  });

  it('rejects oversized account profile values submitted outside the UI', () => {
    expect(() => updateAccountInputSchema.parse({
      displayName: 'A'.repeat(121),
      phoneNumber: null,
      eventReminderOptIn: true,
      upcomingEventsOptIn: true,
    })).toThrow();
  });

  it('does not accept oversized password payloads before hashing', () => {
    expect(() => changePasswordInputSchema.parse({ currentPassword: 'current-password', newPassword: 'A'.repeat(129) })).toThrow();
  });

  it('requires a supported role when admins update a user', () => {
    expect(() => adminUserUpdateInputSchema.parse({ role: 'wizard', isActive: true })).toThrow();
  });
});