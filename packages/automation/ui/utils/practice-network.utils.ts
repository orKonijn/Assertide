import type { BrowserContext } from "@playwright/test";
import { PracticeRoutes } from "../types/practice.selectors";
export async function restrictPractice(context: BrowserContext) {
  let stopped = false;
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (stopped || url.origin !== PracticeRoutes.origin) return route.abort();
    const response = await route.fetch({ maxRedirects: 0, maxRetries: 0 });
    if ([403, 429].includes(response.status())) {
      stopped = true;
      await route.abort();
      throw new Error(`Public practice stopped: HTTP ${response.status()}`);
    }
    await route.fulfill({ response });
  });
}
