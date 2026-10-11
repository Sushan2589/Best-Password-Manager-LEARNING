import { test, expect } from "./fixtures";

test("packaged login loads with strict CSP and accessible navigation", async ({ context, page, extensionId }, testInfo) => {
  await context.route("http://localhost:3001/user/me", route => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByRole("heading", { name: "Password Manager" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  expect(await page.locator("body").evaluate(element => element.getBoundingClientRect().width)).toBe(400);
  expect(await page.locator("#root").evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(600);
  await page.locator("#root").screenshot({ path: testInfo.outputPath("popup-login.png") });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Vault locking" })).toBeVisible();
  await page.getByRole("button", { name: "Generator", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Password generator" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("connection probe still returns a sanitized reachable status", async ({ context, page, extensionId }) => {
  await context.route("http://localhost:3001/user/me", route => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ secret: "must-not-render" }) }));
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Check connection", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Your password manager is reachable.");
  await expect(page.locator("body")).not.toContainText("must-not-render");
});
