import { webcrypto } from "node:crypto";
import { test, expect } from "./fixtures";
import fixture from "../fixtures/legacy-vault.json" with { type: "json" };

const profile = { id: "00000000-0000-4000-8000-000000000001", email: "fixture@example.com", name: "Fixture",
  emailVerified: true, sessionExpiresAt: new Date(Date.now() + 3600000).toISOString(), vaultSalt: fixture.salt };
const entries = [
  { title: "GitHub", username: "alice", password: "public-alice-fixture", website: "https://github.com/login" },
  { title: "GitHub", username: "bob", password: "public-bob-fixture", website: "https://github.com" },
  { title: "Google parent", username: "parent", password: "public-parent-fixture", website: "https://google.com" },
  { title: "Google accounts", username: "child", password: "public-child-fixture", website: "https://accounts.google.com/login" },
];

test.beforeEach(async ({ context }) => {
  const key = await webcrypto.subtle.importKey("raw", Buffer.from(fixture.keyHex, "hex"), "AES-GCM", false, ["encrypt"]);
  const items = await Promise.all(entries.map(async (entry, index) => {
    const nonce = webcrypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, new TextEncoder().encode(JSON.stringify(entry)));
    return { id: `00000000-0000-4000-8000-00000000000${index + 2}`, userId: profile.id,
      cipherText: Buffer.from(ciphertext).toString("base64"), nonce: Buffer.from(nonce).toString("base64"),
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
  }));
  await context.route("http://localhost:3001/**", route => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify(route.request().url().endsWith("/vault") ? items : profile) }));
});

test("current-site filtering supports multiple accounts, search, and explicit all-vault browsing", async ({ page, extensionId }, testInfo) => {
  await mockSite(page, "https://github.com/login?private=query");
  await unlock(page, extensionId);
  await expect(page.getByRole("region", { name: "Current website" })).toContainText("https://github.com");
  await expect(page.locator("body")).not.toContainText("private=query");
  await expect(page.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "This site (2)" })).toHaveAttribute("aria-pressed", "true");
  await page.locator("#root").screenshot({ path: testInfo.outputPath("popup-current-site.png") });
  await page.getByLabel("Search credentials").fill("bob");
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await page.getByRole("button", { name: "All credentials (4)" }).click();
  await expect(page.getByRole("listitem")).toHaveCount(4);
  await page.getByRole("button", { name: "This site (2)" }).click();
  await expect(page.getByRole("listitem")).toHaveCount(2);
  expect(await page.evaluate(() => chrome.runtime.getManifest().permissions)).toEqual(["activeTab"]);
});

test("navigation clears revealed details and phishing hosts receive no matches", async ({ page, extensionId }) => {
  await mockSite(page, "https://github.com"); await unlock(page, extensionId);
  await page.getByRole("button", { name: "View GitHub, alice", exact: true }).click();
  await page.getByRole("button", { name: "Show password", exact: true }).click();
  await changeSite(page, "https://github.com.evil.com");
  await expect(page.getByRole("heading", { name: "No credentials for this website" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(entries[0]!.password);
  await expect(page.getByRole("listitem")).toHaveCount(0);
  await changeSite(page, "https://accounts.google.com/login");
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "View Google accounts, child", exact: true })).toBeVisible();
  await changeSite(page, "https://github.com:8443");
  await expect(page.getByRole("listitem")).toHaveCount(0);
  // No page injection or content-script channel exists in this phase.
  expect(await page.evaluate(() => chrome.runtime.getManifest().content_scripts ?? [])).toEqual([]);
});

test("HTTP and unavailable tab URLs explain the limitation and retain all-vault browsing", async ({ page, extensionId }) => {
  await mockSite(page, "http://github.com"); await unlock(page, extensionId);
  await expect(page.getByRole("region", { name: "Current website" })).toContainText("HTTP websites are not eligible");
  await expect(page.getByRole("listitem")).toHaveCount(4);
  await changeSite(page, undefined);
  await expect(page.getByRole("region", { name: "Current website" })).toContainText("Website detection unavailable");
  await expect(page.getByRole("listitem")).toHaveCount(4);
});

test("real tabs API hides unrelated HTTPS URLs without a toolbar invocation grant", async ({ context, page, extensionId }) => {
  await unlock(page, extensionId);
  await expect(page.getByRole("region", { name: "Current website" })).toContainText("Website detection unavailable");
  const site = await context.newPage();
  await site.route("https://ungranted-fixture.example/**", route => route.fulfill({ body: "<html>Fixture</html>", contentType: "text/html" }));
  await site.goto("https://ungranted-fixture.example/login"); await site.bringToFront();
  expect(await page.evaluate(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs.length === 1 && tabs[0]!.url === undefined;
  })).toBe(true);
  await site.close();
});

import type { Page } from "@playwright/test";
async function unlock(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByLabel("Vault password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your vault is unlocked" })).toBeVisible();
}
async function mockSite(page: Page, url: string) {
  await page.addInitScript(url => {
    if (location.protocol !== "chrome-extension:") return;
    let current: string | undefined = url;
    Object.defineProperty(chrome.tabs, "query", { value: async () => [{ url: current, status: "complete" }], configurable: true });
    Object.assign(window, { changeFixtureSite: (next: string | undefined) => { current = next; window.dispatchEvent(new Event("focus")); } });
  }, url);
}
async function changeSite(page: Page, url: string | undefined) {
  await page.evaluate(url => (window as unknown as { changeFixtureSite: (url: string | undefined) => void }).changeFixtureSite(url), url);
}
