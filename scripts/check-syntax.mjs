// Syntax-checks every first-party script without a bundler.
// Files loaded with type="module" (see lib/js/app.js) are parsed as ESM, the rest as classic scripts.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const SKIP = [/\/libs\//, /\.min\.js$/, /\.bak$/, /node_modules/, /changelog\.bundle\.js$/, /\/cmaps\//];
const MODULE_DIRS = [/lib\/js\/core\/dflip\//, /lib\/js\/features\/themes\//, /lib\/js\/features\/quotes\//,
  /lib\/js\/features\/changelog\//, /lib\/js\/features\/search\//, /lib\/js\/pro-features\//, /scripts\//, /tests\//];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (SKIP.some(r => r.test(p))) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(m?js)$/.test(name)) out.push(p);
  }
  return out;
}

let failed = 0;
const files = [...walk(join(ROOT, 'lib/js')), ...walk(join(ROOT, 'scripts')), ...walk(join(ROOT, 'tests')), join(ROOT, 'sw.js')];
for (const file of files) {
  const rel = relative(ROOT, file);
  const isModule = file.endsWith('.mjs') || MODULE_DIRS.some(r => r.test(rel));
  const res = spawnSync(process.execPath, ['--input-type=' + (isModule ? 'module' : 'commonjs'), '--check'], {
    input: readFileSync(file), encoding: 'utf8'
  });
  if (res.status !== 0) {
    failed++;
    console.error(`✗ ${rel}\n${res.stderr}`);
  }
}
console.log(`${files.length} files checked, ${failed} failed`);
process.exit(failed ? 1 : 0);
