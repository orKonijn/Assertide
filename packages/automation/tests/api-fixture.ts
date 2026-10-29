import {
  test as base,
  expect,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";

const redact = (text: string) =>
  text
    .replace(
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      "[REDACTED TOKEN]",
    )
    .split(process.env["LAB_PASSWORD"] ?? "\u0000")
    .join("[REDACTED]");
export const test = base.extend<{ request: APIRequestContext }>({
  request: async ({ playwright, baseURL }, use, info) => {
    const context = await playwright.request.newContext({ baseURL });
    const methods = new Set(["get", "post", "put", "patch", "delete", "head"]);
    const observed = new Proxy(context, {
      get(target, property) {
        const value: unknown = Reflect.get(target, property);
        if (
          typeof property !== "string" ||
          !methods.has(property) ||
          typeof value !== "function"
        )
          return typeof value === "function" ? value.bind(target) : value;
        return async (
          url: string,
          options?: { data?: unknown; params?: unknown },
        ) => {
          if (url.includes("auth/token"))
            return Reflect.apply(value, target, [
              url,
              options,
            ]) as Promise<APIResponse>;
          const start = performance.now();
          const request = {
            method: property.toUpperCase(),
            path: url,
            query: options?.params,
            body: options?.data,
          };
          try {
            const response = (await Reflect.apply(value, target, [
              url,
              options,
            ])) as APIResponse;
            const text = (await response.text()).slice(0, 65536);
            let body: unknown = text;
            try {
              body = JSON.parse(text);
            } catch {
              /* Preserve non-JSON and truncated bodies. */
            }
            await info.attach("api-exchange.json", {
              body: redact(
                JSON.stringify({
                  request,
                  response: {
                    status: response.status(),
                    contentType: response.headers()["content-type"],
                    body,
                  },
                  durationMs: performance.now() - start,
                }),
              ),
              contentType: "application/json",
            });
            return response;
          } catch (error) {
            await info.attach("api-transport.json", {
              body: redact(
                JSON.stringify({
                  request,
                  transportError:
                    error instanceof Error
                      ? error.message
                      : "Transport failure",
                  durationMs: performance.now() - start,
                }),
              ),
              contentType: "application/json",
            });
            throw error;
          }
        };
      },
    });
    try {
      await use(observed);
    } finally {
      await context.dispose();
    }
  },
});
export { expect };
