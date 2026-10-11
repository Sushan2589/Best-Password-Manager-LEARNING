import { test as base, expect, chromium, type BrowserContext } from "@playwright/test";
import { fileURLToPath } from "node:url";

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  context: async ({}, use) => {
    const extensionPath = fileURLToPath(new URL("../../dist", import.meta.url));
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    try { await use(context); } finally { await context.close(); }
  },
  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    await use(new URL(worker.url()).hostname);
  },
});
export { expect };
