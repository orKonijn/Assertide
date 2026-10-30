import {
  access,
  mkdir,
  readFile,
  stat,
  readdir,
  writeFile,
  rename,
} from "node:fs/promises";
import { createInterface } from "node:readline";
import { setTimeout } from "node:timers/promises";
import { once } from "node:events";
import path from "node:path";

process.once("SIGTERM", () => process.exit(143));

const safe = (name) =>
  typeof name === "string" &&
  /^[a-zA-Z0-9_./ -]+$/.test(name) &&
  !name.split("/").some((p) => !p || p === "." || p === "..") &&
  !path.isAbsolute(name);
const mode = process.argv[2];
if (mode === "wait") {
  while (
    !(await access("/input/done").then(
      () => true,
      () => false,
    ))
  )
    await setTimeout(200);
} else if (mode === "import") {
  let bytes = 0;
  let spec;
  for await (const line of createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  })) {
    bytes += line.length;
    if (bytes > 64 * 1024 * 1024) throw new Error("Source exceeds policy");
    const item = JSON.parse(line);
    if (item.spec) {
      if (spec) throw new Error("Duplicate input");
      spec = item.spec;
      continue;
    }
    if (!safe(item.name)) throw new Error("Invalid source path");
    const target = path.join("/source", item.name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(item.data, "base64"), { flag: "wx" });
  }
  if (!spec || JSON.stringify(spec).length > 65536)
    throw new Error("Invalid worker input");
  await writeFile("/input/spec.json", JSON.stringify(spec), { mode: 0o600 });
  await writeFile("/input/staged", "");
  await rename("/input/staged", "/input/ready");
} else if (mode === "export") {
  let total = 0;
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new Error("Output symlinks are prohibited");
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.isFile()) throw new Error("Invalid output file");
      const name = path.relative("/output", full).split(path.sep).join("/");
      if (!safe(name)) throw new Error("Invalid output path");
      const size = (await stat(full)).size;
      total += size;
      if (size > 64 * 1024 * 1024 || total > 512 * 1024 * 1024)
        throw new Error("Output exceeds transfer policy");
      const data = await readFile(full);
      if (
        !process.stdout.write(
          JSON.stringify({ name, data: data.toString("base64") }) + "\n",
        )
      )
        await once(process.stdout, "drain");
    }
  }
  await walk("/output");
} else if (mode === "done") {
  await writeFile("/input/done", "");
} else throw new Error("Unknown transfer operation");
