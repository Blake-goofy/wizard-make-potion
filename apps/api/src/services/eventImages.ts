export const EVENT_IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

// ponytail: Postgres is enough for this small event catalog; move blobs to object storage if images or traffic grow materially.
export const MAX_EVENT_IMAGE_BYTES = 5 * 1024 * 1024;

export type EventImageContentType = (typeof EVENT_IMAGE_CONTENT_TYPES)[number];

export function detectEventImageContentType(data: Buffer): EventImageContentType | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    data.length >= 8
    && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }

  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }

  return null;
}
