import { test as base, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { build as viteBuild } from "vite";
import { formOperation } from "../../src/content/forms";
import fixture from "../fixtures/legacy-vault.json" with { type: "json" };

const origin = "https://interaction-fixture.example";
const profile = { id: "00000000-0000-4000-8000-000000000001", email: "fixture@example.com", name: "Fixture", emailVerified: true,
  sessionExpiresAt: new Date(Date.now() + 3600000).toISOString(), vaultSalt: fixture.salt };
const entry = { title: "Interaction", username: "fixture-user", password: "public-fill-password", website: origin, notes: "Preserve these notes" };
const login = '<form id="login"><input name="username" autocomplete="username"><input name="password" type="password" autocomplete="current-password"><button>Sign in</button></form>';
const test = base.extend<{ context: BrowserContext; extensionId: string; records: { bodies: string[]; items: Array<Record<string, unknown>> } }, { bundle: string; controlledCode: string; globalAccess: boolean }>({
  globalAccess: [false, { scope: "worker", option: true }],
  controlledCode: [async ({}, use) => {
    const result = await viteBuild({ configFile: false, logLevel: "silent", define: { "process.env.NODE_ENV": JSON.stringify("production") },
      build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL("../fixtures/react-login.ts", import.meta.url)), formats: ["iife"], name: "ControlledLogin" } } });
    const output = (Array.isArray(result) ? result[0] : result) as { output: Array<{ type: string; code?: string }> };
    await use(output.output.find(item => item.type === "chunk")!.code!);
  }, { scope: "worker" }],
  bundle: [async ({ globalAccess }, use, workerInfo) => {
    const bundle = fileURLToPath(new URL(`../../test-results/interaction-extension-${workerInfo.workerIndex}`, import.meta.url));
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../../../../node_modules/vite/bin/vite.js", import.meta.url)), "build", "--outDir", bundle], {
      cwd: fileURLToPath(new URL("../..", import.meta.url)), env: { ...process.env, VITE_API_ORIGIN: origin }, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`Interaction fixture build failed: ${result.stderr}`);
    if (globalAccess) {
      // Test-only permission grant: headless Chromium cannot approve the native
      // optional-host prompt. Production manifests remain API-only mandatory.
      const manifestPath = `${bundle}/manifest.json`;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      manifest.host_permissions.push("https://*/*");
      writeFileSync(manifestPath, JSON.stringify(manifest));
    }
    await use(bundle);
  }, { scope: "worker" }],
  context: async ({ bundle }, use) => {
    const context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${bundle}`, `--load-extension=${bundle}`] });
    try { await use(context); } finally { await context.close(); }
  },
  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"); await use(new URL(worker.url()).hostname);
  },
  records: [async ({ context }, use) => {
    const key = await webcrypto.subtle.importKey("raw", Buffer.from(fixture.keyHex, "hex"), "AES-GCM", false, ["encrypt"]);
    const nonce = webcrypto.getRandomValues(new Uint8Array(12));
    const cipherText = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, new TextEncoder().encode(JSON.stringify(entry)));
    const records = { bodies: [] as string[], items: [{ id: "00000000-0000-4000-8000-000000000002", userId: profile.id,
      cipherText: Buffer.from(cipherText).toString("base64"), nonce: Buffer.from(nonce).toString("base64"), createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }] as Array<Record<string, unknown>> };
    await context.route(`${origin}/**`, async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/user/me") return route.fulfill({ json: profile });
      if (path === "/vault" && route.request().method() === "GET") return route.fulfill({ json: records.items });
      if (path.startsWith("/vault") && ["POST", "PATCH"].includes(route.request().method())) {
        records.bodies.push(route.request().postData()!); const body = route.request().postDataJSON();
        const id = path === "/vault" ? "00000000-0000-4000-8000-000000000003" : path.split("/").at(-1)!;
        const previous = records.items.find(item => item.id === id);
        if (body.expectedCipherText && body.expectedCipherText !== previous?.cipherText) return route.fulfill({ status: 409, json: {} });
        const item = { id, userId: profile.id, cipherText: body.cipherText, nonce: body.nonce, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-10-11T00:00:00.000Z" };
        records.items = [...records.items.filter(item => item.id !== id), item];
        return route.fulfill({ status: path === "/vault" ? 201 : 200, json: item });
      }
      return route.fulfill({ contentType: "text/html", body: `<html><body>${login}<script>document.addEventListener('submit', e => {e.preventDefault(); window.fixtureSubmits = (window.fixtureSubmits || 0) + 1;});</script></body></html>` });
    });
    await use(records);
  }, { auto: true }],
});

async function setup(page: Page, context: BrowserContext, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByLabel("Vault password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your vault is unlocked" })).toBeVisible();
  const site = await context.newPage(); await site.goto(`${origin}/login`); await site.bringToFront();
  await expect(page.getByRole("region", { name: "Current website" })).toContainText(origin);
  return site;
}
async function click(page: Page, name: string) {
  // Keep the real website active while exercising the extension page UI. Native
  // toolbar popups remain manual tests; this fixture has only its API host grant.
  await page.getByRole("button", { name, exact: true }).evaluate(button => (button as HTMLButtonElement).click());
}
async function review(page: Page, expected: string) {
  await expect(async () => {
    if (await page.getByLabel("Save password", { exact: true }).count() === 0) await click(page, "Review capture");
    await expect(page.getByLabel("Save password", { exact: true })).toHaveValue(expected, { timeout: 500 });
  }).toPass({ intervals: [100, 250], timeout: 10000 });
}

test("real isolated document-bound autofill emits controlled-input events and never submits", async ({ context, page, extensionId }) => {
  const site = await setup(page, context, extensionId);
  await site.evaluate(() => { const iframe = document.createElement("iframe"); iframe.srcdoc = '<form><input name="username"><input type="password"></form>'; document.body.append(iframe); });
  await site.evaluate(() => { document.querySelector('input[name="username"]')!.addEventListener("input", event => Object.assign(window, { controlledUsername: (event.target as HTMLInputElement).value })); });
  await click(page, "View Interaction, fixture-user"); await click(page, "Fill login");
  await expect(page.getByRole("status").filter({ hasText: "Login fields filled" })).toBeVisible();
  await expect(site.locator('input[name="username"]')).toHaveValue(entry.username);
  await expect(site.locator('input[type="password"]')).toHaveValue(entry.password);
  expect(await site.evaluate(() => (window as unknown as { controlledUsername: string }).controlledUsername)).toBe(entry.username);
  expect(await site.evaluate(() => "fixtureSubmits" in window)).toBe(false);
  await expect(site.frameLocator("iframe").locator('input[type="password"]')).toHaveValue("");
});

test("Chrome document targeting rejects a navigation race and leaves the new page empty", async ({ context, page, extensionId }) => {
  const site = await setup(page, context, extensionId);
  const target = await page.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab!.id!, frameIds: [0] }, world: "ISOLATED", func: () => location.origin });
    return { tabId: tab!.id!, documentId: result!.documentId };
  });
  await site.goto(`${origin}/other`);
  expect(await page.evaluate(async target => {
    try { await chrome.scripting.executeScript({ target: { tabId: target.tabId, documentIds: [target.documentId] }, world: "ISOLATED", func: () => { const field = document.querySelector<HTMLInputElement>('input[type="password"]'); if (field) field.value = "should-never-arrive"; } }); return false; }
    catch { return true; }
  }, target)).toBe(true);
  await expect(site.locator('input[type="password"]')).toHaveValue("");
});

test("multiple and dynamically rendered forms require an explicit form choice", async ({ context, page, extensionId }) => {
  const site = await setup(page, context, extensionId);
  await site.evaluate(login => document.body.insertAdjacentHTML("beforeend", login.replace('id="login"', 'id="second"')), login);
  await click(page, "View Interaction, fixture-user"); await click(page, "Fill login");
  await expect(page.getByText("Choose the login form to fill.")).toBeVisible();
  await expect(site.locator('input[type="password"]').first()).toHaveValue("");
  await click(page, "Login form 2");
  await expect(site.locator('#second input[type="password"]')).toHaveValue(entry.password);
  await expect(site.locator('#login input[type="password"]')).toHaveValue("");
});

test("hidden, change-password, cross-origin action and stale forms fail closed", async ({ context, page, extensionId }) => {
  const site = await setup(page, context, extensionId);
  for (const html of ['<form><input name="username"><input type="password" style="display:none"></form>',
    '<form><input name="username"><input type="password" autocomplete="new-password"></form>',
    '<form action="https://evil.example"><input name="username"><input type="password"></form>']) {
    await site.evaluate(html => { document.body.innerHTML = html; }, html);
    const result = await site.evaluate(formOperation, { mode: "probe" as const, origin });
    expect(result).toEqual({ ok: true, forms: [] });
  }
  await site.evaluate(login => { document.body.innerHTML = login; }, login);
  const probe = await site.evaluate(formOperation, { mode: "probe" as const, origin });
  if (!probe.ok || !("forms" in probe)) throw new Error("Probe unavailable");
  await site.locator('input[name="username"]').evaluate(input => input.setAttribute("name", "different"));
  expect(await site.evaluate(formOperation, { mode: "fill" as const, origin, index: 0, signature: probe.forms[0]!.signature, username: entry.username, password: entry.password })).toEqual({ ok: false });
  await expect(site.locator('input[type="password"]')).toHaveValue("");
});

test("manual save requires confirmation, sends ciphertext only, and decrypts after reopening", async ({ context, page, extensionId, records }) => {
  await setup(page, context, extensionId);
  await click(page, "Save credentials"); await click(page, "Add credential");
  await page.getByLabel("Save title", { exact: true }).fill("New account");
  await page.getByLabel("Save username", { exact: true }).fill("new-user");
  await page.getByLabel("Save password", { exact: true }).fill("public-new-password");
  await expect(page.getByRole("button", { name: "Confirm save", exact: true })).toBeDisabled();
  expect(records.bodies).toEqual([]);
  await page.getByLabel("Confirm save", { exact: true }).check(); await click(page, "Confirm save");
  await expect(page.getByRole("status").filter({ hasText: "Credential saved." })).toBeVisible();
  expect(records.bodies).toHaveLength(1);
  expect(records.bodies[0]).not.toContain("public-new-password"); expect(records.bodies[0]).not.toContain("new-user");
  await click(page, "Lock vault");
  await page.reload(); await page.getByLabel("Vault password", { exact: true }).fill(fixture.password); await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await expect(page.getByRole("button", { name: "View New account, new-user", exact: true })).toBeVisible();
});

test("submission capture survives popup closure encrypted and requires review before saving", async ({ context, page, extensionId, records }) => {
  const site = await setup(page, context, extensionId);
  await click(page, "Save credentials"); await click(page, "Watch submission");
  await expect(page.getByRole("status").filter({ hasText: "Watching the next submission" })).toBeVisible();
  await page.close();
  await site.locator('input[name="username"]').fill("submitted-user"); await site.locator('input[type="password"]').fill("public-submitted-password");
  await site.getByRole("button", { name: "Sign in" }).click();
  await expect.poll(() => site.evaluate(() => (globalThis as typeof globalThis & { fixtureSubmits?: number }).fixtureSubmits)).toBe(1);
  expect(records.bodies).toEqual([]);
  const popup = await context.newPage(); await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByRole("heading", { name: "Your vault is unlocked" })).toBeVisible();
  await site.bringToFront(); await expect(popup.getByRole("region", { name: "Current website" })).toContainText(origin);
  await click(popup, "Save credentials"); await review(popup, "public-submitted-password");
  await expect(popup.getByLabel("Save username", { exact: true })).toHaveValue("submitted-user");
  await expect(popup.getByLabel("Save password", { exact: true })).toHaveValue("public-submitted-password");
  expect(records.bodies).toEqual([]);
  await popup.getByLabel("Confirm save", { exact: true }).check(); await click(popup, "Confirm save");
  await expect(popup.getByRole("status").filter({ hasText: "Credential saved." })).toBeVisible();
  expect(records.bodies.join("")).not.toContain("public-submitted-password");
});

test("password-change capture updates only the explicitly chosen account and preserves metadata", async ({ context, page, extensionId, records }) => {
  const site = await setup(page, context, extensionId);
  await site.evaluate(() => { document.body.innerHTML = '<form id="change"><input name="username" value="fixture-user"><input type="password" autocomplete="current-password" value="old"><input type="password" autocomplete="new-password" value="public-changed-password"><input type="password" autocomplete="new-password" value="public-changed-password"><button>Change</button></form>'; document.addEventListener("submit", event => event.preventDefault()); });
  await click(page, "Save credentials"); await click(page, "Watch submission");
  await expect(page.getByRole("status").filter({ hasText: "Watching" })).toBeVisible();
  await site.getByRole("button", { name: "Change", exact: true }).evaluate(button => (button as HTMLButtonElement).click());
  await review(page, "public-changed-password");
  await expect(page.getByLabel("Save password", { exact: true })).toHaveValue("public-changed-password");
  await page.getByLabel("Save destination", { exact: true }).selectOption("00000000-0000-4000-8000-000000000002");
  await page.getByLabel("Confirm save", { exact: true }).check(); await click(page, "Confirm update");
  await expect(page.getByRole("status").filter({ hasText: "Credential password updated." })).toBeVisible();
  expect(records.items).toHaveLength(1); expect(JSON.parse(records.bodies[0]!).expectedCipherText).toBeTruthy();
  const key = await webcrypto.subtle.importKey("raw", Buffer.from(fixture.keyHex, "hex"), "AES-GCM", false, ["decrypt"]);
  const updated = records.items[0]!;
  const plaintext = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(updated.nonce as string, "base64") }, key, Buffer.from(updated.cipherText as string, "base64"));
  expect(JSON.parse(new TextDecoder().decode(plaintext))).toMatchObject({ ...entry, password: "public-changed-password" });
});

test("cancelled save drafts and manual lock do not create credentials or revive captures", async ({ context, page, extensionId, records }) => {
  const site = await setup(page, context, extensionId);
  await click(page, "Save credentials"); await click(page, "Add credential");
  await page.getByLabel("Save password", { exact: true }).fill("public-cancelled-password");
  await click(page, "Cancel"); expect(records.bodies).toEqual([]);
  await click(page, "Watch submission");
  await expect(page.getByRole("status").filter({ hasText: "Watching" })).toBeVisible();
  await click(page, "Lock vault");
  await site.locator('input[name="username"]').fill("cancelled-user"); await site.locator('input[type="password"]').fill("public-cancelled-password");
  await site.getByRole("button", { name: "Sign in" }).evaluate(button => (button as HTMLButtonElement).click());
  await page.getByLabel("Vault password", { exact: true }).fill(fixture.password); await click(page, "Unlock vault");
  await expect(page.getByRole("heading", { name: "Your vault is unlocked" })).toBeVisible();
  await click(page, "Save credentials"); await click(page, "Review capture");
  await expect(page.getByRole("status").filter({ hasText: "No pending submission" })).toBeVisible();
  expect(records.bodies).toEqual([]);
});

async function enableInline(page: Page) {
  // The test site is the fixture API host, already granted in the manifest.
  // Real third-party grants still use Chrome's native permission prompt.
  expect(await page.evaluate(async origin => (await chrome.runtime.sendMessage({ type: "inline/settings", origin, enabled: true })).ok, origin)).toBe(true);
}
async function inlineChooser(site: Page, _context: BrowserContext) {
  await site.locator('input[name="username"]').click();
  await expect(site.locator('[data-password-manager-control="suggestions"]')).toHaveCount(1);
  await expect.poll(() => site.frames().filter(frame => frame.url().includes('/suggestions.html?request=')).length).toBe(1);
  return site.frames().find(frame => frame.url().includes('/suggestions.html?request='))!;
}

test("focused-field suggestions fill both login fields after explicit selection with the popup closed", async ({ context, page, extensionId }) => {
  const site = await setup(page, context, extensionId);
  await expect(site.locator('[data-password-manager-control="suggestions"]')).toHaveCount(0);
  await enableInline(page); await page.close();
  const chooser = await inlineChooser(site, context);
  await expect(chooser.getByRole("list", { name: "Matching accounts" })).toBeVisible();
  await expect(site.locator('input[type="password"]')).toHaveValue("");
  await chooser.getByRole("button", { name: "Interaction fixture-user" }).click();
  await expect(site.locator('input[name="username"]')).toHaveValue(entry.username);
  await expect(site.locator('input[type="password"]')).toHaveValue(entry.password);
  expect(await site.evaluate(() => "fixtureSubmits" in window)).toBe(false);
});

test("dynamic focused forms and same-origin navigation require a fresh account picker", async ({ context, page, extensionId }) => {
  const site = await setup(page, context, extensionId);
  await site.evaluate(() => { document.body.innerHTML = "<p>Loading login</p>"; });
  await enableInline(page);
  await expect(site.locator('[data-password-manager-control="suggestions"]')).toHaveCount(0);
  await site.evaluate(html => document.body.insertAdjacentHTML("beforeend", html), login);
  const chooser = await inlineChooser(site, context);
  await expect(chooser.getByRole("list", { name: "Matching accounts" })).toBeVisible();
  await site.locator('input[name="username"]').evaluate(input => { input.style.display = "none"; });
  await expect(site.locator('[data-password-manager-control="suggestions"]')).toHaveCount(0);
  await site.locator('input[name="username"]').evaluate(input => { input.style.display = ""; });
  await inlineChooser(site, context);
  await site.goto(`${origin}/different-login`);
  await expect(site.locator('[data-password-manager-control="suggestions"]')).toHaveCount(0);
  await expect(site.locator('input[type="password"]')).toHaveValue("");
  const fresh = await inlineChooser(site, context);
  await expect(fresh.getByRole("list", { name: "Matching accounts" })).toBeVisible();
  await fresh.getByRole("button", { name: "Interaction fixture-user" }).click();
  await expect(site.locator('input[type="password"]')).toHaveValue(entry.password);
});

test("locked chooser accepts the vault password only in extension UI and shows no page secrets", async ({ context, page, extensionId }) => {
  const site = await setup(page, context, extensionId); await enableInline(page);
  await click(page, "Lock vault"); await page.close();
  const picker = await inlineChooser(site, context);
  const opened = context.waitForEvent("page");
  await picker.getByRole("button", { name: "Unlock in Password Manager" }).click();
  const chooser = await opened;
  await expect(chooser.getByRole("heading", { name: "Your vault is locked" })).toBeVisible();
  await expect(site.locator('input[type="password"]')).toHaveValue("");
  await chooser.getByLabel("Vault password", { exact: true }).fill(fixture.password);
  await chooser.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await expect(chooser.getByRole("list", { name: "Matching accounts" })).toBeVisible();
  await chooser.getByRole("button", { name: "Interaction fixture-user" }).click();
  await expect(site.locator('input[type="password"]')).toHaveValue(entry.password);
  expect(await site.evaluate(value => document.documentElement.outerHTML.includes(value), fixture.password)).toBe(false);
});

test("disabling suggestions removes existing controls and future registrations", async ({ context, page, extensionId }) => {
  const site = await setup(page, context, extensionId); await enableInline(page);
  await inlineChooser(site, context);
  await expect(site.locator('[data-password-manager-control="suggestions"]')).toHaveCount(1);
  expect(await page.evaluate(async origin => (await chrome.runtime.sendMessage({ type: "inline/settings", origin, enabled: false })).ok, origin)).toBe(true);
  await expect(site.locator('[data-password-manager-control="suggestions"]')).toHaveCount(0);
  await site.reload(); await expect(site.locator('[data-password-manager-control="suggestions"]')).toHaveCount(0);
  expect(await page.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).length)).toBe(0);
});

test("keyboard fill command is registered with a browser shortcut", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  const commands = await page.evaluate(() => chrome.commands.getAll());
  expect(commands.find(command => command.name === "fill-login")).toMatchObject({ shortcut: "Alt+Shift+L", description: "Choose a saved account and fill this login" });
  // Playwright keyboard events target page input, not Chromium's native browser
  // accelerator layer. Native invocation/activeTab granting remain manual checks.
});

test("content scripts cannot request the vault, API broker, or credential delivery", async ({ context, page, extensionId }) => {
  const site = await setup(page, context, extensionId);
  const replies = await page.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab!.id!, frameIds: [0] }, world: "ISOLATED", func: async () => {
      const responses = [];
      for (const message of [{ type: "session/view" }, { type: "session/entry", id: "00000000-0000-4000-8000-000000000002" },
        { type: "owner/api", request: { type: "vault/snapshot" } }, { type: "fill/choose", request: crypto.randomUUID(), id: "00000000-0000-4000-8000-000000000002", formIndex: 0 }]) responses.push(await chrome.runtime.sendMessage(message));
      return responses;
    } });
    return result!.result;
  });
  expect(replies).toEqual([{ ok: false, error: "forbidden" }, { ok: false, error: "forbidden" }, { ok: false, error: "forbidden" }, { ok: false }]);
  await expect(site.locator('input[type="password"]')).toHaveValue("");
});

test("the chooser supports multiple accounts and requires explicit selection", async ({ context, page, extensionId, records }, testInfo) => {
  const key = await webcrypto.subtle.importKey("raw", Buffer.from(fixture.keyHex, "hex"), "AES-GCM", false, ["encrypt"]);
  const nonce = webcrypto.getRandomValues(new Uint8Array(12));
  const second = { ...entry, title: "Second account", username: "second-user", password: "public-second-password" };
  const ciphertext = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, new TextEncoder().encode(JSON.stringify(second)));
  records.items.push({ ...records.items[0], id: "00000000-0000-4000-8000-000000000003", cipherText: Buffer.from(ciphertext).toString("base64"), nonce: Buffer.from(nonce).toString("base64") });
  const site = await setup(page, context, extensionId); await enableInline(page); await page.close();
  const chooser = await inlineChooser(site, context);
  await expect(chooser.getByRole("list", { name: "Matching accounts" }).getByRole("listitem")).toHaveCount(2);
  await expect(site.locator('input[type="password"]')).toHaveValue("");
  await site.screenshot({ path: testInfo.outputPath("field-suggestions.png") });
  await chooser.getByRole("button", { name: "Second account second-user" }).click();
  await expect(site.locator('input[name="username"]')).toHaveValue(second.username);
  await expect(site.locator('input[type="password"]')).toHaveValue(second.password);
});

for (const field of ["username", "password"]) {
  test(`suggestions from the second form's ${field} fill both fields and leave the first form untouched`, async ({ context, page, extensionId }) => {
    const site = await setup(page, context, extensionId);
    await site.evaluate(html => document.body.insertAdjacentHTML("beforeend", html.replace('id="login"', 'id="second"')), login);
    await enableInline(page);
    await site.locator(`#second input[name="${field}"]`).click();
    await expect.poll(() => site.frames().filter(frame => frame.url().includes('/suggestions.html?request=')).length).toBe(1);
    const picker = site.frames().find(frame => frame.url().includes('/suggestions.html?request='))!;
    await expect(picker.getByRole("list", { name: "Matching accounts" })).toBeVisible();
    const probe = await site.evaluate(formOperation, { mode: "probe" as const, origin });
    expect(probe.ok && "forms" in probe && probe.forms[0]?.index).toBe(1);
    // This is also the ordering used by the Alt+Shift+L standalone chooser.
    await picker.getByRole("button", { name: "Interaction fixture-user" }).click();
    await expect(site.locator('#second input[name="username"]')).toHaveValue(entry.username);
    await expect(site.locator('#second input[type="password"]')).toHaveValue(entry.password);
    await expect(site.locator('#login input[name="username"]')).toHaveValue("");
    await expect(site.locator('#login input[type="password"]')).toHaveValue("");
    await expect(site.locator('[data-password-manager-control="suggestions"]')).toHaveCount(0);
    expect(await site.evaluate(() => "fixtureSubmits" in window)).toBe(false);
  });
}

test("account metadata is isolated from website DOM and fabricated page clicks cannot fill", async ({ context, page, extensionId }) => {
  const site = await setup(page, context, extensionId); await enableInline(page);
  const picker = await inlineChooser(site, context);
  await expect(picker.getByRole("list", { name: "Matching accounts" })).toBeVisible();
  expect(await site.evaluate(() => document.documentElement.textContent!.includes("fixture-user"))).toBe(false);
  expect(await site.evaluate(() => document.querySelector('[data-password-manager-control="suggestions"]')!.shadowRoot)).toBe(null);
  await picker.getByRole("button", { name: "Interaction fixture-user" }).evaluate(button => (button as HTMLButtonElement).click());
  await expect(site.locator('input[type="password"]')).toHaveValue("");
  await picker.getByRole("button", { name: "Interaction fixture-user" }).click();
  await expect(site.locator('input[type="password"]')).toHaveValue(entry.password);
});

for (const field of ["username", "password"]) {
  test(`real React-controlled id-only inputs retain both values when filling from ${field}`, async ({ context, page, extensionId, controlledCode }) => {
    const site = await setup(page, context, extensionId);
    await context.route(`${origin}/controlled`, route => route.fulfill({ contentType: "text/html", body: '<html><body><div id="login-root"></div></body></html>' }));
    await site.goto(`${origin}/controlled`);
    await site.addScriptTag({ content: controlledCode });
    await enableInline(page);
    await site.locator(`#${field}`).click();
    await expect.poll(() => site.frames().filter(frame => frame.url().includes('/suggestions.html?request=')).length).toBe(1);
    const picker = site.frames().find(frame => frame.url().includes('/suggestions.html?request='))!;
    await expect(picker.getByRole("list", { name: "Matching accounts" })).toBeVisible();
    await picker.getByRole("button", { name: "Interaction fixture-user" }).click();
    await expect(site.locator('#username')).toHaveValue(entry.username);
    await expect(site.locator('#password')).toHaveValue(entry.password);
    await expect(site.locator('#state-check')).toHaveText(`${entry.username.length}:${entry.password.length}`);
    expect(await site.locator('body').getAttribute('data-submitted')).toBe(null);
  });
}

test("all-sites setup needs a granted permission and denied requests preserve site-only mode", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("button", { name: "Enable suggestions on all HTTPS websites", exact: true })).toBeVisible();
  expect(await page.evaluate(() => chrome.runtime.sendMessage({ type: "inline/all-sites", enabled: true }))).toEqual({ ok: false });
  await page.evaluate(() => { chrome.permissions.request = async () => false; });
  await page.getByRole("button", { name: "Enable suggestions on all HTTPS websites", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Website access was not granted." })).toBeVisible();
  expect(await page.evaluate(async () => (await chrome.storage.local.get("inlineAllSites")).inlineAllSites)).not.toBe(true);
});

const globalTest = test.extend<{}, { globalAccess: boolean }>({ globalAccess: [true, { scope: "worker" }] });
globalTest("global automatic suggestions: one global opt-in injects on a new website without per-site setup and preserves account isolation", async ({ context, page, extensionId }) => {
    const site = await setup(page, context, extensionId);
    expect(await page.evaluate(() => chrome.runtime.sendMessage({ type: "inline/all-sites", enabled: true }))).toEqual({ ok: true });
    expect(await page.evaluate(async () => (await chrome.storage.local.get("inlineOrigins")).inlineOrigins ?? [])).toEqual([]);
    const picker = await inlineChooser(site, context);
    await expect(picker.getByRole("list", { name: "Matching accounts" })).toBeVisible();
    await picker.getByRole("button", { name: "Interaction fixture-user" }).click();
    await expect(site.locator('input[name="username"]')).toHaveValue(entry.username);
    await expect(site.locator('input[type="password"]')).toHaveValue(entry.password);
    await context.route('https://second-fixture.example/**', route => route.fulfill({ contentType: "text/html", body: `<html><body>${login}</body></html>` }));
    const other = await context.newPage(); await other.goto('https://second-fixture.example/login');
    const otherPicker = await inlineChooser(other, context);
    await expect(otherPicker.locator('#accounts')).toHaveText("No saved accounts for this website.");
    await expect(other.locator('input[type="password"]')).toHaveValue("");
    const registrations = await page.evaluate(() => chrome.scripting.getRegisteredContentScripts());
    expect(registrations).toHaveLength(1);
    expect(registrations[0]?.matches).toEqual(["https://*/*"]);
    expect(await page.evaluate(() => chrome.runtime.sendMessage({ type: "inline/all-sites", enabled: false }))).toMatchObject({ ok: true, accessRevoked: false });
    await expect(other.locator('[data-password-manager-control="suggestions"]')).toHaveCount(0);
    expect(await page.evaluate(() => chrome.scripting.getRegisteredContentScripts())).toEqual([]);
    await other.reload(); await other.locator('input[name="username"]').click();
    await expect(other.locator('[data-password-manager-control="suggestions"]')).toHaveCount(0);
    // Required fixture permissions remain granted, so this checks settings and
    // script removal. Native optional permission revocation is a manual check.
    expect(await page.evaluate(async () => (await chrome.runtime.sendMessage({ type: "auth/session" })).ok)).toBe(true);
});


