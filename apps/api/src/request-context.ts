import { randomUUID } from "node:crypto";
import type { RequestHandler, Response } from "express";

export function requestId(res: Response): string {
  const existing = res.getHeader("X-Request-ID");
  if (typeof existing === "string") return existing;
  const id = randomUUID();
  res.setHeader("X-Request-ID", id);
  return id;
}

const failureCodes: Record<string, string> = {
  "23505": "database",
  "23503": "database",
  "40001": "database",
  "40P01": "database",
  "53300": "database",
  "57P01": "database",
  "08006": "database",
  VAULT_OPERATION_FAILED: "vault",
  ECONNREFUSED: "transport",
  ETIMEDOUT: "transport",
  ECONNRESET: "transport",
  NoSuchKey: "storage",
  NoSuchBucket: "storage",
  AccessDenied: "storage",
  SlowDown: "storage",
  ZodError: "validation",
  TimeoutError: "timeout",
};

export function failureResponse(
  res: Response,
  error: unknown,
  operation:
    "platform" | "administration" | "environments" | "service_accounts",
  title: string,
  status = 500,
) {
  const id = requestId(res);
  if (status >= 500) {
    const candidate = error && typeof error === "object" ? error : {};
    const raw =
      "code" in candidate
        ? candidate.code
        : "name" in candidate
          ? candidate.name
          : undefined;
    const code =
      typeof raw === "string" && Object.hasOwn(failureCodes, raw)
        ? raw
        : "UNEXPECTED";
    console.warn(
      JSON.stringify({
        event: "operation_failed",
        requestId: id,
        operation,
        category: failureCodes[code] ?? "application",
        code,
        status,
      }),
    );
  }
  res
    .status(status)
    .type("application/problem+json")
    .json({ status, title, correlationId: id });
}

export const requestContext: RequestHandler = (_req, res, next) => {
  const id = requestId(res);
  res.once("finish", () => {
    if (res.statusCode >= 500)
      console.warn(
        JSON.stringify({
          event: "request_failed",
          requestId: id,
          status: res.statusCode,
        }),
      );
  });
  next();
};
