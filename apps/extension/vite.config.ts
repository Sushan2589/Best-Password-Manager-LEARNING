import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createManifest } from "./manifest";
import { resolveApiOrigin } from "./src/config/origin";

export default defineConfig(({ mode }) => {
  const root = fileURLToPath(new URL(".", import.meta.url));
  const env = loadEnv(mode, root, "VITE_");
  const origin = resolveApiOrigin(env.VITE_API_ORIGIN, mode === "development");
  return {
    root,
    base: "./",
    define: { "import.meta.env.VITE_API_ORIGIN": JSON.stringify(origin) },
    plugins: [react(), tailwindcss(), {
      name: "extension-manifest",
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "manifest.json", source: JSON.stringify(createManifest(origin), null, 2) });
      },
    }],
    worker: { format: "es" },
    build: {
      target: "chrome120",
      sourcemap: false,
      rollupOptions: {
        input: { popup: fileURLToPath(new URL("popup.html", import.meta.url)), offscreen: fileURLToPath(new URL("offscreen.html", import.meta.url)),
          fill: fileURLToPath(new URL("fill.html", import.meta.url)), inline: fileURLToPath(new URL("src/content/inline.ts", import.meta.url)),
          background: fileURLToPath(new URL("src/background/index.ts", import.meta.url)) },
        output: { entryFileNames: "[name].js", chunkFileNames: "assets/[name]-[hash].js", assetFileNames: "assets/[name]-[hash][extname]" },
      },
    },
  };
});
