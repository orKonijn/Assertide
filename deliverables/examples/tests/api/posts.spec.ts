import { test, expect } from '@playwright/test';
import * as allure from 'allure-js-commons';
import Ajv from 'ajv';
import schema from '../../schemas/post.schema.json';

const validate = new Ajv({ allErrors: true, strict: true }).compile(schema);
test('API-001 Read post contract', { tag: ['@api', '@smoke'] }, async ({ request }) => {
  await allure.allureId('API-001');
  await allure.testCaseId('API-001');
  await allure.feature('Posts');
  await allure.owner('QA Platform');
  await allure.severity('critical');
  const started = performance.now();
  const response = await request.get('/posts/1', { timeout: 10_000, maxRedirects: 0 });
  const durationMs = performance.now() - started;
  // The public fixture has no private data. Production evidence uses allowlisted/redacted fields.
  const text = await response.text();
  await allure.attachment('Exchange', JSON.stringify({ method: 'GET', path: '/posts/1', status: response.status(), durationMs, body: text.slice(0, 65_536) }, null, 2), 'application/json');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
  const body: unknown = JSON.parse(text);
  const valid = validate(body);
  if (!valid) await allure.attachment('Schema errors', JSON.stringify(validate.errors), 'application/json');
  expect(valid, JSON.stringify(validate.errors)).toBe(true);
  expect(body).toMatchObject({ id: 1 });
  // Diagnostic ceiling, not a claim about the provider's latency SLA.
  expect(durationMs).toBeLessThan(10_000);
});

test('API-003 Simulated creation', { tag: ['@api', '@smoke'] }, async ({ request }) => {
  await allure.allureId('API-003');
  await allure.testCaseId('API-003');
  await allure.feature('Posts');
  const input = { userId: 1, title: 'Assertide', body: 'fixture' };
  const response = await request.post('/posts', { data: input, timeout: 10_000, maxRedirects: 0 });
  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body).toMatchObject(input);
  expect(Number.isInteger(body.id)).toBe(true);
  // No GET-after-POST persistence assertion: JSONPlaceholder writes are simulated.
});
