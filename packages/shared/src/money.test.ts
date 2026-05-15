import { describe, expect, it } from 'vitest';
import { formatCents } from './money.js';

describe('formatCents', () => {
  it('formats cents as US dollars', () => {
    expect(formatCents(2599)).toBe('$25.99');
  });
});
