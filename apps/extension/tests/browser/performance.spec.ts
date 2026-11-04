import { test, expect } from "./fixtures";
import fixture from "../fixtures/legacy-vault.json" with { type: "json" };
test("vault performance stays searchable at 10 to 5000 entries", async ({
  context,
  page,
  extensionId,
}, testInfo) => {
  test.setTimeout(120000);
  const profile = {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Fixture",
    email: "fixture@example.com",
    emailVerified: true,
    sessionExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    vaultSalt: fixture.salt,
  };
  let items: Array<{
    id: string;
    userId: string;
    cipherText: string;
    nonce: string;
    createdAt: string;
    updatedAt: string;
  }> = [];
  await context.route("http://localhost:3001/**", (route) =>
    route.fulfill({
      json: route.request().url().endsWith("/vault") ? items : profile,
    }),
  );
  const results = [];
  for (const count of [10, 100, 1000, 5000]) {
    items = Array.from({ length: count }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
      userId: profile.id,
      cipherText: fixture.cipherText,
      nonce: fixture.nonce,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }));
    const openStart = performance.now();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(
      page.getByRole("heading", { name: "Your vault is locked" }),
    ).toBeVisible();
    const openMs = performance.now() - openStart;
    await page
      .getByLabel("Vault password", { exact: true })
      .fill(fixture.password);
    const unlockStart = performance.now();
    await page
      .getByRole("button", { name: "Unlock vault", exact: true })
      .click();
    await expect(
      page.getByRole("list", { name: "Saved credentials" }).locator("li"),
    ).toHaveCount(Math.min(count, 60), { timeout: 60000 });
    const unlockMs = performance.now() - unlockStart;
    const searchStart = performance.now();
    await page
      .getByLabel("Search credentials", { exact: true })
      .fill("no performance fixture matches");
    await expect(
      page.getByRole("list", { name: "Saved credentials" }),
    ).toHaveCount(0);
    const searchMs = performance.now() - searchStart;
    results.push({
      count,
      rendered: Math.min(count, 60),
      openMs: Math.round(openMs),
      unlockMs: Math.round(unlockMs),
      searchMs: Math.round(searchMs),
    });
    await page.getByRole("button", { name: "Lock vault", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Your vault is locked" }),
    ).toBeVisible();
  }
  testInfo.annotations.push({
    type: "performance",
    description: JSON.stringify(results),
  });
  console.log("POPUP_BENCHMARK " + JSON.stringify(results));
});
