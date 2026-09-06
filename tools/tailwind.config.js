/** Tailwind is precompiled into lib/css/vendor/tailwind.css (npm run build:css); the play CDN is no longer used. */
const { join } = require('node:path');
const ROOT = join(__dirname, '..');

module.exports = {
  content: [join(ROOT, 'index.html'), join(ROOT, 'changelog.html'), join(ROOT, 'lib/js/**/*.js')],
  theme: { extend: {} },
  corePlugins: { preflight: true },
  plugins: []
};