globalTest("login website approval is explicit, encrypted, persistent and revocable", async ({ context, page, extensionId, records }) => {
  const site = await setup(page, context, extensionId);
  expect(await page.evaluate(() => chrome.runtime.sendMessage({ type: "inline/all-sites", enabled: true }))).toEqual({ ok: true });
  const loginOrigin = "https://www.interaction-fixture.example";
  await context.route(`${loginOrigin}/**`, route => route.fulfill({ contentType: "text/html", body: `<html><body>${login}</body></html>` }));
  await site.goto(`${loginOrigin}/login`); await site.bringToFront();
  const picker = await inlineChooser(site, context);
  await expect(picker.getByRole("button", { name: "Review login website" })).toBeVisible();
  await expect(picker.getByRole("list", { name: "Matching accounts" })).toHaveCount(0);
  expect(records.bodies).toEqual([]);
  const chooserOpened = context.waitForEvent("page");
  await picker.getByRole("button", { name: "Review login website" }).click();
  const chooser = await chooserOpened;
  await expect(chooser.getByRole("region", { name: "Approve login website for Interaction" })).toBeVisible();
  await expect(chooser.getByRole("button", { name: "Approve login website", exact: true })).toBeDisabled();
  await expect(site.locator('input[type="password"]')).toHaveValue("");
  await chooser.getByLabel("I recognize and trust this login website").check();
  await chooser.getByRole("button", { name: "Approve login website", exact: true }).click();
  await expect.poll(() => records.bodies.length).toBe(1);
  expect(records.bodies[0]).not.toContain(loginOrigin); expect(records.bodies[0]).not.toContain(entry.password);
  const saved = records.items[0]!;
  const key = await webcrypto.subtle.importKey("raw", Buffer.from(fixture.keyHex, "hex"), "AES-GCM", false, ["decrypt"]);
  const plain = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(saved.nonce as string, "base64") }, key, Buffer.from(saved.cipherText as string, "base64"));
  expect(JSON.parse(new TextDecoder().decode(plain))).toEqual({ ...entry, approvedOrigins: [loginOrigin] });
  await expect(chooser.getByRole("button", { name: /Interaction.*fixture-user/ })).toBeVisible();
  await expect(site.locator('input[type="password"]')).toHaveValue("");
  await chooser.getByRole("button", { name: /Interaction.*fixture-user/ }).click();
  await expect(site.locator('input[name="username"]')).toHaveValue(entry.username);
  await expect(site.locator('input[type="password"]')).toHaveValue(entry.password);
  await click(page, "Lock vault");
  await page.getByLabel("Vault password", { exact: true }).fill(fixture.password); await click(page, "Unlock vault");
  await expect(page.getByRole("heading", { name: "Your vault is unlocked" })).toBeVisible();
  await click(page, "View Interaction, fixture-user");
  await expect(page.getByRole("region", { name: "Approved login websites" })).toContainText(loginOrigin);
  await click(page, `Remove approval for ${loginOrigin}`);
  await expect(page.getByRole("status").filter({ hasText: "Login website approval removed." })).toBeVisible();
  await site.reload(); await site.bringToFront();
  const unapproved = await inlineChooser(site, context);
  await expect(unapproved.getByRole("button", { name: "Review login website" })).toBeVisible();
  await expect(site.locator('input[type="password"]')).toHaveValue("");
});

