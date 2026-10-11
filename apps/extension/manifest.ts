import { EXTENSION_PUBLIC_KEY } from "../../config/extension-identity";

export function createManifest(apiOrigin: string) {
  return {
    manifest_version: 3,
    key: EXTENSION_PUBLIC_KEY,
    name: "Password Manager",
    version: "0.1.0",
    description: "Your personal password manager, close at hand.",
    minimum_chrome_version: "120",
    action: { default_popup: "popup.html", default_title: "Password Manager" },
    background: { service_worker: "background.js", type: "module" },
    permissions: ["activeTab"],
    // Chrome host match patterns cannot restrict ports. Runtime fetches and CSP do.
    host_permissions: [`${new URL(apiOrigin).protocol}//${new URL(apiOrigin).hostname}/*`],
    content_security_policy: {
      extension_pages: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; connect-src ${apiOrigin}; img-src 'self' data:; style-src 'self'; base-uri 'none'; frame-ancestors 'none';`,
    },
  };
}
