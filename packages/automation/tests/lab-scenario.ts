import { createHmac, randomUUID } from 'node:crypto';

import type { APIRequestContext, APIResponse } from '@playwright/test';
import { z } from 'zod';

import { expect, test as base } from './api-fixture';

export const orderSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  sku: z.string(),
  quantity: z.number().int(),
  status: z.enum(['draft', 'confirmed']),
  version: z.number().int(),
  createdAt: z.iso.datetime(),
});
export type Order = z.infer<typeof orderSchema>;
export const fields = { sku: 'regression', quantity: 2, status: 'draft' };
export function fixtureControl(
  subject = 'operator-a',
  options: Record<string, unknown> = {},
): Record<string, string> {
  const key = process.env['LAB_SIGNING_KEY'];
  if (!key) {
    throw new Error('LAB_SIGNING_KEY required');
  }
  const payload = {
    iss: 'assertide-lab',
    aud: 'assertide-lab-fixture',
    sub: subject,
    exp: Math.floor(Date.now() / 1000) + 300,
    scope: randomUUID(),
    clock: Date.now(),
    ...options,
  };
  const data = [{ alg: 'HS256' }, payload]
    .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
    .join('.');
  return {
    'X-Lab-Fixture': `${data}.${createHmac('sha256', key).update(data).digest('base64url')}`,
    ...(typeof options['fault'] === 'string' ? { 'X-Lab-Fault': options['fault'] } : {}),
  };
}
export class LabScenario {
  public readonly sku = `regression-${randomUUID()}`;
  private readonly tokens = new Map<string, string>();
  private readonly owned: { id: string; subject: string }[] = [];
  public constructor(public readonly request: APIRequestContext) {}
  public async headers(subject = 'operator-a'): Promise<Record<string, string>> {
    if (!this.tokens.has(subject)) {
      const response = await this.request.post('auth/token', {
        data: { username: subject, password: process.env['LAB_PASSWORD'] },
      });
      expect(response.status()).toBe(200);
      this.tokens.set(subject, (await response.json()).access_token as string);
    }
    return { Authorization: `Bearer ${this.tokens.get(subject)}`, ...fixtureControl(subject) };
  }
  public async create(
    data: Record<string, unknown> = {},
    subject = 'operator-a',
    key: string = randomUUID(),
  ): Promise<Order> {
    return base.step('Create isolated order and verify resource contract', async () => {
      const response = await this.request.post('orders', {
        headers: { ...(await this.headers(subject)), 'Idempotency-Key': key },
        data: { ...fields, sku: this.sku, ...data },
      });
      expect(response.status()).toBe(201);
      const order = orderSchema.parse(await response.json());
      this.owned.push({ id: order.id, subject });
      expect(response.headers()['etag']).toBe(`"${order.version}"`);
      expect(response.headers()['location']).toBe(`/lab/v1/orders/${order.id}`);
      return order;
    });
  }
  public async get(id: string, subject = 'operator-a'): Promise<Order> {
    return base.step('Read persisted order and verify version', async () => {
      const response = await this.request.get(`orders/${id}`, {
        headers: await this.headers(subject),
      });
      expect(response.status()).toBe(200);
      const order = orderSchema.parse(await response.json());
      expect(response.headers()['etag']).toBe(`"${order.version}"`);
      return order;
    });
  }
  public async change(
    order: Order,
    data: unknown,
    method: 'patch' | 'put' = 'patch',
    match: string | undefined = `"${order.version}"`,
    subject = 'operator-a',
  ): Promise<APIResponse> {
    return base.step(`${method.toUpperCase()} order with optimistic precondition`, async () =>
      this.request[method](`orders/${order.id}`, {
        headers: { ...(await this.headers(subject)), ...(match ? { 'If-Match': match } : {}) },
        data,
      }),
    );
  }
  public async list(
    params: Record<string, string | number> = {},
    subject = 'operator-a',
  ): Promise<{ items: Order[]; nextCursor: string | null }> {
    return base.step('List isolated orders with filters and cursor', async () => {
      const response = await this.request.get('orders', {
        headers: await this.headers(subject),
        params: { sku: this.sku, ...params },
      });
      expect(response.status()).toBe(200);
      return z
        .object({ items: z.array(orderSchema), nextCursor: z.string().nullable() })
        .parse(await response.json());
    });
  }
  public async cleanup(): Promise<void> {
    for (const { id, subject } of this.owned) {
      const headers = await this.headers(subject);
      const response = await this.request.get(`orders/${id}`, { headers });
      if (response.status() === 404) {
        continue;
      }
      expect(response.status()).toBe(200);
      let order = orderSchema.parse(await response.json());
      if (order.status === 'confirmed') {
        const draft = await this.change(
          order,
          { status: 'draft' },
          'patch',
          `"${order.version}"`,
          subject,
        );
        expect(draft.status()).toBe(200);
        order = orderSchema.parse(await draft.json());
      }
      expect(
        (
          await this.request.delete(`orders/${id}`, {
            headers: { ...(await this.headers(subject)), 'If-Match': `"${order.version}"` },
          })
        ).status(),
      ).toBe(204);
    }
  }
}
export async function problem(response: APIResponse, status: number): Promise<void> {
  expect(response.status()).toBe(status);
  expect(response.headers()['content-type']).toContain('application/problem+json');
  const body = await response.json();
  expect(body.status).toBe(status);
  expect(body.correlationId).toMatch(/^[a-f0-9-]{36}$/);
}
export const test = base.extend<{ lab: LabScenario }>({
  lab: async ({ request }, use) => {
    const lab = new LabScenario(request);
    try {
      await use(lab);
    } finally {
      await lab.cleanup();
    }
  },
});
export { expect };
