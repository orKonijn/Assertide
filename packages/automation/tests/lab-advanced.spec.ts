import { randomUUID } from 'node:crypto';

import { expect, fields, fixtureControl, orderSchema, problem, test } from './lab-scenario';

test.describe('Advanced order contracts', () => {
  // Each rejected request is followed by persistence and recovery assertions.
  const invalid = [
    ['zero quantity', { quantity: 0 }],
    ['negative quantity', { quantity: -1 }],
    ['quantity above stock bound', { quantity: 11 }],
    ['fractional quantity', { quantity: 1.5 }],
    ['string quantity', { quantity: '2' }],
    ['null quantity', { quantity: null }],
    ['blank SKU', { sku: '   ' }],
    ['oversized SKU', { sku: 'x'.repeat(101) }],
    ['unknown status', { status: 'shipped' }],
    ['server-owned field injection', { version: 99 }],
  ] as const;
  for (const [index, [name, invalidFields]] of invalid.entries()) {
    test(`LAB-${String(16 + index).padStart(3, '0')} Create rejects ${name} without side effects`, async ({
      lab,
    }) => {
      const baseline = await lab.create();
      const key = randomUUID();
      await problem(
        await lab.request.post('orders', {
          headers: { ...(await lab.headers()), 'Idempotency-Key': key },
          data: { ...fields, sku: lab.sku, ...invalidFields },
        }),
        422,
      );
      expect(await lab.get(baseline.id)).toEqual(baseline);
      expect((await lab.list()).items.map((item) => item.id)).toEqual([baseline.id]);
      const recovered = await lab.create({}, 'operator-a', key);
      expect(recovered.id).not.toBe(baseline.id);
      expect((await lab.list()).items).toHaveLength(2);
    });
    test(`LAB-${String(26 + index).padStart(3, '0')} Patch rejects ${name} and preserves optimistic version`, async ({
      lab,
    }) => {
      const baseline = await lab.create();
      await problem(await lab.change(baseline, invalidFields), 422);
      expect(await lab.get(baseline.id)).toEqual(baseline);
      const recovered = await lab.change(baseline, { quantity: 3 });
      expect(recovered.status()).toBe(200);
      expect(await lab.get(baseline.id)).toMatchObject({ quantity: 3, version: 2 });
    });
  }

  for (const [index, match] of ['', '1', 'W/"1"', '"0"'].entries()) {
    test(`LAB-${String(36 + index).padStart(3, '0')} Invalid precondition ${match || 'missing'} cannot overwrite newer state`, async ({
      lab,
    }) => {
      const original = await lab.create();
      await problem(await lab.change(original, { quantity: 8 }, 'patch', match), 412);
      expect(await lab.get(original.id)).toEqual(original);
      expect((await lab.change(original, { quantity: 4 })).status()).toBe(200);
      await problem(await lab.change(original, { quantity: 7 }), 412);
      expect(await lab.get(original.id)).toMatchObject({ quantity: 4, version: 2 });
    });
  }
  test('LAB-040 Concurrent writers have one winner and a recoverable loser', async ({ lab }) => {
    const original = await lab.create();
    const responses = await Promise.all([
      lab.change(original, { quantity: 3 }),
      lab.change(original, { quantity: 7 }),
    ]);
    expect(responses.map((r) => r.status()).sort()).toEqual([200, 412]);
    const winner = orderSchema.parse(await responses.find((r) => r.status() === 200)!.json());
    expect(await lab.get(original.id)).toEqual(winner);
    expect((await lab.change(winner, { quantity: 9 })).status()).toBe(200);
    expect(await lab.get(original.id)).toMatchObject({ quantity: 9, version: 3 });
  });
  for (const [index, method] of (['get', 'patch', 'put', 'delete'] as const).entries()) {
    test(`LAB-${String(41 + index).padStart(3, '0')} Cross-tenant ${method} does not expose or mutate an order`, async ({
      lab,
    }) => {
      const original = await lab.create();
      const response = await lab.request[method](`orders/${original.id}`, {
        headers: { ...(await lab.headers('operator-b')), 'If-Match': '"1"' },
        ...(['put', 'patch'].includes(method) ? { data: { ...fields, quantity: 9 } } : {}),
      });
      await problem(response, 404);
      expect((await lab.list({}, 'operator-b')).items).toEqual([]);
      expect(await lab.get(original.id)).toEqual(original);
    });
  }
  test('LAB-045 Viewer can observe changes but cannot modify or delete', async ({ lab }) => {
    const original = await lab.create();
    expect(await lab.get(original.id, 'viewer-a')).toEqual(original);
    await problem(await lab.change(original, { quantity: 8 }, 'patch', '"1"', 'viewer-a'), 403);
    await problem(
      await lab.request.delete(`orders/${original.id}`, {
        headers: { ...(await lab.headers('viewer-a')), 'If-Match': '"1"' },
      }),
      403,
    );
    expect((await lab.change(original, { quantity: 5 })).status()).toBe(200);
    expect(await lab.get(original.id, 'viewer-a')).toMatchObject({ quantity: 5, version: 2 });
  });
  test('LAB-046 Concurrent identical creates share one immutable response', async ({ lab }) => {
    const key = randomUUID();
    const [a, b] = await Promise.all([
      lab.create({}, 'operator-a', key),
      lab.create({}, 'operator-a', key),
    ]);
    expect(a).toEqual(b);
    expect((await lab.list()).items).toEqual([a]);
  });
  test('LAB-047 Conflicting idempotent replay does not poison the original key', async ({
    lab,
  }) => {
    const key = randomUUID();
    const original = await lab.create({}, 'operator-a', key);
    await problem(
      await lab.request.post('orders', {
        headers: { ...(await lab.headers()), 'Idempotency-Key': key },
        data: { ...fields, sku: lab.sku, quantity: 8 },
      }),
      409,
    );
    expect(await lab.create({}, 'operator-a', key)).toEqual(original);
    expect((await lab.list()).items).toEqual([original]);
  });
  test('LAB-048 Replay after update returns original response without reverting resource', async ({
    lab,
  }) => {
    const key = randomUUID();
    const original = await lab.create({}, 'operator-a', key);
    expect((await lab.change(original, { quantity: 6 })).status()).toBe(200);
    expect(await lab.create({}, 'operator-a', key)).toEqual(original);
    expect(await lab.get(original.id)).toMatchObject({ quantity: 6, version: 2 });
  });
  test('LAB-049 Idempotency keys are isolated between tenants', async ({ lab }) => {
    const key = randomUUID();
    const a = await lab.create({}, 'operator-a', key);
    const b = await lab.create({}, 'operator-b', key);
    expect(a.id).not.toBe(b.id);
    expect(a.tenantId).not.toBe(b.tenantId);
    expect((await lab.list()).items).toEqual([a]);
    expect((await lab.list({}, 'operator-b')).items).toEqual([b]);
  });
  test('LAB-050 Maximum key length works and oversized keys leave no resource', async ({ lab }) => {
    const key = 'k'.repeat(200);
    await problem(
      await lab.request.post('orders', {
        headers: { ...(await lab.headers()), 'Idempotency-Key': key + 'x' },
        data: { ...fields, sku: lab.sku },
      }),
      422,
    );
    expect((await lab.list()).items).toEqual([]);
    // Include a unique suffix while preserving the exact boundary length.
    const validKey = key.slice(0, 164) + randomUUID();
    expect(await lab.create({}, 'operator-a', validKey)).toEqual(
      await lab.create({}, 'operator-a', validKey),
    );
  });
  for (const [index, limit] of [1, 2, 3].entries()) {
    test(`LAB-${String(51 + index).padStart(3, '0')} Cursor pagination at size ${limit} preserves a complete isolated set`, async ({
      lab,
    }) => {
      const created = [];
      for (let i = 0; i < 5; i++) {
        created.push(await lab.create({ quantity: i + 1 }));
      }
      const ids: string[] = [];
      let cursor: string | null = null;
      do {
        const page = await lab.list({ limit, ...(cursor ? { cursor } : {}) });
        expect(page.items.length).toBeLessThanOrEqual(limit);
        ids.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor;
        expect(ids.length).toBeLessThanOrEqual(5);
      } while (cursor);
      expect(ids).toEqual(created.map((item) => item.id).sort());
      expect(new Set(ids).size).toBe(5);
    });
  }
  test('LAB-054 Status filter follows transitions without leaking unrelated SKU', async ({
    lab,
  }) => {
    const a = await lab.create();
    const b = await lab.create({ status: 'confirmed' });
    await lab.create({ sku: lab.sku + '-other' });
    expect((await lab.list({ status: 'draft' })).items).toEqual([a]);
    expect((await lab.list({ status: 'confirmed' })).items).toEqual([b]);
    expect((await lab.change(a, { status: 'confirmed' })).status()).toBe(200);
    expect((await lab.list({ status: 'draft' })).items).toEqual([]);
    expect((await lab.list({ status: 'confirmed' })).items).toHaveLength(2);
  });
  test('LAB-055 Invalid filters return structured errors and leave valid pagination usable', async ({
    lab,
  }) => {
    const original = await lab.create();
    for (const params of [
      { limit: 0 },
      { limit: 201 },
      { cursor: 'invalid' },
      { status: 'shipped' },
    ]) {
      await problem(await lab.request.get('orders', { headers: await lab.headers(), params }), 422);
    }
    expect((await lab.list({ limit: 1 })).items).toEqual([original]);
  });
  test('LAB-056 Full replacement updates fields while preserving server identity', async ({
    lab,
  }) => {
    const original = await lab.create();
    const response = await lab.change(
      original,
      { sku: lab.sku + '-new', quantity: 10, status: 'confirmed' },
      'put',
    );
    expect(response.status()).toBe(200);
    expect(await lab.get(original.id)).toEqual({
      ...original,
      sku: lab.sku + '-new',
      quantity: 10,
      status: 'confirmed',
      version: 2,
    });
    expect((await lab.list()).items).toEqual([]);
  });
  test('LAB-057 Partial update preserves omitted fields and supports a second version', async ({
    lab,
  }) => {
    const original = await lab.create();
    expect((await lab.change(original, { quantity: 10 })).status()).toBe(200);
    const next = await lab.get(original.id);
    expect(next).toEqual({ ...original, quantity: 10, version: 2 });
    expect((await lab.change(next, { status: 'confirmed' })).status()).toBe(200);
    expect(await lab.get(original.id)).toEqual({ ...next, status: 'confirmed', version: 3 });
  });
  test('LAB-058 Confirmed deletion rejection preserves data then draft transition allows removal', async ({
    lab,
  }) => {
    const original = await lab.create({ status: 'confirmed' });
    await problem(
      await lab.request.delete(`orders/${original.id}`, {
        headers: { ...(await lab.headers()), 'If-Match': '"1"' },
      }),
      409,
    );
    expect(await lab.get(original.id)).toEqual(original);
    expect((await lab.change(original, { status: 'draft' })).status()).toBe(200);
    expect(
      (
        await lab.request.delete(`orders/${original.id}`, {
          headers: { ...(await lab.headers()), 'If-Match': '"2"' },
        })
      ).status(),
    ).toBe(204);
    await problem(
      await lab.request.get(`orders/${original.id}`, { headers: await lab.headers() }),
      404,
    );
  });
  test('LAB-059 Stale delete cannot remove a changed resource', async ({ lab }) => {
    const original = await lab.create();
    expect((await lab.change(original, { quantity: 6 })).status()).toBe(200);
    await problem(
      await lab.request.delete(`orders/${original.id}`, {
        headers: { ...(await lab.headers()), 'If-Match': '"1"' },
      }),
      412,
    );
    expect(await lab.get(original.id)).toMatchObject({ quantity: 6, version: 2 });
  });
  test('LAB-060 SKU trimming is persisted and exact filters use canonical value', async ({
    lab,
  }) => {
    const original = await lab.create({ sku: `  ${lab.sku}  ` });
    expect(original.sku).toBe(lab.sku);
    expect((await lab.list()).items).toEqual([original]);
    expect((await lab.list({ sku: ` ${lab.sku} ` })).items).toEqual([]);
  });
  test('LAB-061 Injected service outage cannot apply a write and recovery succeeds', async ({
    lab,
  }) => {
    const original = await lab.create();
    await problem(
      await lab.request.patch(`orders/${original.id}`, {
        headers: {
          ...(await lab.headers()),
          ...fixtureControl('operator-a', { fault: '503' }),
          'If-Match': '"1"',
        },
        data: { quantity: 9 },
      }),
      503,
    );
    expect(await lab.get(original.id)).toEqual(original);
    expect((await lab.change(original, { quantity: 9 })).status()).toBe(200);
  });
  test('LAB-062 Rate-limited write advertises retry and preserves the original version', async ({
    lab,
  }) => {
    const original = await lab.create();
    const response = await lab.request.patch(`orders/${original.id}`, {
      headers: {
        ...(await lab.headers()),
        ...fixtureControl('operator-a', { fault: 'rate-limit' }),
        'If-Match': '"1"',
      },
      data: { quantity: 9 },
    });
    await problem(response, 429);
    expect(response.headers()['retry-after']).toBe('2');
    expect(await lab.get(original.id)).toEqual(original);
    expect((await lab.change(original, { quantity: 9 })).status()).toBe(200);
  });
  test('LAB-063 Fixture subject mismatch fails closed without mutating data', async ({ lab }) => {
    const original = await lab.create();
    await problem(
      await lab.request.patch(`orders/${original.id}`, {
        headers: { ...(await lab.headers()), ...fixtureControl('operator-b'), 'If-Match': '"1"' },
        data: { quantity: 9 },
      }),
      403,
    );
    expect(await lab.get(original.id)).toEqual(original);
  });
  test('LAB-064 Unsigned fault injection is rejected and normal requests remain healthy', async ({
    lab,
  }) => {
    const original = await lab.create();
    const auth = await lab.headers();
    await problem(
      await lab.request.get(`orders/${original.id}`, {
        headers: { Authorization: auth['Authorization']!, 'X-Lab-Fault': '503' },
      }),
      403,
    );
    expect(await lab.get(original.id)).toEqual(original);
  });
  test('LAB-065 Invalid bearer cannot read or mutate and valid authentication recovers', async ({
    lab,
  }) => {
    const original = await lab.create();
    for (const method of ['get', 'delete'] as const) {
      await problem(
        await lab.request[method](`orders/${original.id}`, {
          headers: { Authorization: 'Bearer invalid', 'If-Match': '"1"' },
        }),
        401,
      );
    }
    expect(await lab.get(original.id)).toEqual(original);
    expect((await lab.change(original, { quantity: 3 })).status()).toBe(200);
  });
});