test("username-first and password-only steps fill only the current step and never advance or submit", async ({ context, page, extensionId }) => {
  const site = await setup(page, context, extensionId);
  await site.evaluate(() => { document.body.innerHTML = '<form><input name="username" type="email" autocomplete="section-signin username"><button>Next</button></form>'; });
  await enableInline(page); await page.close();
  const usernamePicker = await inlineChooser(site, context);
  await usernamePicker.getByRole("button", { name: "Interaction fixture-user" }).click();
  await expect(site.locator('input[name="username"]')).toHaveValue(entry.username);
  await expect(site.locator('input[type="password"]')).toHaveCount(0);
  expect(await site.evaluate(() => "fixtureSubmits" in window)).toBe(false);
  // Simulate the user advancing to a newly rendered password step.
  await site.evaluate(() => { document.body.innerHTML = '<form><input name="password" type="password" autocomplete="current-password"><button>Sign in</button></form>'; });
  await site.locator('input[type="password"]').click();
  await expect.poll(() => site.frames().filter(frame => frame.url().includes('/suggestions.html?request=')).length).toBe(1);
  const passwordPicker = site.frames().find(frame => frame.url().includes('/suggestions.html?request='))!;
  await passwordPicker.getByRole("button", { name: "Interaction fixture-user" }).click();
  await expect(site.locator('input[type="password"]')).toHaveValue(entry.password);
  expect(await site.evaluate(() => "fixtureSubmits" in window)).toBe(false);
});

