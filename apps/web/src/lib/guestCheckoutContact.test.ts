import { afterEach, describe, expect, it } from 'vitest';
import { getGuestCheckoutPhoneNumber, saveGuestCheckoutContact } from './guestCheckoutContact';

const values = new Map<string, string>();

Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    sessionStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  },
});

afterEach(() => values.clear());

describe('guest checkout contact', () => {
  it('returns the saved phone number only for its matching order', () => {
    saveGuestCheckoutContact({
      orderId: '00000000-0000-4000-8000-000000000099',
      phoneNumber: '(555) 123-4567',
    });

    expect(getGuestCheckoutPhoneNumber('00000000-0000-4000-8000-000000000099')).toBe('(555) 123-4567');
    expect(getGuestCheckoutPhoneNumber('00000000-0000-4000-8000-000000000100')).toBe('');
  });
});
