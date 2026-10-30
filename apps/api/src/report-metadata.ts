import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';
export const toolchainSchema = z.object({
  node: z.string(),
  platform: z.string(),
  architecture: z.string(),
  playwright: z.string(),
  allure: z.string().default('not recorded'),
  allureIntegration: z.string().default('not recorded'),
  browserBuilds: z.array(
    z.object({
      name: z.string(),
      revision: z.string(),
      version: z.string().optional(),
    }),
  ),
});
export const caseMetadata = z.object({
  id: z.string(),
  feature: z.string(),
  module: z.string().default(''),
  owner: z.string().default(''),
  quarantined: z.boolean().default(false),
  priority: z.enum(['P0', 'P1', 'P2']),
  tags: z.array(z.string()).default([]),
});
const resultSchema = z
  .object({
    name: z.string(),
    labels: z.array(z.object({ name: z.string(), value: z.string() })).default([]),
  })
  .passthrough();
export async function enrichReport(
  directory: string,
  run: {
    id: string;
    projectId: string;
    config: { catalogRevision: string; environmentId: string };
    metadata: z.infer<typeof caseMetadata>[];
    workerImage?: string | undefined;
  },
  toolchain: z.infer<typeof toolchainSchema>,
): Promise<void> {
  for (const name of await readdir(directory)) {
    if (!name.endsWith('-result.json')) {
      continue;
    }
    const file = path.join(directory, name);
    const result = resultSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    const metadata = run.metadata.find((item) => item.id === result.name.split(' ')[0]);
    if (!metadata) {
      continue;
    }
    const owned = new Set(['owner', 'feature', 'subSuite', 'severity', 'tag']);
    result.labels = result.labels.filter((label) => !owned.has(label.name));
    result.labels.push(
      { name: 'feature', value: metadata.feature },
      {
        name: 'severity',
        value: { P0: 'critical', P1: 'normal', P2: 'minor' }[metadata.priority],
      },
      ...metadata.tags.map((value) => ({ name: 'tag', value })),
    );
    if (metadata.quarantined) {
      result.labels.push({ name: 'tag', value: 'quarantined' });
    }
    if (metadata.owner) {
      result.labels.push({ name: 'owner', value: metadata.owner });
    }
    if (metadata.module) {
      result.labels.push({ name: 'subSuite', value: metadata.module });
    }
    await writeFile(file, JSON.stringify(result));
  }
  const escape = (value: string): string =>
    value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/=/g, '\\=');
  const environment = {
    Environment: run.config.environmentId,
    Project: run.projectId,
    Source: run.config.catalogRevision,
    Node: toolchain.node,
    Playwright: toolchain.playwright,
    Allure: toolchain.allure,
    AllureIntegration: toolchain.allureIntegration,
    Platform: `${toolchain.platform}/${toolchain.architecture}`,
    Worker: run.workerImage ?? 'trusted local process',
    ...Object.fromEntries(
      toolchain.browserBuilds.map((browser) => [
        browser.name,
        `${browser.version ?? 'unknown'} (build ${browser.revision})`,
      ]),
    ),
  };
  await writeFile(
    path.join(directory, 'environment.properties'),
    Object.entries(environment)
      .map(([key, value]) => `${escape(key)}=${escape(value)}`)
      .join('\n'),
  );
  await writeFile(
    path.join(directory, 'executor.json'),
    JSON.stringify({
      name: 'Assertide',
      type: 'github',
      buildName: run.id,
      buildUrl: `${process.env['APP_ORIGIN'] ?? 'http://127.0.0.1:4200'}/runs/${run.id}`,
    }),
  );
}
