// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/* Chromium only, deliberately — this app has known Safari-only behavioral
   quirks (see app.js's suppressNextClick comment) that Playwright's bundled
   WebKit doesn't reproduce, so a WebKit run here would give false confidence
   rather than real coverage. Safari-specific issues still need checking by
   hand in the actual browser. */
module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'python3 -m http.server 4173',
    url: 'http://localhost:4173/index.html',
    reuseExistingServer: true,
    timeout: 10000,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
