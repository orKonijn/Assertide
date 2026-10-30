import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { isShortLivedEvidence, removeShortLivedFiles } from './evidence-files.ts';
import { objectReference, objectStore } from './object-store.ts';

export const rawManifest = z.object({
  createdAt: z.iso.datetime(),
  files: z.array(
    z.object({
      name: z.string(),
      shortLived: z.boolean(),
      object: objectReference,
    }),
  ),
});
function target(root: string, name: string): string {
  if (
    !name ||
    name.includes('\\') ||
    name.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error('Invalid raw evidence path');
  }
  const result = path.resolve(root, name);
  if (!result.startsWith(path.resolve(root) + path.sep)) {
    throw new Error('Raw evidence escapes storage');
  }
  return result;
}
export async function archiveRaw(
  id: string,
  root: string,
): Promise<
  | {
      createdAt: string;
      files: {
        name: string;
        shortLived: boolean;
        object: { key: string; sha256: string; version?: string | undefined };
      }[];
    }
  | undefined
> {
  z.uuid().parse(id);
  if (!objectStore) {
    return undefined;
  }
  const generation = randomUUID();
  const files: z.infer<typeof rawManifest>['files'] = [];
  async function walk(directory: string, relative = ''): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) {
        throw new Error('Raw evidence symlink forbidden');
      }
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      const file = target(root, name);
      if (entry.isDirectory()) {
        await walk(file, name);
      } else if (entry.isFile()) {
        const bytes = await readFile(file);
        const shortLived = isShortLivedEvidence(name, bytes);
        files.push({
          name,
          shortLived,
          object: await objectStore!.put(
            `runs/${id}/raw/${shortLived ? 'short' : 'long'}/${generation}/${name}`,
            bytes,
            'application/octet-stream',
          ),
        });
      }
    }
  }
  await walk(root);
  return rawManifest.parse({ createdAt: new Date().toISOString(), files });
}
export async function restoreRaw(
  id: string,
  root: string,
  value: unknown,
  endedAt: string,
  now = new Date(),
): Promise<void> {
  z.uuid().parse(id);
  if (!objectStore) {
    throw new Error('Object storage is unavailable');
  }
  const age = now.getTime() - new Date(z.iso.datetime().parse(endedAt)).getTime();
  if (age >= 30 * 86400000) {
    throw new Error('Raw evidence expired after 30 days');
  }
  const manifest = rawManifest.parse(value);
  await mkdir(root, { recursive: true });
  if (age >= 14 * 86400000) {
    await removeShortLivedFiles(root);
  }
  for (const entry of manifest.files) {
    if (entry.shortLived && age >= 14 * 86400000) {
      continue;
    }
    if (!entry.object.key.startsWith(`runs/${id}/raw/${entry.shortLived ? 'short' : 'long'}/`)) {
      throw new Error('Raw evidence belongs to another run');
    }
    const file = target(root, entry.name);
    // Never follow links in an existing staging directory.
    for (
      let cursor = file;
      cursor !== path.dirname(path.resolve(root));
      cursor = path.dirname(cursor)
    ) {
      try {
        if ((await lstat(cursor)).isSymbolicLink()) {
          throw new Error('Raw evidence symlink forbidden');
        }
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
          throw error;
        }
      }
    }
    const bytes = await objectStore.get(entry.object);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }
}
