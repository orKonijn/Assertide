import { createHash, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { access, mkdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const automation = path.join(root, 'packages', 'automation');
export const sourceRoot = process.env['SOURCE_ROOT'] ?? path.join(root, '.local', 'sources');
function files(directory: string): string[] {
  return readdirSync(path.join(automation, directory), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const relative = path.posix.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error('Automation sources must not contain symlinks');
    }
    return entry.isDirectory() ? files(relative) : [relative];
  });
}
const entries = [
  ...files('tests'),
  ...files('ui'),
  'playwright.config.ts',
  'checkpoint-reporter.ts',
  'package.json',
  'package-lock.json',
]
  .sort()
  .map((file) => ({
    file,
    body: readFileSync(path.join(automation, file)),
  }));
export const sourceManifest = entries.map(({ file, body }) => ({
  file,
  sha256: createHash('sha256').update(body).digest('hex'),
}));
export const catalogRevision = createHash('sha256')
  .update(JSON.stringify(sourceManifest))
  .digest('hex');
export async function prepareSource(storageRoot = sourceRoot): Promise<void> {
  const destination = path.join(storageRoot, catalogRevision);
  try {
    await access(path.join(destination, 'manifest.json'));
    await verifySource(catalogRevision, storageRoot);
    return;
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
      throw error;
    }
  }
  const staging = path.join(storageRoot, `staging-${randomUUID()}`);
  await mkdir(staging, { recursive: true });
  try {
    for (const { file, body } of entries) {
      await mkdir(path.dirname(path.join(staging, file)), { recursive: true });
      await writeFile(path.join(staging, file), body, { flag: 'wx' });
    }
    await writeFile(path.join(staging, 'manifest.json'), JSON.stringify(sourceManifest), {
      flag: 'wx',
    });
    // Trusted development dependency installation; production workers must use a pinned image.
    await symlink(
      path.join(automation, 'node_modules'),
      path.join(staging, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(staging, destination);
        return;
      } catch (error) {
        // A concurrent initializer may have published the same complete snapshot.
        try {
          await verifySource(catalogRevision, storageRoot);
          return;
        } catch {
          /* Not published yet. */
        }
        if (
          attempt >= 4 ||
          !(
            error &&
            typeof error === 'object' &&
            'code' in error &&
            ['EPERM', 'EACCES'].includes(String(error.code))
          )
        ) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
      }
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
export async function verifySource(revision: string, storageRoot = sourceRoot): Promise<string> {
  if (!/^[a-f0-9]{64}$/.test(revision)) {
    throw new Error('Execution has no approved source snapshot');
  }
  const directory = path.join(storageRoot, revision);
  const manifest: unknown = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  if (
    !Array.isArray(manifest) ||
    createHash('sha256').update(JSON.stringify(manifest)).digest('hex') !== revision
  ) {
    throw new Error('Source manifest integrity failure');
  }
  for (const entry of manifest as { file: string; sha256: string }[]) {
    if (!entry.file || entry.file.includes('..') || path.isAbsolute(entry.file)) {
      throw new Error('Invalid source path');
    }
    if (
      createHash('sha256')
        .update(readFileSync(path.join(directory, entry.file)))
        .digest('hex') !== entry.sha256
    ) {
      throw new Error('Source snapshot integrity failure');
    }
  }
  return directory;
}
