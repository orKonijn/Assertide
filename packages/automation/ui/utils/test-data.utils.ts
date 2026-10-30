import { randomUUID } from "node:crypto";
export const uniqueName = (prefix: string) =>
  `${prefix} ${randomUUID().slice(0, 8)}`;
export const uniqueId = (prefix: string) =>
  `${prefix}-${randomUUID().slice(0, 8)}`;
export const moneyInCents = (text: string) =>
  Math.round(Number(text.replace(/[^0-9.]/g, "")) * 100);
