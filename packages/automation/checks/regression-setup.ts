import { readFile } from 'node:fs/promises';

export default async function setup(): Promise<void> {
  const credentials = JSON.parse(
    await readFile(new URL('../../../.local/credentials.json', import.meta.url), 'utf8'),
  ) as { password: string; signingKey: string };
  process.env['LAB_PASSWORD'] ??= credentials.password;
  process.env['LAB_SIGNING_KEY'] ??= credentials.signingKey;
}
