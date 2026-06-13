const baseConfig = require("@mymakaranta/config/eslint");

module.exports = [
  ...baseConfig,
  {
    rules: {
      // Relax rules that are noisy for a React UI library
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
    },
  },
  { ignores: ["node_modules", "dist", "storybook-static", "**/*.config.*", "**/*.cjs"] },
];
