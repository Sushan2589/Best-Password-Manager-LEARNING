import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", env: { NODE_ENV: "test", WEB_ORIGIN: "http://localhost:3000", EXTENSION_ORIGINS: "" }, include: ["tests/**/*.test.ts"], restoreMocks: true } });
