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
    'public/**', // static assets served verbatim (e.g. sw.js — a hand-written worker with worker globals)
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
          // scripts/*.ts is NOT listed here: tsconfig.json includes it, and typescript-eslint
          // errors when a file is both in a project and in allowDefaultProject.
          allowDefaultProject: ['*.config.ts'],
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

  {
    // Standalone Node scripts (npm script hooks, not part of the app bundle): need the Node
    // globals that browser/worker code doesn't get.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly' },
    },
  },

  {
    // Server Action modules ('use server'): Next.js requires every exported function to be
    // `async` so it can compile the file into server-only RPC endpoints, but this codebase's
    // actions wrap synchronous better-sqlite3 calls with no `await` of their own — so
    // require-await would flag every action. The `async` keyword here is a Next.js contract,
    // not a signal of missing awaits.
    files: ['**/actions.ts'],
    rules: {
      '@typescript-eslint/require-await': 'off',
    },
  },

  // Must be last: disables stylistic rules that would conflict with Prettier.
  prettier,
]);
