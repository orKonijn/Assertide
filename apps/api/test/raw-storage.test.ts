import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  access,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { archiveRaw, restoreRaw } from "../src/raw-storage.ts";
import { objectStore } from "../src/object-store.ts";
test(
  "raw evidence restores on another worker with integrity and retention boundaries",
  { skip: !objectStore },
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), "assertide-raw-"));
    if (
      path.dirname(root) !== path.resolve(tmpdir()) ||
      !path.basename(root).startsWith("assertide-raw-")
    )
      throw new Error("Unsafe cleanup");
    const id = randomUUID();
    try {
      const source = path.join(root, "source");
      await mkdir(source);
      await writeFile(path.join(source, "result.json"), '{"status":"passed"}');
      await writeFile(
        path.join(source, "trace.bin"),
        Buffer.from("504b03040000", "hex"),
      );
      const manifest = (await archiveRaw(id, source))!;
      const restored = path.join(root, "restored");
      const endedAt = new Date().toISOString();
      await restoreRaw(id, restored, manifest, endedAt);
      assert.equal(
        await readFile(path.join(restored, "result.json"), "utf8"),
        '{"status":"passed"}',
      );
      assert.equal(
        (await readFile(path.join(restored, "trace.bin"))).length,
        6,
      );
      await assert.rejects(
        restoreRaw(randomUUID(), path.join(root, "foreign"), manifest, endedAt),
        /another run/,
      );
      const corrupt = structuredClone(manifest);
      corrupt.files[0]!.object.sha256 = "0".repeat(64);
      await assert.rejects(
        restoreRaw(id, path.join(root, "corrupt"), corrupt, endedAt),
        /integrity/,
      );
      const traversal = structuredClone(manifest);
      traversal.files[0]!.name = "../escape";
      await assert.rejects(
        restoreRaw(id, path.join(root, "traversal"), traversal, endedAt),
        /Invalid raw/,
      );
      await objectStore!.deleteVersions(`runs/${id}/raw/short/`);
      const later = path.join(root, "later");
      await restoreRaw(
        id,
        later,
        manifest,
        endedAt,
        new Date(Date.now() + 15 * 86400000),
      );
      await access(path.join(later, "result.json"));
      await assert.rejects(access(path.join(later, "trace.bin")));
      await assert.rejects(
        restoreRaw(
          id,
          later,
          manifest,
          endedAt,
          new Date(Date.now() + 31 * 86400000),
        ),
        /expired/,
      );
    } finally {
      await objectStore!.deleteVersions(`runs/${id}/`);
      await rm(root, { recursive: true, force: true });
    }
  },
);
