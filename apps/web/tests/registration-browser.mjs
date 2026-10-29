// Production registration UI checks with fixture-only API responses.
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
  await expect(async () => expect((await fetch(`${url}/register`)).status).toBe(200)).toPass({ timeout: 30000 });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  let registrationAttempts = 0;
  let registrationStatus = 400;
  await context.route(`${apiUrl}/auth/register`, route => {
    registrationAttempts++;
    return route.fulfill({ status: registrationStatus, json: { error: registrationStatus === 400
      ? "Choose a password that has not appeared in a breach." : "private-provider-diagnostics" } });
  });
  await page.goto(`${url}/register`);
  await page.locator('#username').fill("ab");
  await page.locator('#email').fill("fixture@example.com");
  await page.locator('#password').fill("public-registration-fixture");
  await page.locator('#confirmPassword').fill("public-registration-fixture");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("between 3 and 20");
  expect(registrationAttempts).toBe(0);
  await page.locator('#username').fill("fixture");
  for (const [status, message] of [[400, "data breach"], [429, "Too many registration attempts"], [503, "temporarily unavailable"], [500, "server error"]]) {
    registrationStatus = status;
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText(message);
    await expect(page.locator("form").getByRole("alert")).not.toContainText("private-provider-diagnostics");
  }
  console.log("PASS: registration uses /api, validates usernames and explains failures without exposing provider diagnostics");

} finally { await browser?.close(); server.kill(); }
