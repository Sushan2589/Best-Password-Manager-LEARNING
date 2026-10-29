// Production vault onboarding UI checks with fixture-only API responses.
import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
const allocator = createServer();
await new Promise(resolve => allocator.listen(0, "127.0.0.1", resolve));
const port = allocator.address().port;
await new Promise(resolve => allocator.close(resolve));
const url = `http://127.0.0.1:${port}`;
const apiUrl = process.env.TEST_API_URL ?? `${url}/api`;
const server = spawn(process.execPath, [fileURLToPath(new URL("../../../node_modules/next/dist/bin/next", import.meta.url)), "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: fileURLToPath(new URL("..", import.meta.url)), windowsHide: true, stdio: "ignore" });
let browser;
try {
  await expect(async () => expect((await fetch(`${url}/vault`)).status).toBe(200)).toPass({ timeout: 30000 });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const profile = { id: "00000000-0000-4000-8000-000000000001", name: "Fixture", email: "fixture@example.com", emailVerified: true, vaultSalt: btoa("0123456789abcdef"), sessionExpiresAt: new Date(Date.now()+3600000).toISOString() };
  let items = [];
  let failVault = false;
  let writes = 0;
  await context.route(`${apiUrl}/**`, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/vault/setup")) {
      writes++;
      const verifier = route.request().postDataJSON();
      expect(JSON.stringify(verifier)).not.toContain("public-new-vault-password");
      profile.vaultVerifierCipher = verifier.cipherText;
      profile.vaultVerifierNonce = verifier.nonce;
      return route.fulfill({ status: 201, json: { ok: true } });
    }
    if (path.endsWith("/vault")) return route.fulfill({ status: failVault ? 503 : 200, json: items });
    return route.fulfill({ json: profile });
  });
  await page.goto(`${url}/vault`);
  await expect(page.getByRole("heading", { name: "Create your vault password" })).toBeVisible();
  await expect(page.getByText("This is separate from your sign-in password.", { exact: false })).toBeVisible();
  const password = page.getByLabel("New vault password", { exact: true });
  const confirm = page.getByLabel("Confirm vault password", { exact: true });
  await password.fill("short"); await confirm.fill("short");
  await page.getByRole("button", { name: "Create vault", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("at least 15");
  await password.fill("public-new-vault-password"); await confirm.fill("a-different-vault-password");
  await page.getByRole("button", { name: "Create vault", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("do not match");
  expect(writes).toBe(0);
  await confirm.fill("public-new-vault-password");
  await page.getByRole("button", { name: "Create vault", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your credentials, secured." })).toBeVisible({ timeout: 30000 });
  expect(writes).toBe(1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Unlock your vault" })).toBeVisible();
  await expect(page.getByLabel("Confirm vault password", { exact: true })).toHaveCount(0);
  profile.vaultVerifierCipher = null; profile.vaultVerifierNonce = null;
  items = [{ cipherText: "legacy-credential" }];
  await page.reload();
  await expect(page.getByRole("heading", { name: "Unlock your vault" })).toBeVisible();
  failVault = true;
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "Unable to check your vault" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create vault", exact: true })).toHaveCount(0);
  failVault = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Unlock your vault" })).toBeVisible();
  expect(writes).toBe(1);
  console.log("PASS: first-time vault setup, confirmation, encrypted verifier, returning/legacy unlock, and failed checks");
} finally { await browser?.close(); server.kill(); }
