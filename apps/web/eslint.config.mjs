import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import react from "eslint-plugin-react";
import hooks from "eslint-plugin-react-hooks";
export default [
  { ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"] },
  js.configs.recommended,
  { files: ["**/*.mjs"], languageOptions: { globals: Object.fromEntries(["URL", "Buffer", "TextEncoder", "process", "fetch", "console", "window", "document"].map(name => [name, "readonly"])) } },
  { files: ["**/*.{ts,tsx}"], languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { "@typescript-eslint": tsPlugin, react, "react-hooks": hooks },
    settings: { react: { version: "detect" } },
    rules: { ...tsPlugin.configs.recommended.rules, ...hooks.configs.recommended.rules, "no-undef": "off", "no-unused-vars": "off", "react/no-danger": "error" } },
];
