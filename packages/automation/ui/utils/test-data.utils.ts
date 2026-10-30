import { randomUUID } from 'node:crypto';
export const uniqueName = (prefix: string): string => `${prefix} ${randomUUID().slice(0, 8)}`;
export const uniqueId = (prefix: string): string => `${prefix}-${randomUUID().slice(0, 8)}`;
export const moneyInCents = (text: string): number =>
  Math.round(Number(text.replace(/[^0-9.]/g, '')) * 100);
