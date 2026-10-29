import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
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
  return { Authorization: `Bearer ${token.access_token}` };
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
