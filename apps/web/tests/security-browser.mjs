// Local production UI checks. API responses are fixture-only; no Neon/email use.
import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";

const fixture = JSON.parse(readFileSync(new URL("../../extension/tests/fixtures/legacy-vault.json", import.meta.url), "utf8"));
const payload = '<img src=x onerror="window.__securityXss=1">';
const entry = { title: payload, username: '<svg onload="window.__securityXss=2">', password: "public-security-fixture-password", website: "https://private-fixture.example", notes: payload };
const key = await webcrypto.subtle.importKey("raw", Buffer.from(fixture.keyHex, "hex"), "AES-GCM", false, ["encrypt"]);
const nonce = webcrypto.getRandomValues(new Uint8Array(12));
const ciphertext = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, new TextEncoder().encode(JSON.stringify(entry)));
const profile = { id: "00000000-0000-4000-8000-000000000001", name: "Fixture", email: "fixture@example.com", emailVerified: true, vaultSalt: fixture.salt, sessionExpiresAt: new Date(Date.now()+3600000).toISOString() };
const item = { id: "00000000-0000-4000-8000-000000000002", userId: profile.id, cipherText: Buffer.from(ciphertext).toString("base64"), nonce: Buffer.from(nonce).toString("base64"), createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
const allocator = createServer(); await new Promise(resolve => allocator.listen(0, "127.0.0.1", resolve));
const port = allocator.address().port; await new Promise(resolve => allocator.close(resolve));
const url = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [fileURLToPath(new URL("../../../node_modules/next/dist/bin/next", import.meta.url)), "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: fileURLToPath(new URL("..", import.meta.url)), windowsHide: true, stdio: "ignore" });
let browser;
try {
  await expect(async () => { expect((await fetch(`${url}/login`)).status).toBe(200); }).toPass({ timeout: 30000 });
  const response = await fetch(`${url}/login`);
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  expect(response.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
  expect(response.headers.get("X-Powered-By")).toBeNull();
  expect(response.headers.get("Content-Security-Policy")).toMatch(/nonce-[A-Za-z0-9+/=]+/);
  expect(response.headers.get("Content-Security-Policy")).not.toContain("'unsafe-eval'");
  expect((await fetch(`${url}/login`)).headers.get("Content-Security-Policy")).not.toBe(response.headers.get("Content-Security-Policy"));
  console.log("PASS: production web security headers and per-response CSP nonce");
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(); const logs = []; const thirdParty = [];
  await context.route("http://localhost:3001/**", route => route.fulfill({ json: new URL(route.request().url()).pathname === "/vault" ? [item] : profile }));
  await context.route("https://**", route => { thirdParty.push(route.request().url()); return route.abort(); });
  const page = await context.newPage(); page.on("console", message => logs.push(message.text()));
  await context.route("http://localhost:3001/auth/login", route => route.fulfill({ status: 429, headers: { "Retry-After": "900" }, json: { error: "Too many requests" } }));
  // Inject into the delivered document. CDP page.evaluate has debugger
  // privileges and is unsuitable for proving normal CSP enforcement.
  await page.route(`${url}/login`, async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace("</head>", "<script>window.__blockedScript = 1</script></head>") });
  });
  await page.goto(`${url}/login`); await page.locator('#email').fill("fixture@example.com"); await page.locator('#password').fill("public-wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Too many sign-in attempts. Please wait and try again.", { exact: true })).toBeVisible();
  console.log("PASS: login displays throttling rather than reporting a wrong password");
  expect(await page.evaluate(() => window.__blockedScript)).toBeUndefined();
  console.log("PASS: an injected script without the CSP nonce cannot execute");
  await page.goto(`${url}/vault`);
  await page.getByLabel("Master password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Unlock Vault", exact: true }).click();
  await expect(page.getByText(payload, { exact: true })).toBeVisible();
  await expect(page.getByText(entry.username, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__securityXss)).toBeUndefined();
  expect(await page.locator('img[src="x"],svg[onload]').count()).toBe(0);
  expect(thirdParty).toEqual([]); expect(logs.join("\n")).not.toContain(entry.password);
  console.log("PASS: encrypted stored-XSS payloads render as text; no external vault favicon requests or password logs");
  await page.reload(); await expect(page.getByLabel("Master password", { exact: true })).toBeVisible();
  await page.getByLabel("Master password", { exact: true }).fill("wrong-public-fixture-password");
  await page.getByRole("button", { name: "Unlock Vault", exact: true }).click();
  await expect(page.getByLabel("Master password", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Credential" })).toHaveCount(0);
  console.log("PASS: wrong vault password never authorizes credential creation");
  await context.route("http://localhost:3001/security/sessions", route => route.fulfill({ json: [] }));
  await context.route("http://localhost:3001/auth/mfa/status", route => route.fulfill({ json: { enabled: false } }));
  let sentEmail;
  await context.route("http://localhost:3001/security/email-change", route => {
    sentEmail = route.request().postDataJSON();
    return route.fulfill({ status: 202, json: { message: "Fixture confirmation requested" } });
  });
  await page.goto(`${url}/account`);
  await page.getByLabel("Current account password", { exact: true }).fill("public-account-fixture");
  await page.getByLabel("New email address").fill("new@example.com");
  await page.getByRole("button", { name: "Confirm new email", exact: true }).click();
  await expect(page.getByText("Fixture confirmation requested", { exact: true })).toBeVisible();
  expect(sentEmail).toEqual({ password: "public-account-fixture", email: "new@example.com" });
  await expect(page.getByLabel("Current account password", { exact: true })).toHaveValue("");
  console.log("PASS: account security UI requests pending-email confirmation and clears reauthentication input");
  const publicToken = "a".repeat(64); let submittedToken;
  await context.route("http://localhost:3001/auth/verify-email", route => { submittedToken = route.request().postDataJSON().token; return route.fulfill({ json: { message: "Fixture verified" } }); });
  await page.goto(`${url}/verify-email#token=${publicToken}`);
  await expect(page.getByRole("heading", { name: "Email verified", exact: true })).toBeVisible();
  expect(submittedToken).toBe(publicToken); expect(page.url()).not.toContain(publicToken);
  console.log("PASS: fragment verification submits the captured token and removes it from the visible URL");
} finally { if (browser) await browser.close(); server.kill(); }
