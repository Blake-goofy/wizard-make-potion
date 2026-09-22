import { describe, expect, it } from 'vitest';
import { detectEventImageContentType } from './eventImages.js';

describe('event image validation', () => {
  it('detects supported formats by file signature instead of trusting the request header', () => {
    expect(detectEventImageContentType(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe('image/jpeg');
    expect(detectEventImageContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(detectEventImageContentType(Buffer.from('RIFF0000WEBP'))).toBe('image/webp');
    expect(detectEventImageContentType(Buffer.from('<svg></svg>'))).toBeNull();
  });
});
