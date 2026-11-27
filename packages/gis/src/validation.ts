import { InvalidGisInput } from './errors.js';

export function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected record');
  return value as Record<string, unknown>;
}
export function boundedNumber(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('Invalid number');
  return value;
}
export function boundedText(value: unknown, max: number, min = 1): string {
  if (typeof value !== 'string' || value.length < min || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error('Invalid text');
  return value;
}
export function normalizeGeocodeQuery(value: string): string {
  if (typeof value !== 'string' || value.length > 512 || /[\u0000-\u001f\u007f]/u.test(value)) throw new InvalidGisInput('Query must be printable text');
  const query = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (query.length < 3 || query.length > 200) throw new InvalidGisInput('Query length must be 3–200');
  return query;
}
