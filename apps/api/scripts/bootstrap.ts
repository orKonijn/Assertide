import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

import { connectDatabase, type SqlConnection } from '../src/database.ts';
import { IdentityService } from '../src/identity.ts';
import { PlatformService } from '../src/platform.ts';

const bootstrapInput = z
  .object({
    organizationId: z.uuid(),
    projectId: z.uuid(),
    projectName: z.string().min(1).max(120),
    subject: z.string().min(1).max(512),
    name: z.string().min(1).max(120),
  })
  .strict();

// Explicit offline administration. Never creates development users or passwords.
export async function bootstrap(db: SqlConnection, value: unknown, origin: string): Promise<void> {
  const input = bootstrapInput.parse(value);
  const identity = new IdentityService(db, origin);
  const platform = new PlatformService(db);
  await identity.initialize();
  await platform.initialize();
  await db.transaction(async (connection) => {
    await connection.query(
      "INSERT INTO platform_documents(id,organization_id,project_id,kind,body) VALUES($1::text,$2,$1::uuid,'project',$3)",
      [
        input.projectId,
        input.organizationId,
        JSON.stringify({
          id: input.projectId,
          name: input.projectName,
          description: '',
          owner: input.name,
          catalogRevision: platform.revision,
        }),
      ],
    );
    await connection.query('INSERT INTO memberships(subject,body) VALUES($1,$2)', [
      input.subject,
      JSON.stringify({
        subject: input.subject,
        name: input.name,
        organizationId: input.organizationId,
        role: 'administrator',
        projectIds: [input.projectId],
      }),
    ]);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env['DATABASE_URL'] || !process.env['APP_ORIGIN']) {
    throw new Error('Production database and origin required');
  }
  const input: unknown = JSON.parse(await readFile(process.argv[2] ?? '', 'utf8'));
  const db = await connectDatabase(process.env['DATABASE_URL']);
  try {
    await bootstrap(db, input, process.env['APP_ORIGIN']);
    console.log('Project and initial administrator provisioned');
  } finally {
    await db.close();
  }
}
