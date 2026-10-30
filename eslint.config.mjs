import { createRequire } from 'node:module';
const require = createRequire(new URL('./apps/web/package.json', import.meta.url));
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const prettier = require('eslint-config-prettier/flat');
const importSort = require('eslint-plugin-simple-import-sort');
const globals = require('globals');

export default tseslint.config(
  {
    files: ['**/*.mjs', '**/*.cjs'],
    extends: [eslint.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    ignores: ['**/node_modules/**', '**/.angular/**', '**/dist/**', '.local/**', 'deliverables/**'],
  },
  {
    files: ['apps/**/*.ts', 'packages/**/*.ts'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: { project: './tsconfig.eslint.json', tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'simple-import-sort': importSort },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-var': 'error',
      'no-nested-ternary': 'error',
      'no-param-reassign': 'error',
      'no-else-return': 'error',
      '@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'explicit' }],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/member-ordering': [
        'error',
        {
          default: [
            'signature',
            'field',
            'constructor',
            'public-method',
            'protected-method',
            'private-method',
          ],
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          ignoreRestSiblings: true,
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['apps/web/src/**/*.ts'],
    languageOptions: {
      parserOptions: { project: ['./apps/web/tsconfig.app.json', './apps/web/tsconfig.spec.json'] },
    },
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
  },
  {
    files: ['apps/web/src/**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },
  {
    files: ['apps/api/src/**/*.ts', 'apps/web/src/**/*.ts', 'packages/domain/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
    },
  },
  {
    files: ['apps/api/**/*.ts'],
    languageOptions: { parserOptions: { project: './apps/api/tsconfig.json' } },
  },
  {
    files: ['packages/automation/**/*.ts'],
    languageOptions: { parserOptions: { project: './packages/automation/tsconfig.json' } },
  },
  prettier,
  { files: ['apps/**/*.ts', 'packages/**/*.ts'], rules: { curly: ['error', 'all'] } },
);
