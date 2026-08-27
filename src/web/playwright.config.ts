import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for the driveline-web chat UI. Runs against `next dev` in
 * forced mock mode (`NEXT_PUBLIC_MOCK=1`) so tests are deterministic and
 * never depend on the real deal-finder agent being up locally.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: {
    command: "npm run build && npm run start -- -p 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_MOCK: "1"
    }
  }
});
