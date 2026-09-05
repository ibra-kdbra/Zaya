/**
 * Changelog configuration
 * Everything the changelog page needs to know about the shape of CHANGELOG.md.
 */

/** Path of the source document, relative to the page. */
export const CHANGELOG_PATH = 'CHANGELOG.md';

/** Repository the `#123` issue references point at. */
export const ISSUE_URL_BASE = 'https://github.com/ibra-kdbra/Zaya/issues/';

/** Keep a Changelog groups, in the order they should be rendered. */
export const GROUP_ORDER = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'];

/** Modifier suffix used for the group label colour class (`cl-group--added`, …). */
export const GROUP_MODIFIERS = {
  Added: 'added',
  Changed: 'changed',
  Deprecated: 'deprecated',
  Removed: 'removed',
  Fixed: 'fixed',
  Security: 'security'
};

/** Heading of the section that holds not-yet-released work. */
export const UNRELEASED_LABEL = 'Unreleased';

/** Element ids the renderer writes into. */
export const SELECTORS = {
  version: 'currentVersion',
  releases: 'releaseList',
  index: 'versionIndex',
  indexSelect: 'versionSelect',
  loading: 'loadingState',
  error: 'errorState'
};

/** Shown when CHANGELOG.md cannot be read (for example over `file://`). */
export const FALLBACK_MESSAGE =
  'The changelog could not be loaded. Open this page over http(s) so CHANGELOG.md can be fetched.';
