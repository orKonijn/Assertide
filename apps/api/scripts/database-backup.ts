import { backupDatabase, restoreDatabase } from '../src/database-backup.ts';
const [action, file] = process.argv.slice(2);
const url = action === 'backup' ? process.env['DATABASE_URL'] : process.env['RESTORE_DATABASE_URL'];
if (!file || !url || !['backup', 'restore'].includes(action ?? '')) {
  throw new Error(
    'Usage: tsx scripts/database-backup.ts backup|restore FILE; set DATABASE_URL or RESTORE_DATABASE_URL privately',
  );
}
const metadata = await (action === 'backup'
  ? backupDatabase(url, file)
  : restoreDatabase(url, file));
console.log(
  JSON.stringify({
    action,
    sha256: metadata.sha256,
    bytes: metadata.bytes,
    createdAt: metadata.createdAt,
  }),
);
