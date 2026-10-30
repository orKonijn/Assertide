import { command, npm } from './commands.mjs';
const children = [
  command(process.execPath, ['scripts/dev-api.mjs']),
  npm([
    '--prefix',
    'apps/web',
    'start',
    '--',
    '--host',
    '127.0.0.1',
    '--proxy-config',
    'proxy.conf.json',
  ]),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (!child.pid || child.exitCode !== null) continue;
    if (process.platform === 'win32') command('taskkill', ['/PID', String(child.pid), '/T', '/F']);
    else child.kill('SIGTERM');
  }
}
for (const child of children) {
  child.once('error', () => stop(1));
  child.once('exit', (code) => stop(code ?? 1));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
console.log(
  'Assertide: http://127.0.0.1:4200 · accounts admin/operator/viewer · generated password in .local/credentials.json',
);
