import { test, expect } from "./fixtures";
import fixture from "../fixtures/legacy-vault.json" with { type: "json" };

const profile = { id: "00000000-0000-4000-8000-000000000001", email: "fixture@example.com", name: "Fixture",
  emailVerified: true, sessionExpiresAt: new Date(Date.now() + 3600000).toISOString(), vaultSalt: fixture.salt };
const item = { id: "00000000-0000-4000-8000-000000000002", userId: profile.id, cipherText: fixture.cipherText,
  nonce: fixture.nonce, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };

test("a same-account fresh session with a changed vault-key version locks the memory owner", async ({ context, page, extensionId }) => {
  let version = 0;
  await context.route("http://localhost:3001/**", route => route.fulfill({ json: route.request().url().endsWith("/vault") ? [item] : { ...profile, vaultKeyVersion: version } }));
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByLabel("Vault password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your vault is unlocked" })).toBeVisible();
  version = 1; // Models rotation followed by a fresh valid cookie for the same account.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: "Your vault is locked" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(fixture.entry.password);
  await page.close(); const reopened = await context.newPage();
  await reopened.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(reopened.getByRole("heading", { name: "Your vault is locked" })).toBeVisible();
});

test("packaged Argon2 and memory owner survive popup closure and worker suspension, manual lock clears the vault", async ({ context, page, extensionId }, testInfo) => {
  const requests: { url: string; body: string | null }[] = [];
  const logs: string[] = [];
  page.on("console", message => logs.push(message.text()));
  page.on("pageerror", error => logs.push(error.message));
  await context.route("http://localhost:3001/**", route => {
    requests.push({ url: route.request().url(), body: route.request().postData() });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(route.request().url().endsWith("/vault") ? [item] : profile) });
  });
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByLabel("Vault password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your vault is unlocked" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("1 credential decrypted securely.");
  await expect(page.locator("body")).not.toContainText(fixture.entry.password);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
  await page.locator("#root").screenshot({ path: testInfo.outputPath("popup-unlocked.png") });
  await page.getByRole("button", { name: "Lock vault", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your vault is locked" })).toBeVisible();
  await page.getByLabel("Vault password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your vault is unlocked" })).toBeVisible();
  // The dedicated crypto worker outlives MV3 suspension and popup closure.
  const cdp = await context.newCDPSession(page);
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
  await expect(page.getByRole("heading", { name: "Your vault is unlocked" })).toBeVisible();
  await cdp.detach();
  await page.close();
  const reopened = await context.newPage(); await reopened.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(reopened.getByRole("heading", { name: "Your vault is unlocked" })).toBeVisible();
  const stored = await reopened.evaluate(async () => ({ local: await chrome.storage.local.get(null), session: await chrome.storage.session.get(null) }));
  expect(stored).toEqual({ local: {}, session: {} });
  await reopened.getByRole("button", { name: "Lock vault", exact: true }).click();
  await expect(reopened.getByRole("heading", { name: "Your vault is locked" })).toBeVisible();
  expect(requests.every(request => request.body === null)).toBe(true);
  expect(requests.some(request => request.url.endsWith("/vault"))).toBe(true);
  expect(logs).toEqual([]);
});

test("account switches lock the vault before showing the new profile", async ({ context, page, extensionId }) => {
  let current = profile;
  await context.route("http://localhost:3001/**", route => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify(route.request().url().endsWith("/vault") ? [item] : current) }));
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByLabel("Vault password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your vault is unlocked" })).toBeVisible();
  current = { ...profile, id: item.id, email: "different@example.com" };
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator("body")).toContainText(current.email);
  await expect(page.getByRole("heading", { name: "Your vault is locked" })).toBeVisible();
  await expect(page.getByLabel("Vault password", { exact: true })).toHaveValue("");
});

test("wrong vault passwords fail authentication and inputs clear", async ({ context, page, extensionId }) => {
  await context.route("http://localhost:3001/**", route => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify(route.request().url().endsWith("/vault") ? [item] : profile) }));
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByLabel("Vault password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Show vault password", exact: true }).click();
  await expect(page.getByLabel("Vault password", { exact: true })).toHaveAttribute("type", "text");
  await expect(page.getByRole("heading", { name: "Your vault is locked" })).toBeVisible();
  await page.getByRole("button", { name: "Hide vault password", exact: true }).click();
  await expect(page.getByLabel("Vault password", { exact: true })).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show vault password", exact: true }).click();
  await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Unable to unlock");
  await expect(page.getByLabel("Vault password", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Vault password", { exact: true })).toHaveAttribute("type", "password");
  await expect(page.getByRole("heading", { name: "Your vault is unlocked" })).toHaveCount(0);
});

test("empty vaults do not accept an unverified password", async ({ context, page, extensionId }) => {
  await context.route("http://localhost:3001/**", route => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify(route.request().url().endsWith("/vault") ? [] : profile) }));
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByLabel("Vault password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Create your first credential in the web app");
  await expect(page.getByRole("heading", { name: "Your vault is unlocked" })).toHaveCount(0);
});

