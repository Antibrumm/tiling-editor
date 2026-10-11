import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['dist/**', 'node_modules/**', '.vitest/**']),
  {
    files: ['src/**/*.{ts,tsx}', '*.config.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['*.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['tests/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['tests/**/*.js', 'scripts/**/*.mjs', '*.config.js', '*.cjs'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
