import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // NFR3: No bare catch {} without // IGNORE: comment
      'no-empty': ['error', { allowEmptyCatch: false }],
      // Warn on unused vars — will be promoted to error in a future story
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // Disable rules that conflict with existing codebase patterns
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      'no-control-regex': 'off',
      'no-useless-assignment': 'off',
      'prefer-const': 'warn',
      'no-regex-spaces': 'warn',
    },
  },
  // Relax rules in test files — test helpers often import unused symbols
  // for mock setup or future use
  {
    files: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', 'ralph/', '_bmad/', '_bmad-output/', 'docs/', 'templates/'],
  },
);
