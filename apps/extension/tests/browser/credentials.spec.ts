import { webcrypto } from "node:crypto";
import { createServer } from "node:http";
import { test as base, expect } from "./fixtures";
import fixture from "../fixtures/legacy-vault.json" with { type: "json" };

const test = base.extend<{ site: { url: string; requests: string[] } }>({
  site: async ({}, use) => {
    const requests: string[] = [];
    const server = createServer((request, response) => {
      requests.push(request.url ?? "");
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("<html><body>Website fixture</body></html>");
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Website fixture unavailable.");
    try { await use({ url: `http://127.0.0.1:${address.port}/login`, requests }); }
    finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  },
});

const profile = { id: "00000000-0000-4000-8000-000000000001", email: "fixture@example.com", name: "Fixture",
  emailVerified: true, sessionExpiresAt: new Date(Date.now() + 3600000).toISOString(), vaultSalt: fixture.salt };
const entries = [
  { title: "Example", username: "alice", email: "alice@example.com", password: "alice-public-fixture-password", website: "https://example.com/login", notes: "<img src=x onerror=window.phase4Xss=true>" },
  { title: "Example", email: "bob@example.com", password: "bob-public-fixture-password", website: "https://example.com/login" },
  { title: "Local account", username: "local-user", password: "local-public-fixture-password" },
  { title: "Unsafe URL", username: "unsafe-user", password: "unsafe-public-fixture-password", website: "javascript:alert(1)" },
];

test.beforeEach(async ({ context, site }) => {
  const key = await webcrypto.subtle.importKey("raw", Buffer.from(fixture.keyHex, "hex"), "AES-GCM", false, ["encrypt"]);
  const items = await Promise.all(entries.map(async (entry, index) => {
    const nonce = webcrypto.getRandomValues(new Uint8Array(12));
    const value = entry.title === "Example" ? { ...entry, website: site.url } : entry;
    const ciphertext = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, new TextEncoder().encode(JSON.stringify(value)));
    return { id: `00000000-0000-4000-8000-00000000000${index + 2}`, userId: profile.id,
      cipherText: Buffer.from(ciphertext).toString("base64"), nonce: Buffer.from(nonce).toString("base64"),
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
  }));
  await context.route("http://localhost:3001/**", route => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify(route.request().url().endsWith("/vault") ? items : profile) }));
});

