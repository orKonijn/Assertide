import { readdir, open, unlink } from "node:fs/promises";
import path from "node:path";
export function isShortLivedEvidence(name: string, header: Buffer) {
  return (
    /\.(zip|webm)$/i.test(name) ||
    ["504b0304", "1a45dfa3"].includes(header.subarray(0, 4).toString("hex"))
  );
}
export async function removeShortLivedFiles(
  directory: string,
): Promise<number> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return 0;
    throw error;
  }
  let removed = 0;
  for (const entry of entries) {
    if (entry.isSymbolicLink())
      throw new Error("Evidence cleanup refuses symbolic links");
    const filename = path.resolve(directory, entry.name);
    if (path.dirname(filename) !== path.resolve(directory))
      throw new Error("Evidence cleanup path escaped storage");
    if (entry.isDirectory()) removed += await removeShortLivedFiles(filename);
    else if (entry.isFile()) {
      const handle = await open(filename, "r");
      const header = Buffer.alloc(4);
      try {
        await handle.read(header, 0, 4, 0);
      } finally {
        await handle.close();
      }
      if (isShortLivedEvidence(entry.name, header)) {
        await unlink(filename);
        removed++;
      }
    }
  }
  return removed;
}
