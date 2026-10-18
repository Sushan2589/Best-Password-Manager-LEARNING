import { test, expect, chromium, type BrowserContext } from "@playwright/test";
import { fileURLToPath } from "node:url";
import fixture from "../fixtures/legacy-vault.json" with { type: "json" };

const profile = { id: "00000000-0000-4000-8000-000000000001", email: "fixture@example.com", name: "Fixture",
  emailVerified: true, sessionExpiresAt: new Date(Date.now() + 3600000).toISOString(), vaultSalt: fixture.salt };
const item = { id: "00000000-0000-4000-8000-000000000002", userId: profile.id, cipherText: fixture.cipherText,
  nonce: fixture.nonce, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };

async function mockApi(context: BrowserContext) {
  await context.route("http://localhost:3001/**", route => route.fulfill({ json:
    new URL(route.request().url()).pathname === "/vault" ? [item] : profile }));
}

for (const policy of ["15", "browser"]) {
  test(`${policy} lock policy survives a full browser restart while the unlocked vault does not`, async ({}, testInfo) => {
    const directory = testInfo.outputPath("isolated-profile");
    const bundle = fileURLToPath(new URL("../../dist", import.meta.url));
    const launch = () => chromium.launchPersistentContext(directory, { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${bundle}`, `--load-extension=${bundle}`] });
    let context = await launch();
    try {
      await mockApi(context);
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
      const extensionId = new URL(worker.url()).hostname;
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup.html`);
      await popup.getByLabel("Vault password", { exact: true }).fill(fixture.password);
      await popup.getByRole("button", { name: "Unlock vault", exact: true }).click();
      await expect(popup.getByRole("heading", { name: "Your vault is unlocked" })).toBeVisible();
      await popup.getByRole("button", { name: "Settings", exact: true }).click();
      await popup.getByLabel("Lock the vault", { exact: true }).selectOption(policy);
      await expect.poll(() => popup.evaluate(async () => (await chrome.storage.local.get("lockPolicy")).lockPolicy)).toBe(policy === "browser" ? policy : Number(policy));
      await context.close();

      // Same disk profile, entirely new browser process and extension memory.
      context = await launch();
      await mockApi(context);
      const reopened = await context.newPage();
      await reopened.goto(`chrome-extension://${extensionId}/popup.html`);
      await expect(reopened.getByRole("heading", { name: "Your vault is locked" })).toBeVisible();
      await expect(reopened.getByLabel("Vault password", { exact: true })).toHaveValue("");
      const stored = await reopened.evaluate(async () => ({ local: await chrome.storage.local.get(null), session: await chrome.storage.session.get(null) }));
      expect(stored.local.lockPolicy).toBe(policy === "browser" ? policy : Number(policy));
      expect(stored.session).toEqual({});
      for (const value of [fixture.password, fixture.keyHex, fixture.entry.password, fixture.entry.username]) {
        expect(JSON.stringify(stored)).not.toContain(value);
      }
      // Authentication is fixture-valid; unlocking still needs the password again.
      await reopened.getByLabel("Vault password", { exact: true }).fill(fixture.password);
      await reopened.getByRole("button", { name: "Unlock vault", exact: true }).click();
      await expect(reopened.getByRole("heading", { name: "Your vault is unlocked" })).toBeVisible();
    } finally { await context.close(); }
  });
}
