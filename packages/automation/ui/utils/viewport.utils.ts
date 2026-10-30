import type { Page } from "@playwright/test";
import { Viewports } from "../types/test-data";
export function viewport(page: Page, size: keyof typeof Viewports) {
  return page.setViewportSize(Viewports[size]);
}
export function fitsViewport(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
}
