import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

// The site is served from the repository root; this config lives one level down in tools/.
const ROOT = fileURLToPath(new URL('..', import.meta.url));

const PORT = process.env.ZAYA_TEST_PORT || 8080;

export default defineConfig({
  testDir: fileURLToPath(new URL('../tests', import.meta.url)),
  testMatch: /.*\.spec\.mjs/,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
    // Allow reusing a preinstalled Chromium (CI installs its own via `npx playwright install chromium`)
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  },
  webServer: {
    command: `npx http-server -p ${PORT} -c-1 -s .`,
    cwd: ROOT,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
});
