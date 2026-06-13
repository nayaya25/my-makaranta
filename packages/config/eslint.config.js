const js = require("@eslint/js");
const tseslint = require("typescript-eslint");

/** Shared flat ESLint config. Apps/packages extend this array. */
module.exports = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  { ignores: ["node_modules", "dist", ".next", "coverage", "**/*.config.js"] },
];
