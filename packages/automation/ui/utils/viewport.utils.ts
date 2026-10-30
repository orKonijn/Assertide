import type { Page } from '@playwright/test';

import { Viewports } from '../types/test-data';
export function viewport(page: Page, size: keyof typeof Viewports): Promise<void> {
  return page.setViewportSize(Viewports[size]);
}
export function fitsViewport(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}
