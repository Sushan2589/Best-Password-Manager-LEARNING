import { performance } from "node:perf_hooks";
// Production vault onboarding UI checks with fixture-only API responses.
import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
const allocator = createServer();
await new Promise((resolve) => allocator.listen(0, "127.0.0.1", resolve));
const port = allocator.address().port;
await new Promise((resolve) => allocator.close(resolve));
const url = `http://127.0.0.1:${port}`;
const apiUrl = process.env.TEST_API_URL ?? `${url}/api`;
const server = spawn(
  process.execPath,
  [
    fileURLToPath(
      new URL("../../../node_modules/next/dist/bin/next", import.meta.url),
    ),
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    windowsHide: true,
    stdio: "ignore",
  },
);
let browser;
try {
  await expect(async () =>
    expect((await fetch(`${url}/vault`)).status).toBe(200),
  ).toPass({ timeout: 30000 });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: url,
  });
  const page = await context.newPage();
  const profile = {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Fixture",
    email: "fixture@example.com",
    emailVerified: true,
    vaultSalt: globalThis.btoa("0123456789abcdef"),
    sessionExpiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
  let items = [];
  let failVault = false;
  let conflict = false;
  let writes = 0;
  await context.route(`${apiUrl}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/vault/setup")) {
      writes++;
      const verifier = route.request().postDataJSON();
      expect(JSON.stringify(verifier)).not.toContain(
        "public-new-vault-password",
      );
      expect(JSON.stringify(verifier)).not.toContain("fixture-10");
      profile.vaultVerifierCipher = verifier.cipherText;
      profile.vaultVerifierNonce = verifier.nonce;
      return route.fulfill({ status: 201, json: { ok: true } });
    }
    if (path.endsWith("/vault") && route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(Object.keys(body).sort()).toEqual(["cipherText", "nonce"]);
      items.push({
        id: "00000000-0000-4000-8000-000000000002",
        userId: profile.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...body,
      });
      return route.fulfill({ status: 201, json: items[0] });
    }
    if (path.includes("/vault/00000000")) {
      if (route.request().method() === "PATCH") {
        if (conflict)
          return route.fulfill({ status: 409, json: { error: "Conflict" } });
        const body = route.request().postDataJSON();
        expect(body.expectedCipherText).toBe(items[0].cipherText);
        expect(JSON.stringify(body)).not.toContain("public-credential-fixture");
        items[0] = {
          ...items[0],
          cipherText: body.cipherText,
          nonce: body.nonce,
          updatedAt: new Date().toISOString(),
        };
      }
      return route.fulfill({ json: items[0] });
    }
    if (path.endsWith("/vault"))
      return route.fulfill({ status: failVault ? 503 : 200, json: items });
    return route.fulfill({ json: profile });
  });
  await page.goto(`${url}/vault`);
  await page
    .getByLabel("New vault password", { exact: true })
    .fill("public-new-vault-password");
  await page
    .getByLabel("Confirm vault password", { exact: true })
    .fill("public-new-vault-password");
  await page.getByRole("button", { name: "Create vault", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your credentials, secured." }),
  ).toBeVisible({ timeout: 30000 });
  expect(writes).toBe(1);
  await page.getByRole("button", { name: "Add Credential" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Feedback fixture");
  await page.locator('input[name="username"]').fill("fixture@example.com");
  await page
    .locator('input[name="password"]')
    .fill("public-credential-fixture");
  await expect(
    page.locator('input[name="folder"],input[name="tags"]'),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Save Credential", exact: true })
    .click();
  const card = page.locator("article").filter({ hasText: "Feedback fixture" });
  await expect(card).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: "Vault sections" }).getByRole("button"),
  ).toHaveCount(3);
  await expect(page.getByText("Soon", { exact: true })).toHaveCount(0);
  conflict = true;
  await card.getByRole("button", { name: "Add favorite", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Credential changed" }),
  ).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Add favorite", exact: true }),
  ).toBeEnabled();
  conflict = false;
  await card.getByRole("button", { name: "Add favorite", exact: true }).click();
  await expect(
    card.getByRole("button", { name: "Remove favorite", exact: true }),
  ).toBeEnabled();
  if (process.env.UI_SCREENSHOT) {
    await page.screenshot({ path: process.env.UI_SCREENSHOT, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: process.env.UI_SCREENSHOT.replace(".png", "-mobile.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 720 });
  }
  await card
    .getByRole("button", { name: "Feedback fixture", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Feedback fixture" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText("public-credential-fixture", { exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Reveal password" }).click();
  await expect(
    dialog.getByText("public-credential-fixture", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Copy password", exact: true })
    .click();
  await expect(
    dialog.getByRole("status").filter({ hasText: "Copied" }),
  ).toHaveCount(1);
  expect(
    await page.evaluate(() => globalThis.navigator.clipboard.readText()),
  ).toBe("public-credential-fixture");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.keyboard.press("/");
  await expect(
    page.getByRole("textbox", { name: "Search your vault" }),
  ).toBeFocused();
  await page
    .getByRole("textbox", { name: "Search your vault" })
    .fill("missing fixture");
  await expect(card).toHaveCount(0);
  await page.getByRole("textbox", { name: "Search your vault" }).fill("");
  await card.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Move to Trash", exact: true })
    .click();
  await expect(card).toHaveCount(0);
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await expect(card).toBeVisible();
  await card
    .getByRole("button", { name: "Feedback fixture", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Restore from Trash", exact: true })
    .click();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  await page.locator('input[name="password"]').fill("public-edited-fixture");
  await page.locator('textarea[name="notes"]').fill("Added after the original version");
  await page.getByRole("button", { name: "Save Changes", exact: true }).click();
  await expect(card).toBeVisible();
  await card
    .getByRole("button", { name: "Feedback fixture", exact: true })
    .click();
  await page.getByText("Previous versions (1)", { exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Restore version", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await card
    .getByRole("button", { name: "Feedback fixture", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reveal password", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByText("public-credential-fixture", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog").getByText("Added after the original version",{exact:true})).toHaveCount(0);
  await page.keyboard.press("Escape");
  if (process.env.VAULT_BENCHMARK === "1") {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    const template = items[0];
    const results = [];
    for (const count of [10, 100, 1000, 5000]) {
      items = Array.from({ length: count }, (_, index) => ({
        ...template,
        id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
      }));
      await page.reload();
      await page
        .getByLabel("Master password", { exact: true })
        .fill("public-new-vault-password");
      const start = performance.now();
      await page
        .getByRole("button", { name: "Unlock Vault", exact: true })
        .click();
      await expect(page.locator("article")).toHaveCount(Math.min(count, 60), {
        timeout: 120000,
      });
      const loadMs = performance.now() - start;
      const searchStart = performance.now();
      await page
        .getByRole("textbox", { name: "Search your vault" })
        .fill("no benchmark matches");
      await expect(page.locator("article")).toHaveCount(0, { timeout: 30000 });
      const searchMs = performance.now() - searchStart;
      const metrics = await cdp.send("Performance.getMetrics");
      results.push({
        count,
        renderedCards: Math.min(count, 60),
        unlockFetchDecryptRenderMs: Math.round(loadMs),
        searchAndRenderMs: Math.round(searchMs),
        heapBytes:
          metrics.metrics.find((metric) => metric.name === "JSHeapUsedSize")
            ?.value ?? null,
      });
    }
    console.log("BENCHMARK " + JSON.stringify(results));
  }
  console.log(
    "PASS: uncluttered cards, encrypted saves, favorite rollback/success, details, Escape and search shortcut",
  );
} finally {
  await browser?.close();
  server.kill();
}
