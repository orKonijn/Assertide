import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { z } from 'zod';

import { catalogRevision, verifySource } from './source.ts';

const spec = z.object({
  title: z.string(),
  file: z.string(),
  line: z.number().int(),
  tags: z.array(z.string()).default([]),
  tests: z.array(z.object({ projectName: z.string() })),
});
interface Suite {
  specs: z.infer<typeof spec>[];
  suites: Suite[];
}
const suite: z.ZodType<Suite> = z.object({
  specs: z.array(spec).default([]),
  suites: z.lazy(() => z.array(suite)).default([]),
});
const document = z.object({
  suites: z.array(suite),
  errors: z.array(z.unknown()).default([]),
});
export const discoveredCase = z.object({
  id: z.string(),
  title: z.string(),
  file: z.string(),
  line: z.number().int(),
  tags: z.array(z.string()),
  projects: z.array(z.string()),
});
export function parseDiscovery(
  input: unknown,
): { id: string; title: string; file: string; line: number; tags: string[]; projects: string[] }[] {
  const data = document.parse(input);
  if (data.errors.length) {
    throw new Error('Discovery reported errors');
  }
  const flatten = (node: Suite): z.infer<typeof spec>[] => [
    ...node.specs,
    ...node.suites.flatMap(flatten),
  ];
  const cases = new Map<string, z.infer<typeof discoveredCase>>();
  for (const item of data.suites.flatMap(flatten)) {
    const match = /^(LAB|UI)-\d{3,8}(?= )/.exec(item.title);
    if (!match) {
      throw new Error('Discovered test lacks an approved stable case ID');
    }
    const id = match[0];
    const previous = cases.get(id);
    if (
      previous &&
      (previous.file !== item.file ||
        previous.line !== item.line ||
        previous.title !== item.title.slice(id.length + 1))
    ) {
      throw new Error(`Duplicate stable case ID: ${id}`);
    }
    cases.set(id, {
      id,
      title: item.title.slice(id.length + 1),
      file: item.file,
      line: item.line,
      tags: item.tags,
      projects: [
        ...new Set([...(previous?.projects ?? []), ...item.tests.map((test) => test.projectName)]),
      ].sort(),
    });
  }
  if (!cases.size) {
    throw new Error('Discovery returned no approved tests');
  }
  return [...cases.values()].sort((a, b) => a.id.localeCompare(b.id));
}
let pending: Promise<z.infer<typeof discoveredCase>[]> | undefined;
export function discoverApprovedSource(): Promise<
  { id: string; title: string; file: string; line: number; tags: string[]; projects: string[] }[]
> {
  pending ??= (async () => {
    const snapshot = await verifySource(catalogRevision);
    const cli = fileURLToPath(
      new URL('../../../packages/automation/node_modules/@playwright/test/cli.js', import.meta.url),
    );
    const result = await promisify(execFile)(
      process.execPath,
      [
        cli,
        'test',
        '--config',
        path.join(snapshot, 'playwright.config.ts'),
        '--list',
        '--reporter=json',
      ],
      { timeout: 30000, maxBuffer: 20_000_000, windowsHide: true },
    );
    return parseDiscovery(JSON.parse(result.stdout));
  })();
  return pending;
}
