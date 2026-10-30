import { createRequire } from "node:module";
const require = createRequire(
  new URL("./apps/web/package.json", import.meta.url),
);
const eslint = require("@eslint/js");
const tseslint = require("typescript-eslint");
const angular = require("angular-eslint");

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.angular/**",
      "**/dist/**",
      ".local/**",
      "deliverables/**",
    ],
  },
  {
    files: ["apps/**/*.ts", "packages/**/*.ts"],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          ignoreRestSiblings: true,
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["apps/web/src/**/*.ts"],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
  },
  {
    files: ["apps/web/src/**/*.html"],
    extends: [
      ...angular.configs.templateRecommended,
      ...angular.configs.templateAccessibility,
    ],
  },
);
