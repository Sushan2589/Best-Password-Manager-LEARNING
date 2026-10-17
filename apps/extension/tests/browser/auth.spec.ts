import { test, expect } from "./fixtures";

const profile = { id: "00000000-0000-4000-8000-000000000001", email: "test@example.com", name: "Test", emailVerified: true, sessionExpiresAt: new Date(Date.now() + 3600000).toISOString() };

test("login verifies the session and survives reopening", async ({ context, page, extensionId }) => {
  let signedIn = false;
  await context.route("http://localhost:3001/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/auth/login") signedIn = true;
    if (path === "/auth/logout") signedIn = false;
    await route.fulfill({ status: path === "/user/me" && !signedIn ? 401 : 200, contentType: "application/json", body: JSON.stringify(path === "/user/me" ? profile : {}) });
  });
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByLabel("Email", { exact: true }).fill(profile.email);
  await page.getByLabel("Account password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your vault is locked" })).toBeVisible();
  await expect(page.getByLabel("Account password", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Vault password", { exact: true })).toHaveCount(1);
  const setup = page.getByRole("region", { name: "Autofill setup", exact: true });
  await expect(setup).toBeVisible();
  await setup.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(setup).toHaveCount(0);
  expect(await page.evaluate(async () => chrome.storage.local.get(null))).toEqual({ autofillSetupDismissed: true });
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(reopened.getByRole("heading", { name: "Your vault is locked" })).toBeVisible();
  await expect(reopened.getByRole("region", { name: "Autofill setup", exact: true })).toHaveCount(0);
  await reopened.getByRole("button", { name: "Sign out" }).click();
  await expect(reopened.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("wrong password shows a sanitized error and clears the input", async ({ context, page, extensionId }) => {
  await context.route("http://localhost:3001/**", route => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "private debug data" }) }));
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByLabel("Email", { exact: true }).fill(profile.email);
  await page.getByLabel("Account password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Invalid email or password.");
  await expect(page.getByLabel("Account password", { exact: true })).toHaveValue("");
  await expect(page.locator("body")).not.toContainText("private debug data");
});

test("unverified accounts can resend, manually refresh, and update on focus", async ({ context, page, extensionId }) => {
  let verified = false;
  let profileReads = 0;
  await context.route("http://localhost:3001/**", route => {
    const isProfile = new URL(route.request().url()).pathname === "/user/me";
    if (isProfile) profileReads++;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(isProfile ? { ...profile, emailVerified: verified } : {}) });
  });
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Autofill setup", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Resend verification email" }).click();
  await expect(page.getByRole("status")).toContainText("Verification email sent");
  await expect(page.getByRole("button", { name: /Resend available/ })).toBeDisabled();
  // Keep the fixture unverified until the manual click completes. Otherwise
  // a focus-triggered session refresh can legitimately replace this button
  // while Playwright is waiting for it to become enabled.
  const refresh = page.getByRole("button", { name: /verified my email/ });
  await expect(refresh).toBeEnabled();
  const readsBeforeRefresh = profileReads;
  await refresh.click();
  await expect.poll(() => profileReads).toBeGreaterThan(readsBeforeRefresh);
  await expect(refresh).toBeEnabled();
  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();

  verified = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: "Your vault is locked" })).toBeVisible();
  await expect(refresh).toHaveCount(0);
});

test("first-login autofill setup never prompts without a click and a denied permission changes no preferences", async ({ context, page, extensionId }) => {
  await context.route("http://localhost:3001/**", route => route.fulfill({ json: route.request().url().endsWith("/user/me") ? profile : {} }));
  await page.addInitScript(() => {
    const state = { requests: [] as chrome.permissions.Permissions[], enabledRequests: 0 };
    Object.assign(window, { onboardingFixture: state });
    chrome.permissions.request = async request => { state.requests.push(request); return false; };
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = ((message: { type?: string }) => {
      if (message.type === "inline/all-sites") state.enabledRequests++;
      return send(message);
    }) as typeof chrome.runtime.sendMessage;
  });
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  const setup = page.getByRole("region", { name: "Autofill setup", exact: true });
  await expect(setup).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { onboardingFixture: unknown }).onboardingFixture)).toEqual({ requests: [], enabledRequests: 0 });
  expect(await page.evaluate(async () => chrome.storage.local.get(null))).toEqual({});
  await setup.getByRole("button", { name: "Enable autofill on all HTTPS websites", exact: true }).click();
  await expect(setup.getByRole("status")).toHaveText("Website access was not granted. Try again, or enable autofill later in Settings.");
  expect(await page.evaluate(() => (window as unknown as { onboardingFixture: unknown }).onboardingFixture)).toEqual({ requests: [{ origins: ["https://*/*"] }], enabledRequests: 0 });
  expect(await page.evaluate(async () => chrome.storage.local.get(null))).toEqual({});
  await setup.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(setup).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("button", { name: "Enable suggestions on all HTTPS websites", exact: true })).toBeVisible();
});