test("search finds multiple accounts and details reveal only on explicit action", async ({ page, extensionId }, testInfo) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByLabel("Vault password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await expect(page.getByRole("list", { name: "Saved credentials" }).getByRole("listitem")).toHaveCount(4);
  await page.locator("#root").screenshot({ path: testInfo.outputPath("popup-credentials.png") });
  await page.getByLabel("Search credentials").fill(" example.com ");
  await expect(page.getByRole("listitem")).toHaveCount(2);
  await page.getByLabel("Search credentials").fill("BOB@");
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await page.getByRole("button", { name: "View Example, bob@example.com", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copy username", exact: true })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(entries[1]!.password);
  await page.getByRole("button", { name: "Show password", exact: true }).click();
  await expect(page.locator('[aria-label="Saved password"]')).toHaveText(entries[1]!.password);
  await page.getByRole("button", { name: "Back to credentials", exact: true }).click();
  await page.getByRole("button", { name: "View Example, bob@example.com", exact: true }).click();
  await expect(page.locator("body")).not.toContainText(entries[1]!.password);
  await page.getByRole("button", { name: "Back to credentials", exact: true }).click();
  await page.getByLabel("Search credentials").fill("missing-site");
  await expect(page.getByRole("heading", { name: "No matching credentials" })).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(page.getByRole("listitem")).toHaveCount(4);
});

test("real clipboard writes work on clicks without additional extension permissions", async ({ context, page, extensionId }, testInfo) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByLabel("Vault password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await page.getByRole("button", { name: "View Example, alice", exact: true }).click();
  await expect(page.locator("img")).toHaveCount(0);
  expect(await page.evaluate(() => "phase4Xss" in window)).toBe(false);
  await page.locator("#root").screenshot({ path: testInfo.outputPath("popup-credential-details.png") });
  // Read permission belongs only to a separate TEST origin, never the extension.
  // The write must succeed before that permission is even granted.
  for (const [field, expected] of [["username", entries[0]!.username], ["email", entries[0]!.email], ["password", entries[0]!.password]]) {
    await page.bringToFront();
    // Changing the active tab discards the prior site's detail view.
    if (await page.getByRole("button", { name: "Back to credentials", exact: true }).count() === 0)
      await page.getByRole("button", { name: "View Example, alice", exact: true }).click();
    await page.getByRole("button", { name: `Copy ${field}`, exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "copied." })).toBeVisible();
    await context.grantPermissions(["clipboard-read"], { origin: "https://clipboard-fixture.example" });
    const reader = await context.newPage();
    await reader.route("https://clipboard-fixture.example/**", route => route.fulfill({ body: "<html><body>Clipboard test reader</body></html>", contentType: "text/html" }));
    await reader.goto("https://clipboard-fixture.example"); await reader.bringToFront();
    // Return only a comparison result, so an unexpected clipboard value is not
    // included in test diagnostics.
    expect(await reader.evaluate(async expected => (await navigator.clipboard.readText()) === expected, expected)).toBe(true);
    await reader.close();
  }
  await page.bringToFront();
  await expect(page.locator("body")).not.toContainText(entries[0]!.password);
  expect(await page.evaluate(() => chrome.runtime.getManifest().permissions ?? [])).toEqual(["activeTab"]);
});

test("unsafe websites are disabled and optional fields remain usable", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByLabel("Vault password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await page.getByRole("button", { name: "View Unsafe URL, unsafe-user", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open website", exact: true })).toHaveCount(0);
  await expect(page.locator("body")).toContainText("cannot be opened safely");
  await page.getByRole("button", { name: "Back to credentials", exact: true }).click();
  await page.getByRole("button", { name: "View Local account, local-user", exact: true }).click();
  await expect(page.locator("body")).toContainText("No website saved");
  await expect(page.getByRole("button", { name: "Copy username", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Copy email", exact: true })).toHaveCount(0);
});

test("opening a website sends only its saved URL to a new tab", async ({ context, page, extensionId, site }) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByLabel("Vault password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await page.getByRole("button", { name: "View Example, alice", exact: true }).click();
  const opened = context.waitForEvent("page");
  await page.getByRole("button", { name: "Open website (HTTP)", exact: true }).click();
  const target = await opened; await expect(target).toHaveURL(site.url);
  await expect.poll(() => site.requests.includes("/login")).toBe(true);
  expect(site.requests.every(path => path === "/login" || path === "/favicon.ico")).toBe(true);
  await target.close();
});

test("lock removes revealed details and resets search on re-unlock", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByLabel("Vault password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await page.getByLabel("Search credentials").fill("alice");
  await page.getByRole("button", { name: "View Example, alice", exact: true }).click();
  await page.getByRole("button", { name: "Show password", exact: true }).click();
  await expect(page.locator("body")).toContainText(entries[0]!.password);
  await page.getByRole("button", { name: "Lock vault", exact: true }).click();
  await expect(page.locator("body")).not.toContainText(entries[0]!.password);
  await expect(page.locator("body")).not.toContainText("alice@example.com");
  await page.getByLabel("Vault password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await expect(page.getByLabel("Search credentials")).toHaveValue("");
  await page.getByRole("button", { name: "View Example, alice", exact: true }).click();
  await expect(page.locator("body")).not.toContainText(entries[0]!.password);
});

test("clipboard failures show a fixed error and late results cannot restore locked details", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByLabel("Vault password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await page.getByRole("button", { name: "View Example, alice", exact: true }).click();
  await page.evaluate(() => Object.defineProperty(navigator.clipboard, "writeText", { configurable: true,
    value: () => Promise.reject(new Error("private clipboard diagnostic")) }));
  await page.getByRole("button", { name: "Copy password", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Unable to copy. Keep the popup focused and try again.");
  await expect(page.locator("body")).not.toContainText("private clipboard diagnostic");
  await page.evaluate(() => Object.defineProperty(navigator.clipboard, "writeText", { configurable: true,
    value: () => new Promise<void>(resolve => { Object.assign(window, { resolveFixtureCopy: resolve }); }) }));
  await page.getByRole("button", { name: "Copy password", exact: true }).click();
  await page.getByRole("button", { name: "Lock vault", exact: true }).click();
  await page.evaluate(() => (window as unknown as { resolveFixtureCopy: () => void }).resolveFixtureCopy());
  await expect(page.getByRole("heading", { name: "Your vault is locked" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Password copied");
  await expect(page.locator("body")).not.toContainText(entries[0]!.password);
});
