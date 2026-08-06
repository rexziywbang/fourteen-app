import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 8_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "env DATA_BACKEND=sqlite LOCAL_DB_PATH=.data/playwright.sqlite OTP_PEPPER=playwright-local-pepper SEED_DEMO_USERS=true NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100 pnpm dev --hostname 127.0.0.1 --port 3100 2>&1 | tee -a .data/playwright-server.log",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
