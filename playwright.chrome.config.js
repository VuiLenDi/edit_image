import { defineConfig } from '@playwright/test';

const port = Number(process.env.PORT || 5174);

export default defineConfig({
  testDir: './manual-tests',
  timeout: 180_000,
  expect: { timeout: 120_000 },
  use: {
    baseURL: `http://localhost:${port}`,
    browserName: 'chromium',
    channel: 'chrome',
    headless: false,
  },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