test("ambiguous account fragments and one-time codes do not receive saved credentials", async ({ context, page, extensionId }) => {
  const site = await setup(page, context, extensionId);
  for (const html of ['<form><input name="code" autocomplete="one-time-code"></form>', '<form><input name="username"></form>', '<form><input type="password"></form>', '<form><input type="email"><input type="email"></form>', '<form><input type="email"><input type="password" autocomplete="new-password"></form>']) {
    await site.evaluate(html => { document.body.innerHTML = html; }, html);
    expect(await site.evaluate(formOperation, { mode: "probe" as const, origin })).toEqual({ ok: true, forms: [] });
  }
});


test("website access prompt handles decline and exact-host acceptance inside extension UI", async ({ context, page, extensionId }) => {
  await page.addInitScript(() => {
    // Native permission UI remains a manual test; simulate its two replies here.
    chrome.permissions.contains = async () => false;
    chrome.permissions.request = async request => {
      const state = window as unknown as { granted?: boolean; requested?: string[] };
      state.requested = request.origins; return state.granted === true;
    };
  });
  const site = await setup(page, context, extensionId);
  await expect(page.getByRole("region", { name: "Website access required" })).toBeVisible();
  await click(page, "Allow website access");
  await expect(page.getByRole("status").filter({ hasText: "Website access was not granted." })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { requested: string[] }).requested)).toEqual([`${origin}/*`]);
  await expect(site.locator('[data-password-manager-control="suggestions"]')).toHaveCount(0);
  await page.evaluate(() => { (window as unknown as { granted: boolean }).granted = true; });
  await click(page, "Allow website access");
  await expect(page.getByRole("region", { name: "Website access required" })).toHaveCount(0);
  const picker = await inlineChooser(site, context);
  await expect(picker.getByRole("list", { name: "Matching accounts" })).toBeVisible();
});


