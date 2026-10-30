import { test, expect, type APIRequestContext } from "@playwright/test";
import { z } from "zod";
const post = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  title: z.string(),
  body: z.string(),
});
const fields = { userId: 1, title: "Assertide", body: "fixture" };
let lastRequest = 0;
async function exchange(
  request: APIRequestContext,
  path: string,
  method = "GET",
  data?: unknown,
) {
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, 1000 - (Date.now() - lastRequest))),
  );
  lastRequest = Date.now();
  const response = await request.fetch(
    `https://jsonplaceholder.typicode.com${path}`,
    {
      method,
      ...(data === undefined ? {} : { data }),
      maxRedirects: 0,
      maxRetries: 0,
      timeout: 15000,
    },
  );
  if ([403, 429].includes(response.status()))
    throw new Error(
      `Public practice stopped: HTTP ${response.status()}; Retry-After ${response.headers()["retry-after"] ?? "unspecified"}`,
    );
  expect(response.headers()["content-type"]).toContain("application/json");
  const body: unknown = await response.json();
  await test
    .info()
    .attach("request-response", {
      contentType: "application/json",
      body: JSON.stringify({
        method,
        path,
        status: response.status(),
        request: data,
        response: body,
      }),
    });
  return { status: response.status(), body };
}
test("API-001 Read post contract", async ({ request }) => {
  const result = await exchange(request, "/posts/1");
  expect(result.status).toBe(200);
  expect(post.parse(result.body).id).toBe(1);
});
test("API-002 Filter by owner", async ({ request }) => {
  const result = await exchange(request, "/posts?userId=1");
  expect(result.status).toBe(200);
  const posts = z.array(post).nonempty().parse(result.body);
  expect(posts.every((item) => item.userId === 1)).toBe(true);
});
test("API-003 Simulated creation", async ({ request }) => {
  const result = await exchange(request, "/posts", "POST", fields);
  expect(result.status).toBe(201);
  expect(post.parse(result.body)).toMatchObject(fields);
});
test("API-004 Simulated replacement", async ({ request }) => {
  const result = await exchange(request, "/posts/1", "PUT", fields);
  expect(result.status).toBe(200);
  expect(post.parse(result.body)).toEqual({ id: 1, ...fields });
});
test("API-005 Simulated patch", async ({ request }) => {
  const baseline = post.parse((await exchange(request, "/posts/1")).body);
  const result = await exchange(request, "/posts/1", "PATCH", {
    title: "Updated",
  });
  expect(result.status).toBe(200);
  expect(post.parse(result.body)).toEqual({ ...baseline, title: "Updated" });
});
test("API-006 Simulated deletion", async ({ request }) => {
  const result = await exchange(request, "/posts/1", "DELETE");
  expect(result.status).toBe(200);
  expect(result.body).toEqual({});
});
test("API-007 Nested relationship", async ({ request }) => {
  const result = await exchange(request, "/posts/1/comments");
  expect(result.status).toBe(200);
  const comments = z
    .array(
      z.object({
        postId: z.literal(1),
        id: z.number().int(),
        name: z.string(),
        email: z.email(),
        body: z.string(),
      }),
    )
    .nonempty()
    .parse(result.body);
  expect(comments.length).toBeGreaterThan(0);
});
