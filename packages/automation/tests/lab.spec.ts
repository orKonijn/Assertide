import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "./api-fixture";
import { randomUUID, createHmac } from "node:crypto";
import { z } from "zod";

const order = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  sku: z.string(),
  quantity: z.number().int().min(1).max(10),
  status: z.enum(["draft", "confirmed"]),
  version: z.number().int(),
  createdAt: z.iso.datetime(),
});
const fields = { sku: "DEMO-01", quantity: 2, status: "draft" };
function signed(
  payload: Record<string, unknown>,
  key = process.env["LAB_SIGNING_KEY"],
) {
  if (!key) throw new Error("LAB_SIGNING_KEY required");
  const data = [
    { alg: "HS256" },
    {
      iss: "assertide-lab",
      exp: Math.floor(Date.now() / 1000) + 300,
      ...payload,
    },
  ]
    .map((value) => Buffer.from(JSON.stringify(value)).toString("base64url"))
    .join(".");
  return `${data}.${createHmac("sha256", key).update(data).digest("base64url")}`;
}
function control(
  subject = "operator-a",
  fault?: string,
  scope = randomUUID(),
  clock = Date.now(),
) {
  return {
    "X-Lab-Fixture": signed({
      sub: subject,
      aud: "assertide-lab-fixture",
      scope,
      clock,
      fault,
    }),
    ...(fault ? { "X-Lab-Fault": fault } : {}),
  };
}
async function credentials(
  request: APIRequestContext,
  username = "operator-a",
) {
  const password = process.env["LAB_PASSWORD"];
  if (!password) throw new Error("LAB_PASSWORD required");
  const response = await request.post("auth/token", {
    data: { username, password },
  });
  expect(response.status()).toBe(200);
  const token = z
    .object({ access_token: z.string() })
    .parse(await response.json());
  return {
    Authorization: `Bearer ${token.access_token}`,
    ...control(username),
  };
}

test("LAB-001 Persistent order lifecycle", async ({ request }) => {
  const headers = await credentials(request);
  const created = await request.post("orders", {
    headers: { ...headers, "Idempotency-Key": randomUUID() },
    data: fields,
  });
  expect(created.status()).toBe(201);
  const item = order.parse(await created.json());
  const url = `orders/${item.id}`;
  try {
    expect((await request.get(url, { headers })).status()).toBe(200);
    const replaced = await request.put(url, {
      headers: { ...headers, "If-Match": '"1"' },
      data: { ...fields, quantity: 3 },
    });
    expect(replaced.status()).toBe(200);
    expect(order.parse(await replaced.json()).quantity).toBe(3);
    const patched = await request.patch(url, {
      headers: { ...headers, "If-Match": '"2"' },
      data: { quantity: 4 },
    });
    expect(patched.status()).toBe(200);
    expect(order.parse(await patched.json()).quantity).toBe(4);
    expect(
      (
        await request.delete(url, {
          headers: { ...headers, "If-Match": '"3"' },
        })
      ).status(),
    ).toBe(204);
    expect((await request.get(url, { headers })).status()).toBe(404);
  } finally {
    const current = await request.get(url, { headers });
    if (current.ok())
      await request.delete(url, {
        headers: { ...headers, "If-Match": current.headers()["etag"] ?? "" },
      });
  }
});
test("LAB-002 Missing authentication", async ({ request }) => {
  const response = await request.get("orders");
  expect(response.status()).toBe(401);
  expect(await response.json()).toMatchObject({ status: 401 });
});

