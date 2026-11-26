import { defineConfig } from "@playwright/test";

// `next start` runs in production mode, which requires the gateway secret; the UI proof plays
// the gateway, so it sends the same value it gives the server.
const gatewaySecret =
  process.env.GATEWAY_SHARED_SECRET || "playwright-gateway-secret-0123456789abcdef";

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
    extraHTTPHeaders: {
      "X-Auth-Subject": "central-auth:media-list:admin_ui",
      "X-Auth-Email": "admin-ui@example.com",
      "X-Auth-Name": "admin_ui",
      "X-Gateway-Secret": gatewaySecret,
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run start -- -H 127.0.0.1 -p 3000",
    url: "http://127.0.0.1:3000/api/health",
    timeout: 30_000,
    reuseExistingServer: false,
    env: { GATEWAY_SHARED_SECRET: gatewaySecret },
  },
});
