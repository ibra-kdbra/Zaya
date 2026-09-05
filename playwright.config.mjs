import { defineConfig } from '@playwright/test';

// Several worktrees run the suite at once, so the port is configurable.
const PORT = process.env.ZAYA_TEST_PORT || '8080';

export default defineConfig({
  testDir: './tests',
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
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
});
