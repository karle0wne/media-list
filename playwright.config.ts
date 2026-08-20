import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/ui",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: 0,
  workers: 1,
  reporter: [["line"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run start -- -H 127.0.0.1 -p 3000",
    url: "http://127.0.0.1:3000/api/health",
    timeout: 30_000,
    reuseExistingServer: false,
  },
});
