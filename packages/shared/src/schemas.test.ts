import { describe, expect, it } from 'vitest';
import { changePasswordInputSchema, updateAccountInputSchema } from './schemas.js';

describe('shared input schemas', () => {
  it('rejects oversized account profile values submitted outside the UI', () => {
    expect(() => updateAccountInputSchema.parse({ displayName: 'A'.repeat(121), phoneNumber: null })).toThrow();
  });

  it('does not accept oversized password payloads before hashing', () => {
    expect(() => changePasswordInputSchema.parse({ currentPassword: 'current-password', newPassword: 'A'.repeat(129) })).toThrow();
  });
});