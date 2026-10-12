// Fails if anything private is tracked in this public repository: the Pro plugins and their tools,
// signing keys, encrypted books, environment files, or the business plan. The Pro build lives in a
// private repository and is laid over this one at build time; nothing of it belongs here.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const SELF = 'tools/check-no-private.mjs';

const PATHS = [
  [/^pro\//, 'a Pro plugin'],
  [/^lib\/js\/pro-features\//, 'the Pro entry point'],
  [/^server\/collab\.mjs$/, 'the live-session relay'],
  [/^tools\/(pro-license|pro-auth|narrate|preview|build-pro|vendor-piper)\b/, 'a Pro tool'],
  [/(^|\/)(premium-plan|strategy)\.md$/, 'the business plan'],
  [/\.(pem|key|zenc)$/, 'a key or an encrypted book'],
  [/(^|\/)\.env(\.|$)/, 'an environment file'],
  [/(^|\/)\.zaya-pro\//, 'the licence signing key folder']
];
// Built from pieces so this file does not match itself.
const CONTENT = [
  [new RegExp('-----BEGIN [A-Z ]*' + 'PRIVATE KEY-----'), 'a private key'],
  [new RegExp("id: 'pro" + "-[a-z-]+'"), 'a Pro plugin registration'],
  [new RegExp('check' + 'License\\('), 'the Pro licence check'],
  [new RegExp('\\bZP' + '1\\.[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{40,}'), 'a Pro licence']
];
const TEXT = /\.(m?js|cjs|json|html?|css|md|ya?ml|txt|sh|py|svg)$|(^|\/)[^.]+$/;

const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
const problems = [];
for (const f of files) {
  for (const [re, what] of PATHS) if (re.test(f)) problems.push(`${f}: ${what}`);
  if (f === SELF || f.startsWith('vendor/') || !TEXT.test(f)) continue;
  let text;
  try { text = readFileSync(join(ROOT, f), 'utf8'); } catch (e) { continue; }
  for (const [re, what] of CONTENT) if (re.test(text)) problems.push(`${f}: contains ${what}`);
}

if (problems.length) {
  console.error('Private material is tracked in the public repository:');
  problems.forEach((p) => console.error(`  ${p}`));
  console.error('Remove it (git rm --cached <file>); it belongs in the private Pro repository.');
  process.exit(1);
}
console.log(`no private material in ${files.length} tracked files`);
