import { test as base, expect, chromium, type BrowserContext } from "@playwright/test";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { trustedOrigin } from "../../../api/src/middleware/trustedOrigin";
import { DEVELOPMENT_EXTENSION_ORIGIN } from "../../../../config/extension-identity";

// A real loopback HTTP API and real browser cookies; no Neon or email calls.
const test = base.extend<{ api: { origin: string; bundle: string }; context: BrowserContext; extensionId: string; blockThirdPartyCookies: boolean }>({
  blockThirdPartyCookies: [false, { option: true }],
  api: async ({}, use, testInfo) => {
    const app = new Hono();
    app.use("*", trustedOrigin([DEVELOPMENT_EXTENSION_ORIGIN]));
    let active = false;
    app.post("/auth/login", c => {
      active = true;
      setCookie(c, "session", "fixture-session", { httpOnly: true, sameSite: "lax", path: "/" });
      return c.json({ message: "Login successful" });
    });
    app.get("/user/me", c => {
      if (!active || getCookie(c, "session") !== "fixture-session") return c.json({ error: "Invalid session" }, 401);
      return c.json({ id: "00000000-0000-4000-8000-000000000001", email: "test@example.com", name: "Test", emailVerified: true, sessionExpiresAt: new Date(Date.now() + 3600000).toISOString() });
    });
    app.post("/auth/logout", c => {
      active = false;
      deleteCookie(c, "session", { path: "/" });
      return c.json({ message: "Logged out" });
    });
    const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 });
    if (!server.listening) await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address unavailable.");
    const origin = `http://127.0.0.1:${address.port}`;
    const bundle = testInfo.outputPath("cookie-extension");
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../../../../node_modules/vite/bin/vite.js", import.meta.url)), "build", "--mode", "development", "--outDir", bundle], {
      cwd: fileURLToPath(new URL("../..", import.meta.url)),
      env: { ...process.env, VITE_API_ORIGIN: origin }, encoding: "utf8",
    });
    if (result.status !== 0) throw new Error(`Cookie-test build failed: ${result.stderr}`);
    try { await use({ origin, bundle }); } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  },
  context: async ({ api, blockThirdPartyCookies }, use, testInfo) => {
    const profile = testInfo.outputPath("browser-profile");
    await mkdir(join(profile, "Default"), { recursive: true });
    await writeFile(join(profile, "Default", "Preferences"), JSON.stringify({ profile: {
      block_third_party_cookies: blockThirdPartyCookies,
      cookie_controls_mode: blockThirdPartyCookies ? 1 : 0,
    } }));
    const context = await chromium.launchPersistentContext(profile, { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${api.bundle}`, `--load-extension=${api.bundle}`],
    });
    try { await use(context); } finally { await context.close(); }
  },
  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    await use(new URL(worker.url()).hostname);
  },
});

test("real HttpOnly cookies authorize requests and are cleared by logout", async ({ api, context, page, extensionId }) => {
  expect(`chrome-extension://${extensionId}`).toBe(DEVELOPMENT_EXTENSION_ORIGIN);
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByLabel("Email", { exact: true }).fill("test@example.com");
  await page.getByLabel("Account password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your vault is locked" })).toBeVisible();
  const session = (await context.cookies(api.origin)).find(cookie => cookie.name === "session");
  expect(session).toMatchObject({ httpOnly: true, sameSite: "Lax" });
  expect(await page.evaluate(() => document.cookie)).not.toContain("fixture-session");
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(reopened.getByRole("heading", { name: "Your vault is locked" })).toBeVisible();
  // Stop the worker through DevTools, without adding keepalive logic to the extension.
  const cdp = await context.newCDPSession(reopened);
  type WorkerVersion = { versionId: string; scriptURL: string; runningStatus: string };
  const versions = new Map<string, WorkerVersion>();
  cdp.on("ServiceWorker.workerVersionUpdated", ({ versions: updates }: { versions: WorkerVersion[] }) => {
    for (const version of updates) versions.set(version.versionId, version);
  });
  await cdp.send("ServiceWorker.enable");
  const running = () => [...versions.values()].find(version => version.scriptURL.startsWith(`chrome-extension://${extensionId}/`) && version.runningStatus === "running");
  await expect.poll(() => running()?.versionId).toBeTruthy();
  const versionId = running()!.versionId;
  await cdp.send("ServiceWorker.stopWorker", { versionId });
  await expect.poll(() => versions.get(versionId)?.runningStatus).toBe("stopped");
  await reopened.reload();
  await expect(reopened.getByRole("heading", { name: "Your vault is locked" })).toBeVisible();
  await expect.poll(() => versions.get(versionId)?.runningStatus).toBe("running");
  await cdp.detach();
  await reopened.getByRole("button", { name: "Sign out" }).click();
  await expect(reopened.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  expect((await context.cookies(api.origin)).some(cookie => cookie.name === "session")).toBe(false);
});

test.describe("browser privacy settings", () => {
  test.use({ blockThirdPartyCookies: true });
  test("extension host permission supports cookies with third-party blocking enabled", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.getByLabel("Email", { exact: true }).fill("test@example.com");
    await page.getByLabel("Account password", { exact: true }).fill("fixture-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your vault is locked" })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
});