test("LAB-003 Invalid and expired token", async ({ request }) => {
  const claims = {
    sub: "operator-a",
    aud: "assertide-lab-api",
    tenant: "00000000-0000-4000-8000-000000000001",
    role: "operator",
  };
  for (const token of [
    signed(claims, "invalid-test-signature-key-not-a-secret"),
    signed({ ...claims, exp: 1 }),
  ]) {
    const response = await request.get("orders", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(401);
    expect(await response.json()).toMatchObject({
      detail: "Invalid or expired token",
    });
  }
});

test("LAB-006 Quantity boundary validation", async ({ request }) => {
  const headers = await credentials(request);
  for (const quantity of [0, 1, 10, 11]) {
    const response = await request.post("orders", {
      headers: { ...headers, "Idempotency-Key": randomUUID() },
      data: { ...fields, quantity },
    });
    expect(response.status()).toBe(
      quantity === 0 || quantity === 11 ? 422 : 201,
    );
    if (response.status() === 422)
      expect((await response.json()).detail).toContain("/quantity");
    else {
      const item = order.parse(await response.json());
      expect(item.quantity).toBe(quantity);
      expect(
        (
          await request.delete(`orders/${item.id}`, {
            headers: { ...headers, "If-Match": '"1"' },
          })
        ).status(),
      ).toBe(204);
    }
  }
});

test("LAB-007 Malformed JSON and media type", async ({ request }) => {
  const headers = {
    ...(await credentials(request)),
    "Idempotency-Key": randomUUID(),
  };
  expect(
    (
      await request.post("orders", {
        headers: { ...headers, "Content-Type": "application/json" },
        data: "{",
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("orders", {
        headers: { ...headers, "Content-Type": "text/plain" },
        data: "{}",
      })
    ).status(),
  ).toBe(415);
});

test("LAB-010 Pagination has no overlap", async ({ request }) => {
  const auth = await credentials(request);
  const sku = randomUUID();
  const ids: string[] = [];
  const scope = randomUUID();
  let tick = 0;
  const headers = () => ({
    ...auth,
    ...control("operator-a", undefined, scope, tick++ * 60000),
  });
  try {
    for (let i = 0; i < 25; i++) {
      const response = await request.post("orders", {
        headers: { ...headers(), "Idempotency-Key": randomUUID() },
        data: { ...fields, sku },
      });
      expect(response.status()).toBe(201);
      ids.push(order.parse(await response.json()).id);
    }
    const page = z.object({
      items: z.array(order),
      nextCursor: z.string().nullable(),
    });
    const first = page.parse(
      await (
        await request.get("orders", {
          headers: headers(),
          params: { sku, limit: 20 },
        })
      ).json(),
    );
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).toBeTruthy();
    const second = page.parse(
      await (
        await request.get("orders", {
          headers: headers(),
          params: { sku, limit: 20, cursor: first.nextCursor! },
        })
      ).json(),
    );
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    expect([...first.items, ...second.items].map((item) => item.id)).toEqual(
      ids.sort(),
    );
  } finally {
    for (const id of ids)
      await request.delete(`orders/${id}`, {
        headers: { ...headers(), "If-Match": '"1"' },
      });
  }
});

test("LAB-011 Rate-limit handling", async ({ request }) => {
  const auth = await credentials(request);
  const response = await request.get("orders", {
    headers: { ...auth, ...control("operator-a", "rate-limit") },
  });
  expect(response.status()).toBe(429);
  expect(response.headers()["retry-after"]).toBe("2");
  const scope = randomUUID();
  const headers = { ...auth, ...control("operator-a", undefined, scope, 0) };
  for (let i = 0; i < 20; i++)
    expect((await request.get("orders", { headers })).status()).toBe(200);
  expect((await request.get("orders", { headers })).status()).toBe(429);
  expect(
    (
      await request.get("orders", {
        headers: { ...auth, ...control("operator-a", undefined, scope, 60000) },
      })
    ).status(),
  ).toBe(200);
});

test("LAB-012 Bounded timeout", async ({ request }, info) => {
  const headers = {
    ...(await credentials(request)),
    ...control("operator-a", "timeout"),
  };
  const start = performance.now();
  await expect(
    request.get("orders", { headers, timeout: 500 }),
  ).rejects.toThrow(/timed out|timeout/i);
  const durationMs = performance.now() - start;
  expect(durationMs).toBeLessThan(1500);
  await info.attach("transport-timeout", {
    body: JSON.stringify({ kind: "transport", durationMs }),
    contentType: "application/json",
  });
});

test("LAB-013 Service failure diagnosis", async ({ request }, info) => {
  const response = await request.get("orders", {
    headers: {
      ...(await credentials(request)),
      ...control("operator-a", "503"),
    },
  });
  expect(response.status()).toBe(503);
  const body = await response.json();
  expect(body).toMatchObject({
    status: 503,
    correlationId: expect.any(String),
  });
  await info.attach("safe-request-context", {
    body: JSON.stringify({
      method: "GET",
      path: "/orders",
      status: response.status(),
      response: body,
    }),
    contentType: "application/json",
  });
});

test("LAB-014 Response-time budget", async ({ request }, info) => {
  const auth = await credentials(request);
  for (let i = 0; i < 3; i++)
    expect((await request.get("orders", { headers: auth })).status()).toBe(200);
  const headers = { ...auth, ...control() };
  const samples: number[] = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    expect((await request.get("orders", { headers })).status()).toBe(200);
    samples.push(performance.now() - start);
  }
  const p95 = [...samples].sort((a, b) => a - b)[18];
  await info.attach("local-latency", {
    body: JSON.stringify({ samples, p95, unit: "ms" }),
    contentType: "application/json",
  });
  expect(p95).toBeLessThan(500);
});

test("LAB-015 Confirmed-order deletion protection", async ({ request }) => {
  const headers = await credentials(request);
  const response = await request.post("orders", {
    headers: { ...headers, "Idempotency-Key": randomUUID() },
    data: { ...fields, status: "confirmed" },
  });
  expect(response.status()).toBe(201);
  const item = order.parse(await response.json());
  const url = `orders/${item.id}`;
  try {
    expect(
      (
        await request.delete(url, {
          headers: { ...headers, "If-Match": '"1"' },
        })
      ).status(),
    ).toBe(409);
    expect(
      order.parse(await (await request.get(url, { headers })).json()),
    ).toEqual(item);
  } finally {
    const updated = await request.patch(url, {
      headers: { ...headers, "If-Match": '"1"' },
      data: { status: "draft" },
    });
    expect(updated.status()).toBe(200);
    await request.delete(url, { headers: { ...headers, "If-Match": '"2"' } });
  }
});
test("LAB-004 Viewer cannot create", async ({ request }) => {
  const headers = await credentials(request, "viewer-a");
  const response = await request.post("orders", {
    headers: { ...headers, "Idempotency-Key": randomUUID() },
    data: fields,
  });
  expect(response.status()).toBe(403);
});
test("LAB-005 Tenant separation", async ({ request }) => {
  const a = await credentials(request);
  const b = await credentials(request, "operator-b");
  const created = await request.post("orders", {
    headers: { ...a, "Idempotency-Key": randomUUID() },
    data: fields,
  });
  const item = order.parse(await created.json());
  const url = `orders/${item.id}`;
  try {
    expect((await request.get(url, { headers: b })).status()).toBe(404);
    expect(
      (
        await request.patch(url, {
          headers: { ...b, "If-Match": '"1"' },
          data: { quantity: 9 },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await request.delete(url, { headers: { ...b, "If-Match": '"1"' } })
      ).status(),
    ).toBe(404);
    expect(
      order.parse(await (await request.get(url, { headers: a })).json())
        .quantity,
    ).toBe(2);
  } finally {
    await request.delete(url, { headers: { ...a, "If-Match": '"1"' } });
  }
});
test("LAB-008 Optimistic concurrency", async ({ request }) => {
  const headers = await credentials(request);
  const created = await request.post("orders", {
    headers: { ...headers, "Idempotency-Key": randomUUID() },
    data: fields,
  });
  const item = order.parse(await created.json());
  const url = `orders/${item.id}`;
  try {
    expect(
      (
        await request.patch(url, {
          headers: { ...headers, "If-Match": '"1"' },
          data: { quantity: 3 },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await request.patch(url, {
          headers: { ...headers, "If-Match": '"1"' },
          data: { quantity: 4 },
        })
      ).status(),
    ).toBe(412);
  } finally {
    await request.delete(url, { headers: { ...headers, "If-Match": '"2"' } });
  }
});
test("LAB-009 Idempotency deduplication", async ({ request }) => {
  const headers = {
    ...(await credentials(request)),
    "Idempotency-Key": randomUUID(),
  };
  const first = await request.post("orders", { headers, data: fields });
  const item = order.parse(await first.json());
  try {
    const second = await request.post("orders", { headers, data: fields });
    expect(second.status()).toBe(201);
    expect(order.parse(await second.json()).id).toBe(item.id);
    expect(
      (
        await request.post("orders", {
          headers,
          data: { ...fields, quantity: 3 },
        })
      ).status(),
    ).toBe(409);
  } finally {
    await request.delete(`orders/${item.id}`, {
      headers: { ...headers, "If-Match": '"1"' },
    });
  }
});
