import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
export const requestContext: RequestHandler = (_req, res, next) => {
  const id = randomUUID();
  res.setHeader("X-Request-ID", id);
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
