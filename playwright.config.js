import { defineConfig } from '@playwright/test';

const port = Number(process.env.PORT || 5174);

export default defineConfig({
  testDir: './tests',
  use: { baseURL: `http://localhost:${port}`, headless: true },
  webServer: { command: `npm run dev -- --port ${port} --strictPort`, url: `http://localhost:${port}`, reuseExistingServer: !process.env.CI },
});