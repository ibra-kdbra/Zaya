// The release version must be identical in package.json, lib/js/app.js, sw.js and the asset URLs in the HTML.
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(root + 'package.json', 'utf8')).version;
const app = (readFileSync(root + 'lib/js/app.js', 'utf8').match(/ZAYA_VERSION = '([^']+)'/) || [])[1];
const sw = (readFileSync(root + 'sw.js', 'utf8').match(/const VERSION = '([^']+)'/) || [])[1];
const htmlVersions = ['index.html', 'changelog.html'].flatMap((f) =>
  [...readFileSync(root + f, 'utf8').matchAll(/\?v=([\d.]+)/g)].map((m) => [f, m[1]])
);

const bad = [['lib/js/app.js', app], ['sw.js', sw], ...htmlVersions].filter(([, v]) => v !== pkg);
if (bad.length) {
  console.error(`Version mismatch: package.json is ${pkg} but ` + bad.map(([f, v]) => `${f} has ${v}`).join(', '));
  process.exit(1);
}
console.log(`Version ${pkg} is consistent across package.json, app.js, sw.js and HTML asset URLs`);
