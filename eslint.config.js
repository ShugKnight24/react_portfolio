import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import prettier from 'eslint-config-prettier/flat';
import importPlugin from 'eslint-plugin-import';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  {
    ignores: [
      'build/',
      'archive/',
      'experiments/',
      'src/vendor/',
      'riso-exports/',
      'node_modules/',
      '.vite/',
      '.astro/',
      '.playwright-mcp/',
      'public/',
      'design/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs['flat/recommended'],
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  reactHooks.configs.flat.recommended,
  jsxA11y.flatConfigs.recommended,
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    settings: {
      react: { version: '19.2' },
      'import/resolver': {
        typescript: { project: './tsconfig.json' },
        node: true,
      },
    },
    rules: {
      // TypeScript already reports unresolved imports and undefined names
      'import/no-unresolved': 'off',
      'import/named': 'off',
      'no-undef': 'off',
      'react/prop-types': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['*.config.{js,ts}', 'tests/**', '**/*.test.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.vitest },
    },
  },
  prettier,
];
