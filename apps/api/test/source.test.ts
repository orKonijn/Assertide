import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  readdir,
  readFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { catalogRevision, prepareSource, verifySource } from "../src/source.ts";

test("independent API and execution storage prepare current sources and retain historical revisions", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "assertide-source-"));
  const api = path.join(root, "api");
  const worker = path.join(root, "worker");
  try {
    await prepareSource(api);
    await assert.rejects(verifySource(catalogRevision, worker), /ENOENT/);
    await Promise.all([prepareSource(worker), prepareSource(worker)]);
    assert.deepEqual(await readdir(worker), [catalogRevision]);
    assert.equal(
      await verifySource(catalogRevision, worker),
      path.join(worker, catalogRevision),
    );
    const helper = path.join(worker, catalogRevision, "ui/pages/store.page.ts");
    const original = await readFile(helper);
    await writeFile(helper, "tampered Page Object");
    await assert.rejects(verifySource(catalogRevision, worker), /integrity/);
    await writeFile(helper, original);
    await verifySource(catalogRevision, worker);
    const body = "historical approved source";
    const manifest = [
      {
        file: "test.ts",
        sha256: createHash("sha256").update(body).digest("hex"),
      },
    ];
    const revision = createHash("sha256")
      .update(JSON.stringify(manifest))
      .digest("hex");
    await mkdir(path.join(worker, revision));
    await writeFile(path.join(worker, revision, "test.ts"), body);
    await writeFile(
      path.join(worker, revision, "manifest.json"),
      JSON.stringify(manifest),
    );
    await prepareSource(worker);
    assert.equal(
      await verifySource(revision, worker),
      path.join(worker, revision),
    );
    await writeFile(path.join(worker, revision, "test.ts"), "tampered");
    await assert.rejects(verifySource(revision, worker), /integrity/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
