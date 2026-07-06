// @ts-check
import nextPlugin from '@next/eslint-plugin-next';
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// NOTE: eslint-config-next@16 is deliberately NOT used — its bundled Babel parser and
// eslint-plugin-react@7 both crash under ESLint 10 (removed context.getFilename() /
// new ScopeManager.addGlobals() APIs). Next rules come from @next/eslint-plugin-next
// directly (ESLint-10-clean) + eslint-plugin-react-hooks v7. Revisit once eslint-config-next
// ships real ESLint 10 support.

export default defineConfig([
  globalIgnores([
    '.next/**',
    'out/**',
    'dist/**',
    'next-env.d.ts',
    'drizzle/**', // generated migrations + meta — drizzle-kit owns these
    'data/**', // private financial data (git-ignored)
  ]),

  js.configs.recommended,

  nextPlugin.configs['core-web-vitals'],
  reactHooks.configs.flat.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.config.ts', 'scripts/*.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // House rules (global CLAUDE.md TS bans), mechanized as errors.
      '@typescript-eslint/no-explicit-any': 'error',
      // `as const` is always permitted by this rule — only `as T` casts are banned.
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': true, 'ts-ignore': true, 'ts-nocheck': true, 'ts-check': false },
      ],
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  // Must be last: disables stylistic rules that would conflict with Prettier.
  prettier,
]);
