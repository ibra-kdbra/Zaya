import globals from 'globals';

const shared = {
  ecmaVersion: 2022,
  globals: {
    ...globals.browser,
    ...globals.jquery,
    Toastify: 'readonly',
    THREE: 'readonly',
    MOCKUP: 'readonly',
    pdfjsLib: 'readonly',
    DFLIP: 'writable',
    appState: 'writable',
    ValidationUtils: 'readonly',
    themeManager: 'writable',
    flipbookInstance: 'writable',
    loadFlipbook: 'readonly',
    getLastPage: 'readonly',
    saveLastPage: 'readonly',
    updateCurrentPdfContext: 'readonly'
  }
};

const rules = {
  'no-undef': 'off',            // globals are wired through the ordered loader in lib/js/app.js
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-prototype-builtins': 'off',
  'no-useless-escape': 'off',
  'no-cond-assign': 'off',
  'no-fallthrough': 'off',
  'no-redeclare': 'off',
  'no-var': 'off'
};

export default [
  {
    ignores: ['vendor/**', '**/*.min.js', '**/*.bak', 'lib/js/features/changelog/changelog.bundle.js', 'node_modules/**', 'playwright-report/**', 'test-results/**']
  },
  {
    files: ['lib/js/**/*.js', 'sw.js'],
    languageOptions: { ...shared, sourceType: 'script' },
    rules
  },
  {
    files: ['engine/**/*.js', 'lib/js/features/themes/**/*.js', 'lib/js/features/quotes/**/*.js',
      'lib/js/features/changelog/**/*.js', 'lib/js/features/search/**/*.js', 'lib/js/features/settings/**/*.js', 'lib/js/pro-features/**/*.js'],
    languageOptions: { ...shared, sourceType: 'module' },
    rules
  },
  {
    files: ['sw.js'],
    languageOptions: { ...shared, globals: { ...globals.serviceworker }, sourceType: 'script' },
    rules
  },
  {
    files: ['tools/**/*.mjs', 'tools/*.js', 'tests/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node } },
    rules
  }
];
