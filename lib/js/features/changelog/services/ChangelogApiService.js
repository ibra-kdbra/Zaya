/**
 * Changelog source loader
 * Reads CHANGELOG.md from the same origin. No third-party calls.
 */

import { CHANGELOG_PATH } from '../utils/ChangelogConfig.js';

export class ChangelogApiService {
  /**
   * Fetch the raw markdown of CHANGELOG.md.
   * @returns {Promise<string>} The document text.
   * @throws {Error} When the file cannot be read.
   */
  static async fetchChangelog() {
    const response = await fetch(CHANGELOG_PATH, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`CHANGELOG.md responded with ${response.status}`);
    }
    return response.text();
  }
}
