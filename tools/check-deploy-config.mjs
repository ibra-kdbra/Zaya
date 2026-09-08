/**
 * Validate vercel.json before a deploy can reject it.
 *
 * The hosting configuration is the one file the test suite never exercises: `npm test` serves the
 * site itself and never reads it, so a mistake here passes every check and fails only once the
 * deployment runs — which is a slow, confusing way to find out, because the preview URL keeps
 * serving the last build that worked and looks merely stale. That is exactly how a stray
 * `_comment` key, added for the benefit of a human reader, took a deployment down: the schema
 * allows no properties it does not know.
 *
 * This checks the shape rather than the meaning: the keys are ones the schema accepts, the header
 * rules are well formed, and nothing under `/lib/` or `/engine-next/` is pinned in a browser for
 * longer than the release that names it (see docs/ARCHITECTURE.md).
 */
import { readFileSync } from 'node:fs';

const TOP_LEVEL = new Set([
  '$schema', 'framework', 'installCommand', 'buildCommand', 'outputDirectory', 'devCommand',
  'cleanUrls', 'trailingSlash', 'headers', 'redirects', 'rewrites', 'regions', 'public',
  'ignoreCommand', 'git', 'crons', 'functions', 'images', 'redirects',
]);
const RULE_KEYS = new Set(['source', 'headers', 'has', 'missing']);
const HEADER_KEYS = new Set(['key', 'value']);

const problems = [];
let config;
try {
  config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
} catch (err) {
  console.error(`vercel.json is not valid JSON: ${err.message}`);
  process.exit(1);
}

for (const key of Object.keys(config)) {
  if (!TOP_LEVEL.has(key)) problems.push(`unknown top-level key "${key}"`);
}

for (const [i, rule] of (config.headers || []).entries()) {
  for (const key of Object.keys(rule)) {
    if (!RULE_KEYS.has(key)) {
      problems.push(`headers[${i}] has "${key}", which the schema does not allow (it takes ${[...RULE_KEYS].join(', ')})`);
    }
  }
  if (typeof rule.source !== 'string') problems.push(`headers[${i}] needs a string "source"`);
  if (!Array.isArray(rule.headers)) problems.push(`headers[${i}] needs a "headers" array`);
  for (const [j, header] of (rule.headers || []).entries()) {
    for (const key of Object.keys(header)) {
      if (!HEADER_KEYS.has(key)) problems.push(`headers[${i}].headers[${j}] has "${key}"`);
    }
    if (typeof header.key !== 'string' || typeof header.value !== 'string') {
      problems.push(`headers[${i}].headers[${j}] needs string "key" and "value"`);
    }
    /*
     * First-party code is addressed by a URL carrying the release, not the build, so two deploys
     * of one release serve different bytes at the same address. Pinning it means a fix cannot
     * reach a reader who has already visited.
     */
    if (header.key.toLowerCase() === 'cache-control' && /immutable|max-age=[1-9]/i.test(header.value)) {
      if (/^\/(lib|engine-next)\//.test(rule.source)) {
        problems.push(`headers[${i}] pins ${rule.source} (${header.value}); first-party code must revalidate`);
      }
    }
  }
}

if (problems.length) {
  console.error('vercel.json:');
  problems.forEach((p) => console.error(`  - ${p}`));
  process.exit(1);
}
console.log(`vercel.json is well formed; ${(config.headers || []).length} header rules, first-party code revalidates`);
