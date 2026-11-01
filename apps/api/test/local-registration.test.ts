import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { consumeLocalVerification, initializeLocalRegistration } from '../src/local-identity.ts';
import { testDatabase } from './database.ts';

await test('local provider verification expires, rejects reuse and consumes atomically', async () => {
  const db = await testDatabase();
  try {
    await initializeLocalRegistration(db);
    await db.query(
      "INSERT INTO local_fixture_accounts(subject,email,name) VALUES('fixture-subject','fixture@example.test','Fixture')",
    );
    const token = 'synthetic-verification-token';
    const digest = createHash('sha256').update(token).digest('hex');
    await db.query(
      "INSERT INTO local_fixture_mail(digest,subject,expires_at) VALUES($1,'fixture-subject',now()-interval '1 second')",
      [digest],
    );
    assert.equal(await consumeLocalVerification(db, token), false);
    assert.equal(
      (await db.query('SELECT verified FROM local_fixture_accounts')).rows[0]?.['verified'],
      false,
    );
    await db.query("UPDATE local_fixture_mail SET expires_at=now()+interval '10 minutes'");
    assert.deepEqual(
      (
        await Promise.all([
          consumeLocalVerification(db, token),
          consumeLocalVerification(db, token),
        ])
      ).sort(),
      [false, true],
    );
    assert.equal(await consumeLocalVerification(db, token), false);
    assert.equal(
      (await db.query('SELECT verified FROM local_fixture_accounts')).rows[0]?.['verified'],
      true,
    );
  } finally {
    await db.close();
  }
});