test("Google-shaped username step ignores the hidden password and resolves a clobbered form action", async ({ context, page, extensionId }) => {
  const site = await setup(page, context, extensionId);
  await site.evaluate(() => { document.body.innerHTML = '<form action="/signin/identifier" method="post"><input id="identifierId" name="identifier" autocomplete="username"><div style="display:none"><input type="password" name="hiddenPassword" aria-hidden="true" tabindex="-1"></div><button name="action" type="submit">Next</button></form>'; });
  expect(await site.evaluate(() => typeof document.forms[0]!.action)).not.toBe("string");
  await enableInline(page);
  await site.locator('#identifierId').click();
  await expect.poll(() => site.frames().filter(frame => frame.url().includes('/suggestions.html?request=')).length).toBe(1);
  const picker = site.frames().find(frame => frame.url().includes('/suggestions.html?request='))!;
  await picker.getByRole("button", { name: "Interaction fixture-user" }).click();
  await expect(site.locator('#identifierId')).toHaveValue(entry.username);
  await expect(site.locator('input[name="hiddenPassword"]')).toHaveValue("");
  expect(await site.evaluate(() => "fixtureSubmits" in window)).toBe(false);
  await site.evaluate(() => document.forms[0]!.setAttribute("action", "https://evil.example"));
  expect(await site.evaluate(formOperation, { mode: "probe" as const, origin })).toEqual({ ok: true, forms: [] });
});


