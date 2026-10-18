// Explicit, read-only public-page compatibility checks. Never sign in or fill.
import { chromium } from "@playwright/test";
import { transformWithEsbuild } from "vite";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = await readFile(new URL("../src/content/forms.ts", import.meta.url), "utf8");
const compiled = await transformWithEsbuild(source, "forms.ts", { loader: "ts", format: "esm", target: "es2022" });
const { formOperation } = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`);
const sites = [
  ["Google", "https://accounts.google.com/ServiceLogin"],
  ["Facebook", "https://www.facebook.com/login/"],
  ["Instagram", "https://www.instagram.com/accounts/login/"],
  ["LinkedIn", "https://www.linkedin.com/login"],
  ["GitHub", "https://github.com/login"],
  ["Microsoft", "https://login.live.com/"],
  ["Vidya Nepal", "https://www.vidyanepal.tech/admin/login"],
];
const report = { checkedAt: new Date().toISOString(), scope: "Public top-document probe only; no extension, credentials, account submission or authenticated steps.", browsers: [] };
await Promise.all(["chrome", "msedge"].map(async channel => {
  const result = { channel, version: "", sites: [] };
  report.browsers.push(result);
  let browser;
  try {
    browser = await chromium.launch({ channel, headless: true });
    result.version = browser.version();
    const context = await browser.newContext({ locale: "en-US" });
    for (const [site, url] of sites) {
      const row = { site, requestedOrigin: new URL(url).origin, status: "not-checked", formKinds: [] };
      result.sites.push(row);
      const page = await context.newPage();
      let navigationError = false;
      try {
        const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => { navigationError = true; return null; });
        row.httpStatus = response?.status() ?? null;
        if (!page.url().startsWith("https://")) { row.status = "navigation-failed"; continue; }
        row.finalOrigin = new URL(page.url()).origin; // No query/token-bearing URLs in reports.
        await page.waitForLoadState("load", { timeout: 5000 }).catch(() => {});
        const session = await context.newCDPSession(page);
        const { frameTree } = await session.send("Page.getFrameTree");
        const { executionContextId } = await session.send("Page.createIsolatedWorld", { frameId: frameTree.frame.id, worldName: "password-manager-readonly-probe" });
        const probe = async () => {
          const evaluated = await session.send("Runtime.callFunctionOn", {
            executionContextId, functionDeclaration: formOperation.toString(),
            arguments: [{ value: { mode: "probe", origin: row.finalOrigin } }], returnByValue: true,
          });
          if (evaluated.exceptionDetails) throw new Error("Probe failed");
          return evaluated.result.value;
        };
        let detected;
        // Allow late-rendered forms to settle without interacting with the page.
        for (let attempt = 0; attempt < 10; attempt++) {
          detected = await probe();
          if (detected?.ok && detected.forms?.length) break;
          await page.waitForTimeout(500);
        }
        const signals = await page.evaluate(() => ({
          challenge: /verify you are human|unusual traffic|automated queries|access denied|checking your browser|temporarily blocked/i.test(document.body?.innerText ?? ""),
          visiblePasswordFields: [...document.querySelectorAll('input[type="password"]')].filter(input => input.getClientRects().length > 0).length,
          childFrameCount: document.querySelectorAll("iframe").length,
        }));
        row.formKinds = detected?.ok ? detected.forms.map(form => form.label.replace(/ \d+$/, "")) : [];
        row.formCount = row.formKinds.length;
        Object.assign(row, signals);
        row.navigationTimedOut = navigationError;
        row.status = signals.challenge || (row.httpStatus && row.httpStatus >= 400) ? "blocked-or-challenged"
          : row.finalOrigin !== row.requestedOrigin ? "redirected-origin-review-required"
          : row.formCount ? "public-form-detected" : navigationError ? "navigation-incomplete" : "no-supported-public-form";
        await session.detach();
      } catch { row.status = "probe-unavailable"; }
      finally {
        await page.close();
        console.log(`${channel}: ${site}: ${row.status}${row.formKinds.length ? ` (${row.formKinds.join(", ")})` : ""}`);
      }
    }
    await context.close();
  } catch { result.launchStatus = "browser-unavailable"; }
  finally { await browser?.close(); }
}));
report.browsers.sort((a, b) => a.channel.localeCompare(b.channel));
const output = new URL("../test-results/live-site-probes.json", import.meta.url);
await mkdir(new URL("../test-results/", import.meta.url), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Public-page report: ${fileURLToPath(output)}`);
