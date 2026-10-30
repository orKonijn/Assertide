import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import type { Download } from '@playwright/test';
import { z } from 'zod';
export async function downloadText(download: Download): Promise<string> {
  const file = await download.path();
  if (!file) {
    throw new Error('Download did not produce a file');
  }
  return readFile(file, 'utf8');
}
export async function reportMetadata(
  id: string,
): Promise<{ environment: string; result: { labels: { name: string; value: string }[] } }> {
  const directory = path.resolve('../../.local/runs', z.uuid().parse(id), 'allure-results');
  const file = (await readdir(directory)).find((name) => name.endsWith('-result.json'));
  if (!file) {
    throw new Error('No Allure result');
  }
  return {
    environment: await readFile(path.join(directory, 'environment.properties'), 'utf8'),
    result: JSON.parse(await readFile(path.join(directory, file), 'utf8')) as {
      labels: { name: string; value: string }[];
    },
  };
}
export async function removeLocalRawCopy(id: string): Promise<void> {
  const runDirectory = path.resolve('../../.local/runs', z.uuid().parse(id));
  const directory = path.resolve(runDirectory, 'allure-results');
  if (path.dirname(directory) !== runDirectory) {
    throw new Error('Unsafe evidence cleanup');
  }
  await rm(directory, { recursive: true, force: true });
}