for (const layout of ["formless", "shadow", "accessible-label"] as const) {
  test(`generic ${layout} login widgets show suggestions and fill both fields without submitting`, async ({ context, page, extensionId }) => {
    const site = await setup(page, context, extensionId);
    await site.evaluate(layout => {
      document.body.innerHTML = '<div id="widget"></div>';
      const host = document.querySelector('#widget')!;
      const root = layout === "shadow" ? host.attachShadow({ mode: "open" }) : host;
      root.innerHTML = layout === "accessible-label" ? '<div role="form"><label for="opaque">Email or phone</label><input id="opaque" autocomplete="off"><input id="secret" type="password" autocomplete="current-password"><button>Sign in</button></div>' : '<section><div><input id="identifierId" autocomplete="username webauthn"></div><div><input id="secret" type="password" autocomplete="current-password"></div><button>Sign in</button></section>';
    }, layout);
    await enableInline(page); await page.close();
    await site.locator(layout === "accessible-label" ? '#opaque' : '#identifierId').click();
    await expect.poll(() => site.frames().filter(frame => frame.url().includes('/suggestions.html?request=')).length).toBe(1);
    const picker = site.frames().find(frame => frame.url().includes('/suggestions.html?request='))!;
    await picker.getByRole("button", { name: "Interaction fixture-user" }).click();
    await expect(site.locator(layout === "accessible-label" ? '#opaque' : '#identifierId')).toHaveValue(entry.username);
    await expect(site.locator('#secret')).toHaveValue(entry.password);
    expect(await site.evaluate(() => "fixtureSubmits" in window)).toBe(false);
  });
}