test("logout clears an unlocked vault even when revocation fails", async ({ context, page, extensionId }) => {
  await context.route("http://localhost:3001/**", route => route.fulfill({ status: route.request().url().endsWith("/auth/logout") ? 500 : 200,
    contentType: "application/json", body: JSON.stringify(route.request().url().endsWith("/vault") ? [item] : profile) }));
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByLabel("Vault password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your vault is unlocked" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("server logout could not be confirmed");
  await expect(page.getByRole("heading", { name: "Your vault is unlocked" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("session expiry locks an unlocked vault", async ({ context, page, extensionId }) => {
  const expiresAt = new Date(Date.now() + 7000).toISOString();
  await context.route("http://localhost:3001/**", route => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify(route.request().url().endsWith("/vault") ? [item] : { ...profile, sessionExpiresAt: expiresAt }) }));
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByLabel("Vault password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your vault is unlocked" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your vault is unlocked" })).toHaveCount(0, { timeout: 10000 });
  await expect(page.getByRole("status")).toContainText("session has expired");
});

test("a delayed vault response cannot complete a cancelled unlock", async ({ context, page, extensionId }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let vaultRequested!: () => void;
  const requested = new Promise<void>(resolve => { vaultRequested = resolve; });
  await context.route("http://localhost:3001/**", async route => {
    if (route.request().url().endsWith("/vault")) { vaultRequested(); await gate; }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(route.request().url().endsWith("/vault") ? [item] : profile) });
  });
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByLabel("Vault password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await requested;
  await page.getByRole("button", { name: "Cancel unlock", exact: true }).click();
  release();
  await expect(page.getByRole("button", { name: "Unlock vault", exact: true })).toBeEnabled();
  await expect(page.getByRole("heading", { name: "Your vault is unlocked" })).toHaveCount(0);
});

for (const status of [401, 403]) {
  test(`vault HTTP ${status} clears unlock state and refreshes authentication`, async ({ context, page, extensionId }) => {
    let invalid = false;
    await context.route("http://localhost:3001/**", route => {
      const vaultRequest = route.request().url().endsWith("/vault");
      if (vaultRequest) invalid = true;
      return route.fulfill({ status: vaultRequest || invalid && status === 401 ? status : 200,
        contentType: "application/json", body: JSON.stringify(vaultRequest ? { error: "private diagnostic" } : { ...profile, emailVerified: !invalid }) });
    });
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.getByLabel("Vault password", { exact: true }).fill(fixture.password);
    await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
    if (status === 401) await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    else await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your vault is unlocked" })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("private diagnostic");
  });
}

test("popup-only policy persists without secrets and closing locks the shared owner", async ({ context, page, extensionId }) => {
  await context.route("http://localhost:3001/**", route => route.fulfill({ json: route.request().url().endsWith("/vault") ? [item] : profile }));
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByLabel("Vault password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your vault is unlocked" })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Lock the vault", { exact: true }).selectOption("0");
  await expect.poll(() => page.evaluate(async () => (await chrome.storage.local.get("lockPolicy")).lockPolicy)).toBe(0);
  await page.close();
  const reopened = await context.newPage(); await reopened.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(reopened.getByRole("heading", { name: "Your vault is locked" })).toBeVisible();
  expect(await reopened.evaluate(async () => chrome.storage.local.get(null))).toEqual({ lockPolicy: 0 });
});

test("destroying the offscreen owner clears an open popup and a reopened vault remains locked", async ({ context, page, extensionId }) => {
  await context.route("http://localhost:3001/**", route => route.fulfill({ json: route.request().url().endsWith("/vault") ? [item] : profile }));
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByLabel("Vault password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your vault is unlocked" })).toBeVisible();
  await page.evaluate(() => chrome.offscreen.closeDocument());
  await expect(page.getByRole("heading", { name: "Your vault is locked" })).toBeVisible();
  await page.reload(); await expect(page.getByRole("heading", { name: "Your vault is locked" })).toBeVisible();
});

test("browser-session policy survives popup closure and locks when the last normal window closes", async ({ context, page, extensionId }) => {
  await context.route("http://localhost:3001/**", route => route.fulfill({ json: route.request().url().endsWith("/vault") ? [item] : profile }));
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByLabel("Vault password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your vault is unlocked" })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Lock the vault", { exact: true })).toHaveValue("15");
  await page.getByLabel("Lock the vault", { exact: true }).selectOption("browser");
  await expect.poll(() => page.evaluate(async () => (await chrome.storage.local.get("lockPolicy")).lockPolicy)).toBe("browser");
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(reopened.getByRole("heading", { name: "Your vault is unlocked" })).toBeVisible();
  // Keep an extension window alive to exercise Chrome background mode, where
  // closing all normal windows need not terminate the browser process.
  await reopened.evaluate(async () => {
    const tab = await chrome.tabs.getCurrent();
    await chrome.windows.create({ tabId: tab!.id, type: "popup" });
    for (const window of await chrome.windows.getAll({ windowTypes: ["normal"] })) await chrome.windows.remove(window.id!);
  });
  await expect(reopened.getByRole("heading", { name: "Your vault is locked" })).toBeVisible();
  await expect(reopened.locator("body")).not.toContainText(fixture.entry.password);
  expect(await reopened.evaluate(async () => ({ local: await chrome.storage.local.get(null), session: await chrome.storage.session.get(null) }))).toEqual({ local: { lockPolicy: "browser" }, session: {} });
  await reopened.reload();
  await expect(reopened.getByRole("heading", { name: "Your vault is locked" })).toBeVisible();
});
