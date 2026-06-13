const baseConfig = require("@mymakaranta/config/eslint");

module.exports = [
  ...baseConfig,
  {
    rules: {
      // NestJS uses decorators heavily — relax rules that fire on decorator patterns
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "warn",
    },
  },
  { ignores: ["node_modules", "dist", "**/*.config.js", "prisma/**"] },
];
