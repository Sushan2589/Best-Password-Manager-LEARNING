import { test, expect } from "./fixtures";
test("generator validates options, copies explicitly, and drops output when leaving", async ({ context, page, extensionId }) => {
  await context.route("http://localhost:3001/**", route => route.fulfill({ status: 401, json: {} }));
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByRole("button", { name: "Generator", exact: true }).click();
  await page.getByLabel("Password length", { exact: true }).fill("32");
  await page.getByLabel("Uppercase", { exact: true }).uncheck(); await page.getByLabel("Numbers", { exact: true }).uncheck(); await page.getByLabel("Symbols", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Generate password", exact: true }).click();
  await expect(page.locator("#generated-password")).toHaveText(/^[a-z]{32}$/);
  await page.evaluate(() => Object.defineProperty(navigator.clipboard, "writeText", { value: async () => {}, configurable: true }));
  await page.getByRole("button", { name: "Copy generated password", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Generated password copied." })).toHaveText("Generated password copied.");
  await page.getByLabel("Lowercase", { exact: true }).uncheck();
  await expect(page.getByRole("button", { name: "Generate password", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Copy generated password", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Vault", exact: true }).click(); await page.getByRole("button", { name: "Generator", exact: true }).click();
  await expect(page.locator("#generated-password")).toHaveText("Choose your options and generate.");
});
