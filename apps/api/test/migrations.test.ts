import assert from 'node:assert/strict';
import { test } from 'node:test';

import { IdentityService } from '../src/identity.ts';
import { migrate } from '../src/migrations.ts';
import { testDatabase } from './database.ts';
await test('migrations serialize, preserve pre-ledger data, reject edits and roll back failures', async () => {
  const db = await testDatabase();
  try {
    await db.query('CREATE TABLE memberships (subject text PRIMARY KEY, body jsonb NOT NULL)');
    await db.query("INSERT INTO memberships VALUES('existing','{}')");
    const identity = new IdentityService(db, 'http://127.0.0.1');
    await identity.initialize();
    assert.equal(
      (await db.query("SELECT subject FROM memberships WHERE subject='existing'")).rows.length,
      1,
    );
    assert.equal(
      (await db.query("SELECT version FROM memberships WHERE subject='existing'")).rows[0]?.[
        'version'
      ],
      1,
    );
    const statements = [
      'CREATE TABLE migration_fixture (id integer PRIMARY KEY)',
      'INSERT INTO migration_fixture VALUES(1)',
    ];
    await Promise.all([
      migrate(db, 'concurrent-test', statements),
      migrate(db, 'concurrent-test', statements),
    ]);
    assert.equal((await db.query('SELECT * FROM migration_fixture')).rows.length, 1);
    await assert.rejects(migrate(db, 'concurrent-test', ['SELECT 1']), /has changed/);
    await assert.rejects(
      migrate(db, 'failed-test', [
        'CREATE TABLE rollback_fixture (id integer)',
        'SELECT * FROM missing_migration_table',
      ]),
    );
    assert.equal(
      (await db.query("SELECT id FROM schema_migrations WHERE id='failed-test'")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("SELECT to_regclass('rollback_fixture') AS name")).rows[0]?.['name'],
      null,
    );
    await migrate(db, 'failed-test', ['CREATE TABLE rollback_fixture (id integer)']);
    await identity.initialize();
  } finally {
    await db.close();
  }
});
