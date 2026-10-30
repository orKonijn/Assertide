import assert from 'node:assert/strict';
import { test } from 'node:test';

import pg from 'pg';

import { connectDatabase } from '../src/database.ts';

await test(
  'an idle PostgreSQL disconnect does not crash the service and the pool reconnects',
  {
    skip: !process.env['TEST_DATABASE_URL'],
  },
  async () => {
    const url = process.env['TEST_DATABASE_URL']!;
    const db = await connectDatabase(url);
    const admin = new pg.Pool({ connectionString: url });
    try {
      const pid = (await db.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
      await admin.query('SELECT pg_terminate_backend($1)', [pid]);
      // Wait until PostgreSQL reports the owned connection gone, then allow the
      // socket close event to reach the pool before requesting a replacement.
      for (let attempt = 0; attempt < 100; attempt++) {
        const result = await admin.query('SELECT pid FROM pg_stat_activity WHERE pid=$1', [pid]);
        if (!result.rows.length) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
      const replacement = (await db.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))
        .rows[0]!.pid;
      assert.notEqual(replacement, pid);
    } finally {
      await db.close();
      await admin.end();
    }
  },
);
