import { eventSchema } from '@potion/shared';

export function createEventExpiryCutoff(eventExpiryBufferMinutes: number) {
  return new Date(Date.now() - eventExpiryBufferMinutes * 60_000).toISOString();
}

export function parseEventRecord(row: Record<string, unknown>) {
  return eventSchema.parse(row);
}