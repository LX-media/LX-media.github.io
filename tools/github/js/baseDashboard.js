/**
 * Base Dashboard Class
 *
 * This class provides common functionality for both the PR Dashboard and Actions Dashboard.
 * It reduces duplication and provides a consistent interface for shared features like:
 * - Dark mode handling
 * - Configuration status updates
 * - Error handling
 * - Cache management
 * - Common filter functionality
 */

import { getConfig, saveDashboardConfig } from './config.js';
import GitHubAPI from './githubApi.js';
import { createConfigStatusIndicator, createLastUpdatedText, updateButtonState } from './components.js';
import errorService, { ErrorCategory, ErrorSeverity } from './ErrorService.js';

export class BaseDashboard {
  constructor(options = {}) {
    const { storageKeyPrefix = 'gh-dashboard' } = options;

    // Get configuration
    const { token, orgName } = getConfig();
    this.token = token;
    this.orgName = orgName;

    // Save the config to localStorage for persistence
    saveDashboardConfig({ token, orgName });

    // Common properties
    this.lastUpdateTime = null;
    this.github = token ? new GitHubAPI(token) : null;
    this.searchQuery = '';
    this.searchTimeout = null;

    // Generate storage keys based on organization
    this.storageKeyPrefix = storageKeyPrefix;
    this.storageKey = `${this.storageKeyPrefix}-${orgName}`;

    // Setup error handling
    this.setupErrorHandling();

    // Setup common features
    this.setupDarkMode();
    this.updateConfigStatus(orgName, !!token);

    // Handle missing token
    if (!this.token) {
      this.showError(
        'GitHub token is required. Either set GITHUB_TOKEN environment variable or add it as a URL parameter: ?token=your-token\n' +
        'Use the token from 1password: `GITHUB_ORG_DASHBOARD_PAT dev@lx ORG`.\n\n' +
        'Required token scopes:\n' +
        '• repo (read-only access to repositories)\n' +
        '• org:read (read-only access to organization data)',
        { severity: ErrorSeverity.CRITICAL, category: ErrorCategory.AUTH }
      );
      return false;
    }

    // Setup rate limit warning handler
    if (this.github) {
      this.github.onRateLimitWarning = this.handleRateLimitWarning.bind(this);
    }

    return true;
  }

  /**
   * Set up error handling for the dashboard
   */
  setupErrorHandling() {
    // Set the UI error element for the ErrorService
    const errorElement = document.getElementById('errorMessage');
    if (errorElement) {
      errorService.setUIErrorElement(errorElement);
    }

    // Add global error handler for uncaught exceptions
    window.addEventListener('error', (event) => {
      errorService.logError(`Unhandled error: ${event.message}`, {
        error: event.error,
        category: ErrorCategory.RENDER,
        severity: ErrorSeverity.ERROR,
        context: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        }
      });
    });

