module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['dist', 'node_modules', 'playwright-report', 'test-results'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn'
  }
};
