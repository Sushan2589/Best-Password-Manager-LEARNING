/* global chrome */
// Capture real product components with isolated, encrypted sample accounts.
// Never connects to Neon, a real account, or an external mail/icon provider.
import { chromium, expect } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";
import path from "node:path";

const webRoot = fileURLToPath(new URL("..", import.meta.url));
const extensionRoot = fileURLToPath(new URL("../../extension", import.meta.url));
const output = path.join(webRoot, "public", "images", "product");
const bundle = path.resolve(webRoot, ".next", "product-screenshot-extension");
const relativeBundle = path.relative(webRoot, bundle);
if (relativeBundle.startsWith("..") || path.isAbsolute(relativeBundle)) throw new Error("Invalid screenshot build directory");
await mkdir(output, { recursive: true });
const fixture = JSON.parse(await readFile(new URL("../../extension/tests/fixtures/legacy-vault.json", import.meta.url), "utf8"));
const userId = "00000000-0000-4000-8000-000000000001";
const extensionOrigin = "https://github.example";
const profile = { id: userId, name: "Alex Morgan", email: "alex@example.test", emailVerified: true,
  vaultSalt: fixture.salt, vaultKeyVersion: 0, sessionExpiresAt: new Date(Date.now() + 3600000).toISOString() };
const sampleEntries = [
  { title: "GitHub", username: "alex.morgan", website: extensionOrigin, password: "Sample-Only!Cedar72&Fern", notes: "Personal projects" },
  { title: "Work email", email: "alex@studio.example", website: "https://mail.example", password: "Sample-Only!River38@Birch", notes: "For a good day's work" },
  { title: "Figma", username: "alex@example.test", website: "https://figma.example", password: "Sample-Only!Canvas94#Moss", notes: "A little creative space" },
  { title: "Spotify", username: "alex.morgan", website: "https://music.example", password: "Sample-Only!Tempo47&Lake", notes: "The good kind of noise" },
  { title: "Notion", email: "alex@example.test", website: "https://notes.example", password: "Sample-Only!Notes56@Lime", notes: "Ideas worth keeping" },
  { title: "Weekend plans", username: "alex@example.test", website: "https://weekend.example", password: "Sample-Only!Trail83#Pine", notes: "Something to look forward to" },
];
const key = await webcrypto.subtle.importKey("raw", Buffer.from(fixture.keyHex, "hex"), "AES-GCM", false, ["encrypt"]);
const items = await Promise.all(sampleEntries.map(async (entry, index) => {
  const nonce = webcrypto.getRandomValues(new Uint8Array(12));
  const cipher = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, new TextEncoder().encode(JSON.stringify(entry)));
  const timestamp = new Date(Date.now() - index * 3600000).toISOString();
  return { id: `00000000-0000-4000-8000-0000000000${String(index + 10).padStart(2, "0")}`, userId,
    cipherText: Buffer.from(cipher).toString("base64"), nonce: Buffer.from(nonce).toString("base64"), createdAt: timestamp, updatedAt: timestamp };
}));
async function apiRoute(route, records = items) {
  const pathname = new URL(route.request().url()).pathname;
  if (pathname === "/vault") return route.fulfill({ json: records });
  if (pathname === "/user/me") return route.fulfill({ json: profile });
  return route.fulfill({ json: {} });
}

const allocator = createServer();
await new Promise(resolve => allocator.listen(0, "127.0.0.1", resolve));
const port = allocator.address().port;
await new Promise(resolve => allocator.close(resolve));
const webOrigin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [fileURLToPath(new URL("../../../node_modules/next/dist/bin/next", import.meta.url)), "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: webRoot, windowsHide: true, stdio: "ignore" });
let browser;
let extension;
try {
  await expect(async () => expect((await fetch(webOrigin)).status).toBe(200)).toPass({ timeout: 30000 });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1060 }, deviceScaleFactor: 2, colorScheme: "light" });
  await context.route("**/*", route => {
    const origin = new URL(route.request().url()).origin;
    if (origin === webOrigin) return route.continue();
    if (origin === "http://localhost:3001") return apiRoute(route, items.slice(0, 3));
    return route.abort();
  });
  const page = await context.newPage();
  await page.goto(`${webOrigin}/vault`);
  await page.getByLabel("Master password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Unlock Vault", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "GitHub", exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(output, "vault-desktop.png"), animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 780 });
  await page.getByRole("heading", { name: "Your credentials", exact: true }).evaluate(element => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 20));
  await page.screenshot({ path: path.join(output, "vault-mobile.png"), animations: "disabled" });
  await browser.close(); browser = null;

  const built = spawnSync(process.execPath, [fileURLToPath(new URL("../../../node_modules/vite/bin/vite.js", import.meta.url)), "build", "--outDir", bundle], {
    cwd: extensionRoot, env: { ...process.env, VITE_API_ORIGIN: extensionOrigin }, encoding: "utf8", windowsHide: true,
  });
  if (built.status !== 0) throw new Error("Unable to build the isolated extension screenshot fixture");
  extension = await chromium.launchPersistentContext("", { channel: "chromium", headless: true, viewport: { width: 400, height: 600 }, deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${bundle}`, `--load-extension=${bundle}`] });
  await extension.route(`${extensionOrigin}/**`, async route => {
    if (["/vault", "/user/me"].includes(new URL(route.request().url()).pathname)) return apiRoute(route);
    return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Sample sign-in page</title><form><input autocomplete='username'><input type='password' autocomplete='current-password'></form>" });
  });
  const worker = extension.serviceWorkers()[0] ?? await extension.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).hostname;
  const popup = await extension.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByRole("heading", { name: "Your vault is locked", exact: true })).toBeVisible();
  await popup.evaluate(() => chrome.storage.local.set({ autofillSetupDismissed: true, inlineAllSites: false }));
  await popup.reload();
  await popup.getByLabel("Vault password", { exact: true }).fill(fixture.password);
  await popup.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await expect(popup.getByRole("heading", { name: "Your vault is unlocked", exact: true })).toBeVisible();
  const site = await extension.newPage();
  await site.goto(`${extensionOrigin}/login`); await site.bringToFront();
  await expect(popup.getByRole("region", { name: "Current website", exact: true })).toContainText(extensionOrigin);
  await popup.getByRole("button", { name: "All credentials (6)", exact: true }).evaluate(button => button.click());
  await expect(popup.getByRole("list", { name: "Saved credentials", exact: true }).getByRole("listitem")).toHaveCount(6);
  await popup.locator("main").evaluate(element => {
    const list = element.querySelector('ul[aria-label="Saved credentials"]');
    if (list) element.scrollTop += list.getBoundingClientRect().top - element.getBoundingClientRect().top - 50;
  });
  await popup.locator("#root").screenshot({ path: path.join(output, "extension-vault.png"), animations: "disabled" });
  console.log("Captured actual web vault (desktop/mobile) and extension UI with sample accounts.");
} finally {
  await browser?.close();
  await extension?.close();
  server.kill();
}
