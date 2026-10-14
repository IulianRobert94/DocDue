// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      "android/*", "ios/*", "dist/*", ".expo/*",
      "docs/*", "releases/*", "WebsiteDocDue*/**", "SS/*",
      "create_presentation.py",
      // Widget scaffolding for a future release — its packages aren't
      // installed yet (also excluded from tsconfig)
      "src/widgets/**",
    ],
  },
  {
    // Tests mock modules before importing and re-require after
    // jest.resetModules() on purpose
    files: ["src/__tests__/**"],
    rules: {
      "import/first": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);
