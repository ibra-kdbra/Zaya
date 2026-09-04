/** Tailwind is precompiled into lib/css/vendor/tailwind.css (npm run build:css); the play CDN is no longer used. */
module.exports = {
  content: ['./index.html', './changelog.html', './lib/js/**/*.js', '!./lib/js/libs/**'],
  theme: { extend: {} },
  corePlugins: { preflight: true },
  plugins: []
};
