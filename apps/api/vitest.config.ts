import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", maxWorkers: 2, env: { NODE_ENV: "test", WEB_ORIGIN: "http://localhost:3000", EXTENSION_ORIGINS: "", ARCJET_MODE: "OFF", ARCJET_KEY: "", ARCJET_IDENTITY_KEY: "" }, include: ["tests/**/*.test.ts"], restoreMocks: true } });
