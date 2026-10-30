import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { zip, type Zippable } from 'fflate';

import { isShortLivedEvidence } from './evidence-files.ts';
export const reportBundleName = 'assertide-report.zip';
export const mediaBundleName = 'assertide-report-with-media.zip';
export async function buildReportBundles(
  root: string,
  files: { name: string; filename: string }[],
  id: string,
  generation: string,
  mediaAvailable: boolean,
): Promise<{ name: string; filename: string; sha256: string; bytes: number }[]> {
  const base: Zippable = {};
  const complete: Zippable = {};
  let size = 0;
  let hasMedia = false;
  for (const file of files) {
    if ([reportBundleName, mediaBundleName, 'assertide-build.json'].includes(file.name)) {
      throw new Error('Reserved report asset name');
    }
    const bytes = await readFile(file.filename);
    size += bytes.length;
    if (size > 256 * 1024 * 1024) {
      throw new Error('Report export exceeds the 256 MiB build limit');
    }
    const short = isShortLivedEvidence(file.name, bytes);
    if (!short) {
      base[file.name] = bytes;
    } else {
      hasMedia = true;
    }
    if (!short || mediaAvailable) {
      complete[file.name] = bytes;
    }
  }
  const generatedAt = new Date().toISOString();
  const output: {
    name: string;
    filename: string;
    sha256: string;
    bytes: number;
  }[] = [];
  for (const [name, entries, media] of [
    [reportBundleName, base, false],
    ...(hasMedia && mediaAvailable ? [[mediaBundleName, complete, true] as const] : []),
  ] as const) {
    entries['assertide-build.json'] = Buffer.from(
      JSON.stringify({
        runId: id,
        generation,
        generatedAt,
        includesTraceVideo: media,
        note: media
          ? 'Includes retained trace and video evidence.'
          : 'Trace and video evidence are excluded from this archive; download them separately while retained.',
      }),
    );
    const bytes = await new Promise<Uint8Array>((resolve, reject) =>
      zip(entries, { level: 1 }, (error, data) => (error ? reject(error) : resolve(data))),
    );
    const filename = path.join(root, name);
    await writeFile(filename, bytes);
    output.push({
      name,
      filename,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
    });
  }
  return output;
}
