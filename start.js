import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
const serverDir = new URL('./server', import.meta.url);
const opts = { stdio: 'inherit', cwd: serverDir.pathname };
const res = spawnSync(process.execPath, ['src/main.js'], opts);
process.exitCode = res.status ?? (res.error ? 1 : 0);
