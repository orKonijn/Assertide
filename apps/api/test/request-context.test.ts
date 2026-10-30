import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { requestContext, failureResponse } from "../src/request-context.ts";

test("request correlation ignores caller identifiers and never logs request secrets", async () => {
  const app = express();
  app.use(requestContext);
  app.get("/failure", (_req, res) =>
    failureResponse(
      res,
      Object.assign(new Error("private database password"), {
        code: "08006",
        detail: "private",
      }),
      "platform",
      "Internal service error",
    ),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const events: string[] = [];
  const warn = console.warn;
  console.warn = (value) => events.push(String(value));
  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/failure?token=private`,
      {
        headers: { "X-Request-ID": "forged", Authorization: "Bearer private" },
      },
    );
    const id = response.headers.get("x-request-id");
    assert.match(id!, /^[0-9a-f-]{36}$/);
    assert.equal((await response.json()).correlationId, id);
    assert.ok(
      events.every(
        (value) => !value.includes("private") && !value.includes("forged"),
      ),
    );
    assert.deepEqual(
      events.map((value) => JSON.parse(value)),
      [
        {
          event: "operation_failed",
          requestId: id,
          operation: "platform",
          category: "database",
          code: "08006",
          status: 500,
        },
        { event: "request_failed", requestId: id, status: 500 },
      ],
    );
  } finally {
    console.warn = warn;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
