import { readFile } from 'node:fs/promises';

import { z } from 'zod';
export async function localPassword(): Promise<string> {
  return z
    .object({ password: z.string() })
    .parse(
      JSON.parse(
        await readFile(new URL('../../../../.local/credentials.json', import.meta.url), 'utf8'),
      ),
    ).password;
}
