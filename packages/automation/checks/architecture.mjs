import ts from 'typescript';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const files = [
  ...(await readdir(path.join(root, 'platform')))
    .filter((name) => name.endsWith('.spec.ts'))
    .map((name) => `platform/${name}`),
  'tests/store.spec.ts',
  'practice/web.spec.ts',
];
const violations = [];
for (const file of files) {
  const text = await readFile(path.join(root, file), 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (
        /^(getByRole|getByLabel|getByText|getByTestId|locator|waitForTimeout|waitForSelector)$/.test(
          method,
        )
      )
        violations.push(`${file}: ${method} belongs in a Page Object, or is an unsafe wait`);
      if (method === 'goto' && node.expression.expression.getText(source) === 'page')
        violations.push(`${file}: raw page navigation`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.match(text, /test.describe\(/, `${file} needs a domain group`);
  assert.match(text, /test.beforeEach\(/, `${file} needs isolated setup`);
}
assert.deepEqual(violations, []);
console.log(
  `Verified Page Object boundaries and condition-based waits in ${files.length} UI specification files.`,
);
