// Configuration ESLint partagée : le typage strict est la première ligne de défense,
// on interdit explicitement `any` pour que les contrats restent vérifiables.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.next/**", "**/coverage/**", "**/node_modules/**", "**/*.config.*", "**/next-env.d.ts", "**/public/sw.js", "**/drizzle/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-console": ["error", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
);
