import { test } from '@playwright/test';

test('large evidence stays outside terminal result manifests', async ({
  browserName,
}, testInfo) => {
  void browserName;
  for (let index = 0; index < 70; index++) {
    await testInfo.attach(`evidence-${index}`, {
      body: Buffer.alloc(1024 * 1024, index),
      contentType: 'application/octet-stream',
    });
  }
});
