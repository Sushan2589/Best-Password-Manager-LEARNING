import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/browser",
  timeout: 30000,
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: { screenshot: "only-on-failure" },
});
