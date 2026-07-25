/**
 * Changelog Renderer
 * Handles all DOM manipulation and rendering operations
 */

import { CATEGORY_ICONS } from '../utils/ChangelogConfig.js';
import { ChangelogUtils } from '../utils/ChangelogUtils.js';

export class ChangelogRenderer {
  /**
   * Update version display elements
   * @param {string} version - Version string to display
   */
  static updateVersion(version) {
    // console.log('updateVersion called with:', version);
    const versionElements = ['currentVersion', 'footerVersion'];
    versionElements.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        // console.log('Found element:', id, 'setting to:', version || 'Unknown');
        element.textContent = version || 'Unknown';
      } else {
        // console.log('Element not found:', id);
      }
    });
  }

  /**
   * Update date display elements
   * @param {string} dateString - Date string to display
   */
  static updateDate(dateString) {
    const dateElement = document.getElementById('latestDate');
    if (dateElement) {
      dateElement.textContent = ChangelogUtils.formatDate(dateString);
    }
  }

  /**
   * Update commit count display elements
   * @param {number} count - Commit count to display
   */
  static updateCommitCount(count) {
    const commitElement = document.getElementById('commitCount');
    if (commitElement) {
      commitElement.textContent = ChangelogUtils.formatCommitCount(count);
    }

    const footerCommitsSpan = document.querySelector('#footerStatsCommits');
    if (footerCommitsSpan) {
      footerCommitsSpan.textContent = `${count}+`;
    }
  }

  /**
   * Update footer date display
   * @param {string} dateString - Date string to display
   */
  static updateFooterDate(dateString) {
    const footerDateSpan = document.querySelector('#footerStatsDate');
    if (footerDateSpan) {
      footerDateSpan.textContent = dateString ? ChangelogUtils.formatDate(dateString, false) : 'Unknown';
    }
  }

  /**
   * Render the entire changelog content
   * @param {Object} data - Parsed changelog data
   */
  static renderChangelog(data = {}) {
    // Hide loading state unconditionally first
    const loadingState = document.getElementById('loadingState');
    if (loadingState) {
      loadingState.style.display = 'none';
    }

    try {
      // Render each section safely with fallbacks
      this.renderRecentUpdates(data?.recent || []);
      this.renderFeatures(data?.features || {});
      this.renderTechnicalImprovements(data?.technical || {});
      this.renderBugFixes(data?.bugfixes || {});
      this.renderNotes(data?.notes || []);
      this.renderVersionTimeline(data?.versions || []);

      // Configure marked options if available
      ChangelogUtils.configureMarked();
    } catch (err) {
      console.error('Error during ChangelogRenderer rendering:', err);
    }
  }

  /**
   * Render recent updates section
   * @param {Array} recent - Recent updates data
   */
  /**
   * Render recent updates section with enhanced design
   * @param {Array} recent - Recent updates data
   */
  static renderRecentUpdates(recent) {
    const container = document.getElementById('recentUpdates');

    if (!container) return;

    if (!recent || recent.length === 0) {
      container.innerHTML = '<p class="text-[#8b949e] italic text-xs">No recent commits logged.</p>';
      return;
    }

    container.innerHTML = recent.map(update => `
      <div class="flex items-start justify-between p-3.5 bg-[#161b22] border border-[#30363d] rounded-md hover:border-[#8b949e] transition-colors">
        <div class="flex items-center space-x-3 min-w-0">
          <code class="px-2 py-0.5 bg-[#21262d] text-[#58a6ff] rounded font-mono text-xs border border-[#30363d] flex-shrink-0">${update.hash.substring(0, 8)}</code>
          <p class="text-xs text-gray-200 truncate">${update.message}</p>
        </div>
        <span class="text-[11px] font-mono text-[#8b949e] flex-shrink-0 ml-3">${update.time}</span>
      </div>
    `).join('');
  }

  static renderFeatures(features) {
    const container = document.getElementById('featuresGrid');

    if (!container) return;

    if (!features || features.length === 0) {
      container.innerHTML = '<p class="text-[#8b949e] text-xs col-span-full">No features available.</p>';
      return;
    }

    container.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';

    container.innerHTML = Object.entries(features).map(([subsectionName, items]) => {
      const config = CATEGORY_ICONS[subsectionName] || { icon: 'fa-star', color: 'emerald' };

      return `
        <div class="bg-[#161b22] border border-[#30363d] rounded-lg p-5 flex flex-col justify-between hover:border-[#8b949e] transition-all">
          <div>
            <div class="flex items-center justify-between mb-4 pb-3 border-b border-[#21262d]">
              <div class="flex items-center space-x-2.5">
                <i class="fas ${config.icon} text-[#3fb950] text-sm"></i>
                <h3 class="text-sm font-semibold text-white">${subsectionName}</h3>
              </div>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-[#21262d] text-[#8b949e] border border-[#30363d]">${items.length} items</span>
            </div>

            <div class="space-y-3">
              ${items.map(item => `
                <div class="p-2.5 rounded bg-[#0d1117] border border-[#21262d]">
                  <h4 class="text-xs font-semibold text-gray-200 mb-1">${ChangelogUtils.renderMarkdown(item.title)}</h4>
                  <p class="text-xs text-[#8b949e] leading-relaxed">${ChangelogUtils.renderMarkdown(item.description)}</p>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  static renderTechnicalImprovements(technical) {
    const container = document.getElementById('technicalImprovements');

    if (!container) return;

    if (!technical || technical.length === 0) {
      container.innerHTML = '<p class="text-[#8b949e] text-xs">No technical improvements available.</p>';
      return;
    }

    container.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';

    container.innerHTML = Object.entries(technical).map(([subsectionName, items]) => {
      const config = CATEGORY_ICONS[subsectionName] || { icon: 'fa-cogs', color: 'purple' };

      return `
        <div class="bg-[#161b22] border border-[#30363d] rounded-lg p-5 flex flex-col justify-between hover:border-[#8b949e] transition-all">
          <div>
            <div class="flex items-center justify-between mb-4 pb-3 border-b border-[#21262d]">
              <div class="flex items-center space-x-2.5">
                <i class="fas ${config.icon} text-[#bc8cff] text-sm"></i>
                <h3 class="text-sm font-semibold text-white">${subsectionName}</h3>
              </div>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-[#21262d] text-[#8b949e] border border-[#30363d]">${items.length} items</span>
            </div>

            <div class="space-y-3">
              ${items.map(item => `
                <div class="p-2.5 rounded bg-[#0d1117] border border-[#21262d]">
                  <h4 class="text-xs font-semibold text-gray-200 mb-1">${ChangelogUtils.renderMarkdown(item.title)}</h4>
                  <p class="text-xs text-[#8b949e] leading-relaxed">${ChangelogUtils.renderMarkdown(item.description)}</p>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  static renderBugFixes(bugfixes) {
    const container = document.getElementById('bugFixes');

    if (!container) return;

    if (!bugfixes || bugfixes.length === 0) {
      container.innerHTML = '<p class="text-[#8b949e] text-xs">No bug fixes available.</p>';
      return;
    }

    container.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';

    container.innerHTML = Object.entries(bugfixes).map(([subsectionName, items]) => {
      const config = CATEGORY_ICONS[subsectionName] || { icon: 'fa-bug', color: 'red' };

      return `
        <div class="bg-[#161b22] border border-[#30363d] rounded-lg p-5 flex flex-col justify-between hover:border-[#8b949e] transition-all">
          <div>
            <div class="flex items-center justify-between mb-4 pb-3 border-b border-[#21262d]">
              <div class="flex items-center space-x-2.5">
                <i class="fas ${config.icon} text-[#f85149] text-sm"></i>
                <h3 class="text-sm font-semibold text-white">${subsectionName}</h3>
              </div>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-[#21262d] text-[#8b949e] border border-[#30363d]">${items.length} fixes</span>
            </div>

            <div class="space-y-3">
              ${items.map(item => `
                <div class="p-2.5 rounded bg-[#0d1117] border border-[#21262d]">
                  <h4 class="text-xs font-semibold text-gray-200 mb-1">${ChangelogUtils.renderMarkdown(item.title)}</h4>
                  <p class="text-xs text-[#8b949e] leading-relaxed">${ChangelogUtils.renderMarkdown(item.description)}</p>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  static renderNotes(notes) {
    const container = document.getElementById('notesSection');

    if (!container) return;

    if (!notes || notes.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = `
      <div class="bg-[#161b22] border border-[#30363d] rounded-lg p-5">
        <h3 class="text-sm font-semibold text-white mb-3 flex items-center space-x-2">
          <i class="fas fa-info-circle text-[#58a6ff]"></i>
          <span>Release Notes</span>
        </h3>
        <div class="space-y-2 text-xs text-[#8b949e]">
          ${notes.map(note => `<p>${ChangelogUtils.renderMarkdown(note)}</p>`).join('')}
        </div>
      </div>
    `;
  }

  static renderVersionTimeline(versions) {
    const container = document.getElementById('versionTimeline');

    if (!container) return;

    if (!versions || versions.length === 0) {
      container.innerHTML = '<p class="text-[#8b949e] text-xs">No version history available.</p>';
      return;
    }

    container.innerHTML = versions.map((version, index) => {
      const isLatest = index === 0;

      return `
        <div class="timeline-item ${isLatest ? 'latest-release' : ''}">
          <div class="bg-[#161b22] border border-[#30363d] rounded-lg p-5">
            <div class="flex items-center justify-between mb-4 pb-3 border-b border-[#21262d]">
              <div class="flex items-center space-x-3">
                <span class="font-mono text-base font-bold text-white">${version.version}</span>
                ${isLatest ? '<span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-[#238636] text-white">LATEST</span>' : ''}
              </div>
              <span class="text-xs font-mono text-[#8b949e]">${version.status || ''}</span>
            </div>
            
            ${version.features && version.features.length > 0 ? `
              <ul class="space-y-2 text-xs text-gray-300">
                ${version.features.map(feature => `
                  <li class="flex items-start space-x-2">
                    <span class="text-[#58a6ff] font-bold mt-0.5">•</span>
                    <span class="leading-relaxed text-gray-300">${ChangelogUtils.renderMarkdown(feature)}</span>
                  </li>
                `).join('')}
              </ul>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Show loading state
   */
  static showLoading() {
    const loadingState = document.getElementById('loadingState');
    const changelogContent = document.getElementById('changelogContent');

    if (loadingState && changelogContent) {
      loadingState.style.display = 'block';
    }
  }

  /**
   * Show error state
   * @param {string} message - Error message
   * @param {Error} error - Error object
   */
  static showError(message, error) {
    const loadingState = document.getElementById('loadingState');

    if (loadingState) {
      loadingState.innerHTML = `
        <div class="text-center">
          <i class="fas fa-exclamation-triangle text-3xl text-red-400 mb-4"></i>
          <h3 class="text-xl font-semibold text-white mb-2">Failed to Load Changelog</h3>
          <p class="text-gray-400">Please check the console for details or try refreshing the page.</p>
          <p class="text-sm text-gray-500 mt-2">Error: ${error?.message || message}</p>
        </div>
      `;
    }
  }

  /**
   * Initialize smooth scrolling for navigation
   */
  static initializeNavigation() {
    document.querySelectorAll('nav a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
          target.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      });
    });
  }

  /**
   * Initialize scroll animations
   */
  static initializeAnimations() {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-slide-up');
        }
      });
    }, observerOptions);

    // Observe all sections
    document.querySelectorAll('main > section').forEach(section => {
      observer.observe(section);
    });
  }
}