for (const preference of [{ inlineAllSites: true }, { inlineAllSites: false }, { inlineOrigins: ["https://example.com"] }]) {
  test(`autofill onboarding respects an existing preference ${JSON.stringify(preference)}`, async ({ context, page, extensionId }) => {
    await context.route("http://localhost:3001/**", route => route.fulfill({ json: route.request().url().endsWith("/user/me") ? profile : {} }));
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(page.getByRole("region", { name: "Autofill setup", exact: true })).toBeVisible();
    await page.evaluate((value: { inlineAllSites?: boolean; inlineOrigins?: string[] }) => chrome.storage.local.set(value), preference);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Your vault is locked" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Autofill setup", exact: true })).toHaveCount(0);
  });
}

test("verification completed before a manual click updates automatically on focus", async ({ context, page, extensionId }) => {
  let verified = false;
  await context.route("http://localhost:3001/**", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify(new URL(route.request().url()).pathname === "/user/me" ? { ...profile, emailVerified: verified } : {}),
  }));
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
  verified = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: "Your vault is locked" })).toBeVisible();
  await expect(page.getByRole("button", { name: /verified my email/ })).toHaveCount(0);
  await expect(page.getByLabel("Vault password", { exact: true })).toBeVisible();
});

test("a resend click during a focus check succeeds and enforces cooldown", async ({ context, page, extensionId }) => {
  let holdNextProfile = false;
  let heldStarted = false;
  let resends = 0;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await context.route("http://localhost:3001/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/user/me" && holdNextProfile) {
      holdNextProfile = false; heldStarted = true; await held;
    }
    if (path === "/auth/resend-verification") resends++;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(path === "/user/me" ? { ...profile, emailVerified: false } : {}) });
  });
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  const resend = page.getByRole("button", { name: "Resend verification email", exact: true });
  await expect(resend).toBeEnabled();
  holdNextProfile = true;
  try {
    // Model focus immediately before click, before the disabled DOM state
    // commits. This intentionally controls event timing rather than sleeping.
    await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find(candidate => candidate.textContent === "Resend verification email");
      if (!button) throw new Error("Fixture resend control missing");
      window.dispatchEvent(new Event("focus"));
      button.click();
    });
    await expect.poll(() => heldStarted).toBe(true);
    await expect.poll(() => resends).toBe(1);
    await expect(page.getByRole("status")).toContainText("Verification email sent");
    const cooldown = page.getByRole("button", { name: /Resend available/ });
    await expect(cooldown).toBeDisabled();
    release();
    await expect(cooldown).toBeDisabled();
    await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
  } finally { release(); }
});

test("failed logout clears local profile and supports retry", async ({ context, page, extensionId }) => {
  let failLogout = true;
  await context.route("http://localhost:3001/**", route => route.fulfill({ status: route.request().url().endsWith("/auth/logout") && failLogout ? 500 : 200, contentType: "application/json", body: JSON.stringify(route.request().url().endsWith("/user/me") ? profile : {}) }));
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByRole("heading", { name: "Your vault is locked" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("alert")).toContainText("server logout could not be confirmed");
  await expect(page.locator("body")).not.toContainText(profile.email);
  failLogout = false;
  await page.getByRole("button", { name: "Retry logout" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("session expiry removes profile data before the next poll", async ({ context, page, extensionId }) => {
  await context.route("http://localhost:3001/user/me", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...profile, sessionExpiresAt: new Date(Date.now() + 2000).toISOString() }) }));
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByRole("heading", { name: "Your vault is locked" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Your session has expired");
  await expect(page.locator("body")).not.toContainText(profile.email);
});
