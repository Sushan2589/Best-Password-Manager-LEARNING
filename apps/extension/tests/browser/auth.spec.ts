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
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(reopened.getByRole("heading", { name: "Your vault is locked" })).toBeVisible();
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

test("unverified accounts can resend and refresh status", async ({ context, page, extensionId }) => {
  let verified = false;
  await context.route("http://localhost:3001/**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(route.request().url().endsWith("/user/me") ? { ...profile, emailVerified: verified } : {}) }));
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
  await page.getByRole("button", { name: "Resend verification email" }).click();
  await expect(page.getByRole("status")).toContainText("Verification email sent");
  await expect(page.getByRole("button", { name: /Resend available/ })).toBeDisabled();
  verified = true;
  await page.getByRole("button", { name: "I’ve verified my email" }).click();
  await expect(page.getByRole("heading", { name: "Your vault is locked" })).toBeVisible();
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
