import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', '.nyc_output', 'playwright-report', 'test-results'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // New rules from eslint-plugin-react-hooks v7 — set to warn to allow gradual migration
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/no-unnecessary-deps': 'warn',
      // New rule from @eslint/js v10 recommended — set to warn for existing code
      'no-useless-assignment': 'warn',
    },
  },
  // E2e tests: disable React hook rules (Playwright uses 'use' as a fixture callback, not a React hook)
  {
    files: ['e2e/**/*.{ts,tsx}', 'e2e-pipeline-test.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'no-useless-assignment': 'warn',
    },
  },
)