test("formless username steps ignore hidden helper inputs and ambiguous widgets fail closed", async ({ context, page, extensionId }) => {
  const site = await setup(page, context, extensionId);
  await site.evaluate(() => { document.body.innerHTML = '<section><input id="identifierId" autocomplete="username webauthn"><input type="password" style="display:none"></section>'; });
  const probe = await site.evaluate(formOperation, { mode: "probe" as const, origin });
  if (!probe.ok || !("forms" in probe) || probe.forms.length !== 1) throw new Error("Username step unavailable");
  expect(await site.evaluate(formOperation, { mode: "fill" as const, origin, ...probe.forms[0]!, username: entry.username, password: entry.password })).toEqual({ ok: true, filled: true });
  await expect(site.locator('input[type="password"]')).toHaveValue("");
  for (const html of ['<div role="form"><input type="email"><input type="password" autocomplete="new-password"></div>', '<div><input type="email"><input type="password"><input type="password"></div>', '<div><input autocomplete="one-time-code" aria-label="Verification code"></div>', '<div><input type="search" placeholder="Email search"></div>']) {
    await site.evaluate(html => { document.body.innerHTML = html; }, html);
    expect(await site.evaluate(formOperation, { mode: "probe" as const, origin })).toEqual({ ok: true, forms: [] });
  }
});
