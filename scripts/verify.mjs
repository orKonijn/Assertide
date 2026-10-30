import { command, completed, npm, root } from "./commands.mjs";
await completed(
  command(process.execPath, ["--test", "packages/domain/execution.test.ts"]),
);
for (const [directory, args] of [
  ["packages/automation", ["run", "typecheck"]],
  ["apps/api", ["run", "typecheck"]],
  ["apps/api", ["test"]],
  ["apps/web", ["test", "--", "--watch=false"]],
  ["apps/web", ["run", "build"]],
])
  await completed(npm(args, `${root}/${directory}`));
console.log(
  "Local verification passed. Linux infrastructure and browser acceptance run in the PR checks.",
);