    // Add global promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
      errorService.logError(`Unhandled promise rejection: ${event.reason}`, {
        error: event.reason,
        category: ErrorCategory.RENDER,
        severity: ErrorSeverity.ERROR
      });
    });
  }

  /**
   * Setup dark mode toggle and system preference detection
   */
  setupDarkMode() {
    try {
      // Check system preference
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
      }

      // Setup toggle button
      const darkModeToggle = document.getElementById('darkModeToggle');
      if (darkModeToggle) {
        darkModeToggle.addEventListener('click', () => {
          document.documentElement.classList.toggle('dark');
        });
      }

      // Listen for system preference changes
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        document.documentElement.classList.toggle('dark', e.matches);
      });
    } catch (error) {
      // Log any errors with dark mode setup but don't break app functionality
      errorService.logError('Failed to set up dark mode', {
        error,
        category: ErrorCategory.RENDER,
        severity: ErrorSeverity.WARNING
      });
    }
  }

  /**
   * Update configuration status indicators in the UI
   */
  updateConfigStatus(orgName, hasToken) {
    try {
      // Organization status
      const orgIndicator = document.getElementById('orgStatusIndicator');
      const orgValue = document.getElementById('orgStatusValue');

      if (orgIndicator) {
        orgIndicator.innerHTML = createConfigStatusIndicator(!!orgName);
        orgIndicator.className = `w-4 h-4 rounded-full ${orgName ? 'bg-green-100 dark:bg-green-900' : 'bg-red-100 dark:bg-red-900'} flex items-center justify-center`;
      }

      if (orgValue) {
        orgValue.textContent = orgName || 'Not set';
      }

      // Token status
      const tokenIndicator = document.getElementById('tokenStatusIndicator');
      if (tokenIndicator) {
        tokenIndicator.innerHTML = createConfigStatusIndicator(hasToken);
        tokenIndicator.className = `w-4 h-4 rounded-full ${hasToken ? 'bg-green-100 dark:bg-green-900' : 'bg-red-100 dark:bg-red-900'} flex items-center justify-center`;
      }
    } catch (error) {
      errorService.logError('Failed to update config status indicators', {
        error,
        category: ErrorCategory.RENDER,
        severity: ErrorSeverity.WARNING
      });
    }
  }

  /**
   * Display error messages to the user using the error service
   */
  showError(message, options = {}) {
    const {
      severity = ErrorSeverity.ERROR,
      category = ErrorCategory.API,
      autoHide = false
    } = options;

    errorService.showUIError(message, { severity, category, autoHide });
  }

  /**
   * Update the last fetched timestamp
   */
  updateLastFetchTime() {
    this.lastUpdateTime = new Date();
    const lastUpdate = document.getElementById('lastUpdate');
    if (lastUpdate) {
      lastUpdate.textContent = createLastUpdatedText(this.lastUpdateTime);
    }
  }

  /**
   * Handle rate limit warnings from the GitHub API
   */
  handleRateLimitWarning({ remaining, resetTime, resetTimeMs }) {
    // Using ErrorService for consistent warning display
    errorService.showUIError(
      `API Rate Limit Warning: ${remaining} calls remaining. Resets in ${Math.ceil(resetTimeMs / 60000)} minutes.`,
      {
        severity: ErrorSeverity.WARNING,
        category: ErrorCategory.RATE_LIMIT,
        autoHide: true,
        duration: 8000
      }
    );
  }

  /**
   * Update button active/inactive state using shared component
   */
  updateFilterButtonClass(button, isActive) {
    if (button) {
      updateButtonState(button, isActive);
    }
  }

  /**
   * Common method to load organization details
   */
  async loadOrganization() {
    try {
      const org = await this.github.getOrganization(this.orgName);
      const orgName = org.name || this.orgName;

      // Update page title
      document.title = `${orgName} - GitHub Dashboard`;

      // Update header if element exists
      const orgNameElement = document.getElementById('orgName');
      if (orgNameElement) {
        orgNameElement.textContent = orgName;
      }

      const orgDescElement = document.getElementById('orgDesc');
      if (orgDescElement) {
        orgDescElement.textContent = org.description || '';
      }

      return org;
    } catch (error) {
      this.showError(`Failed to load organization details: ${error.message}`);
      return null;
    }
  }

  /**
   * Base implementation for loading repositories
   */
  async loadRepositories() {
    try {
      return await this.github.getActiveRepositories(this.orgName);
    } catch (error) {
      this.showError(`Failed to load repositories: ${error.message}`);
      return [];
    }
  }

  /**
   * Helper method for setting up clear filters button
   */
  setupClearFiltersButton(clearHandler) {
    const clearFiltersBtn = document.getElementById('clearFilters');
    if (clearFiltersBtn) {
      clearFiltersBtn.addEventListener('click', () => {
        if (typeof clearHandler === 'function') {
          clearHandler();
        }
      });
    }
  }

  /**
   * Basic implementation for loading cached data
   */
  loadCachedData(key, maxAgeMinutes, handler) {
    try {
      const cached = localStorage.getItem(key);
      if (!cached) {
        return false;
      }

      const { data, timestamp } = JSON.parse(cached);
      const age = Date.now() - timestamp;
      const maxAge = maxAgeMinutes * 60 * 1000;

      if (age < maxAge) {
        if (typeof handler === 'function') {
          handler(data, new Date(timestamp));
        }
        return true;
      }
    } catch (error) {
      errorService.logError(`Failed to load cached data from '${key}'`, {
        error,
        category: ErrorCategory.CACHE,
        severity: ErrorSeverity.WARNING,
        context: { cacheKey: key, maxAgeMinutes }
      });
    }

    return false;
  }

  /**
   * Basic implementation for saving data to cache
   */
  saveCacheData(key, data) {
    try {
      const cache = {
        data,
        timestamp: Date.now()
      };

      localStorage.setItem(key, JSON.stringify(cache));
      return true;
    } catch (error) {
      errorService.logError(`Failed to save data to cache '${key}'`, {
        error,
        category: ErrorCategory.CACHE,
        severity: ErrorSeverity.WARNING,
        context: {
          cacheKey: key,
          dataSize: JSON.stringify(data).length
        }
      });
      return false;
    }
  }
}
