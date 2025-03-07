import GitHubAPI from './githubApi.js';
import { FilterStore } from './filterStore.js';
import { getConfig } from './config.js';

class Dashboard {
  constructor() {
    // Add initialization tracking
    if (window._dashboardInitialized) {
      return;
    }
    window._dashboardInitialized = true;

    this.setupDarkMode();

    const { token, orgName } = getConfig();
    this.orgName = orgName;
    this.token = token;

    // Add cache duration property
    this.cacheDuration = parseInt(localStorage.getItem('prCacheDuration')) || 60; // Default 60 minutes
    // Make storage key organization-aware
    this.storageKey = `github-dashboard-pr-cache-${orgName}`;

    // Add repos per page configuration
    this.reposPerPage = parseInt(localStorage.getItem('reposPerPage')) || 20;

    // Update configuration status indicators
    this.updateConfigStatus(orgName, !!token);

    if (!this.token) {
      this.showError(
        'GitHub token is required. Either set GITHUB_TOKEN environment variable or add it as a URL parameter: ?token=your-token\n\n' +
        'Required token scopes:\n' +
        '• repo (read-only access to repositories)\n' +
        '• org:read (read-only access to organization data)'
      );
      return;
    }

    this.github = new GitHubAPI(this.token);
    this.hideRenovate = false;
    this.hideDependabot = false;
    this.pullRequests = [];
    this.isLoadingPRs = false;
    this.lastUpdateTime = null;
    this.sortNewest = true;
    this.activeFilters = {
      labels: new Set(),
      reviewState: new Set()
    };
    this.filterStore = new FilterStore();
    this.searchTimeout = null;
    this.labelOperator = 'OR'; // New property for label filter operation

    // Restore saved filters
    const savedFilters = this.filterStore.filters;
    this.hideRenovate = savedFilters.hideRenovate;
    this.hideDependabot = savedFilters.hideDependabot;
    this.sortNewest = savedFilters.sortNewest;
    this.activeFilters = {
      labels: new Set(savedFilters.labels),
      reviewState: new Set(savedFilters.reviewStates)
    };
    this.searchQuery = savedFilters.search;
    this.labelOperator = savedFilters.labelOperator || 'OR';

    // Setup rate limit warning handler
    this.github.onRateLimitWarning = this.handleRateLimitWarning.bind(this);

    this.initialize();
    this.setupEventListeners();
    this.setupStatsToggle();

    // Update configuration status indicators
    this.updateConfigStatus(orgName, !!token);

    // Try to load cached data immediately
    this.loadCachedData();
  }

  updateConfigStatus(orgName, hasToken) {
    // Organization status
    const orgIndicator = document.getElementById('orgStatusIndicator');
    const orgValue = document.getElementById('orgStatusValue');

    orgIndicator.innerHTML = orgName ?
      '<svg class="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>' :
      '<svg class="w-3 h-3 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>';

    orgValue.textContent = orgName || 'Not set';
    orgIndicator.className = `w-4 h-4 rounded-full ${orgName ? 'bg-green-100 dark:bg-green-900' : 'bg-red-100 dark:bg-red-900'} flex items-center justify-center`;

    // Token status
    const tokenIndicator = document.getElementById('tokenStatusIndicator');
    tokenIndicator.innerHTML = hasToken ?
      '<svg class="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>' :
      '<svg class="w-3 h-3 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>';
    tokenIndicator.className = `w-4 h-4 rounded-full ${hasToken ? 'bg-green-100 dark:bg-green-900' : 'bg-red-100 dark:bg-red-900'} flex items-center justify-center`;
  }

  setupStatsToggle() {
    const toggleBtn = document.getElementById('statsToggle');
    const content = document.getElementById('statsContent');
    const icon = toggleBtn.querySelector('svg');
    const border = 'border-b border-gray-200 dark:border-gray-700';

    // Restore saved state
    const isExpanded = localStorage.getItem('statsExpanded') === 'true';
    if (isExpanded) {
      content.classList.remove('hidden');
      icon.style.transform = 'rotate(180deg)';
      toggleBtn.classList.add(...border.split(' '));
    }

    toggleBtn.addEventListener('click', () => {
      const isHidden = content.classList.contains('hidden');
      content.classList.toggle('hidden');
      icon.style.transform = isHidden ? 'rotate(180deg)' : '';

      // Toggle border - only show when expanded
      if (isHidden) {
        toggleBtn.classList.add(...border.split(' '));
      } else {
        toggleBtn.classList.remove(...border.split(' '));
      }

      // Save state
      localStorage.setItem('statsExpanded', isHidden);
    });
  }

  handleRateLimitWarning({ remaining, resetTime, resetTimeMs }) {
    const warningDiv = document.createElement('div');
    warningDiv.className = 'fixed bottom-4 right-4 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-100 p-4 rounded-lg shadow-lg';
    warningDiv.innerHTML = `
      <p>API Rate Limit Warning</p>
      <p class="text-sm">Remaining calls: ${remaining}</p>
      <p class="text-sm">Resets in: ${Math.ceil(resetTimeMs / 60000)} minutes</p>
    `;
    document.body.appendChild(warningDiv);
    setTimeout(() => warningDiv.remove(), 5000);
  }

  showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
  }

  async initialize() {
    try {
      await this.loadOrganization();
      await Promise.all([
        this.loadRepositories(),
        this.loadPullRequests()
      ]);
      this.updateLastFetchTime();
    } catch (error) {
      this.showError(error.message);
    }
  }

  setupEventListeners() {
    const hideRenovateBtn = document.getElementById('hideRenovateBtn');
    const hideDependabotBtn = document.getElementById('hideDependabotBtn');

    hideRenovateBtn.addEventListener('click', () => {
      this.hideRenovate = !this.hideRenovate;
      hideRenovateBtn.textContent = this.hideRenovate ? 'Show Renovate PRs' : 'Hide Renovate PRs';
      this.renderPullRequests();
    });

    hideDependabotBtn.addEventListener('click', () => {
      this.hideDependabot = !this.hideDependabot;
      hideDependabotBtn.textContent = this.hideDependabot ? 'Show Dependabot PRs' : 'Hide Dependabot PRs';
      this.renderPullRequests();
    });

    const sortPRsBtn = document.getElementById('sortPRsBtn');
    sortPRsBtn.addEventListener('click', () => {
      this.sortNewest = !this.sortNewest;
      sortPRsBtn.textContent = this.sortNewest ? 'Sort by Oldest' : 'Sort by Newest';
      this.renderPullRequests();
    });

    // Filter click handlers - Update to handle both data attributes and classList properly
    document.addEventListener('click', (e) => {
      const filterBtn = e.target.closest('[data-filter-type]');
      if (!filterBtn) {
        return;
      }

      const type = filterBtn.dataset.filterType;
      const value = filterBtn.dataset.filterValue;

      if (this.activeFilters[type].has(value)) {
        this.activeFilters[type].delete(value);
        filterBtn.classList.remove('filter-active');
      } else {
        this.activeFilters[type].add(value);
        filterBtn.classList.add('filter-active');
      }

      // Save to filter store
      this.filterStore.updateFilter(
        type === 'reviewState' ? 'reviewStates' : type,
        Array.from(this.activeFilters[type])
      );

      this.renderPullRequests();
    });

    // Add search input
    const searchInput = document.getElementById('prSearch');
    searchInput.value = this.searchQuery;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => {
        this.searchQuery = e.target.value;
        this.filterStore.updateFilter('search', this.searchQuery);
        this.renderPullRequests();
      }, 300);
    });

    // Clear filters button
    document.getElementById('clearFilters').addEventListener('click', () => {
      this.filterStore.clearFilters();
      this.resetFilters();
    });

    // Add label operator toggle
    const labelOperatorToggle = document.getElementById('labelOperatorToggle');
    labelOperatorToggle.textContent = this.labelOperator;
    labelOperatorToggle.addEventListener('click', () => {
      this.labelOperator = this.labelOperator === 'OR' ? 'AND' : 'OR';
      labelOperatorToggle.textContent = this.labelOperator;
      this.filterStore.updateFilter('labelOperator', this.labelOperator);
      this.renderPullRequests();
    });

    // Add refresh button click handler
    document.getElementById('refreshPRs').addEventListener('click', () => {
      this.loadPullRequests(true);
    });

    // Add cache duration input handler
    document.getElementById('cacheDuration').addEventListener('change', (e) => {
      const value = parseInt(e.target.value);
      if (value > 0) {
        this.cacheDuration = value;
        localStorage.setItem('prCacheDuration', value);
      }
    });

    // Add repos per page input handler
    document.getElementById('reposPerPage').addEventListener('change', (e) => {
      const value = parseInt(e.target.value);
      if (value > 0) {
        this.reposPerPage = value;
        localStorage.setItem('reposPerPage', value);
        this.github.reposPerPage = value;
        this.loadRepositories();
      }
    });
  }

  resetFilters() {
    const savedFilters = this.filterStore.filters;
    this.hideRenovate = savedFilters.hideRenovate;
    this.hideDependabot = savedFilters.hideDependabot;
    this.activeFilters.labels.clear();
    this.activeFilters.reviewState.clear();
    this.searchQuery = '';
    this.labelOperator = 'OR';
    document.getElementById('labelOperatorToggle').textContent = 'OR';
    this.filterStore.updateFilter('labelOperator', 'OR');

    // Reset UI states
    document.getElementById('prSearch').value = '';
    document.querySelectorAll('.filter-active').forEach(el => {
      el.classList.remove('filter-active');
    });

    this.renderPullRequests();
  }

  setupDarkMode() {
    // Check system preference
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark');
    }

    // Setup toggle button
    const darkModeToggle = document.getElementById('darkModeToggle');
    darkModeToggle.addEventListener('click', () => {
      document.documentElement.classList.toggle('dark');
    });
  }

  updateLastFetchTime() {
    this.lastUpdateTime = new Date();
    const lastUpdate = document.getElementById('lastUpdate');
    lastUpdate.textContent = `Last updated: ${this.lastUpdateTime.toLocaleString(navigator.language, {
      dateStyle: 'medium',
      timeStyle: 'medium'
    })}`;
  }

  async loadOrganization() {
    const org = await this.github.getOrganization(this.orgName);
    const orgName = org.name || this.orgName;

    // Update page title
    document.title = `${orgName} - GitHub Organization Dashboard`;

    // Update header
    document.getElementById('orgName').textContent = orgName;
    document.getElementById('orgDesc').textContent = org.description || '';
  }

  async loadRepositories() {
    const repos = await this.github.getActiveRepositories(this.orgName);
    const reposList = document.getElementById('reposList');

    reposList.innerHTML = repos.map(repo => `
      <div class="border-l-4 border-blue-500 pl-4 mb-4">
        <a href="${repo.html_url}" target="_blank" class="text-lg font-medium text-blue-600 dark:text-blue-400 hover:underline">
          ${repo.name}
        </a>
        <div class="flex flex-wrap items-center gap-2 mt-1">
          ${repo.language ? `
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
              ${repo.language}
            </span>
          ` : ''}
          ${(repo.topics || []).map(topic => `
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
              ${topic}
            </span>
          `).join('')}
        </div>
        <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Last updated: ${new Date(repo.pushed_at).toLocaleString(navigator.language, { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
      </div>
    `).join('');
  }

  showPRLoading(forceRefresh = false) {
    if (!forceRefresh) {
      const prList = document.getElementById('prList');
      this.isLoadingPRs = true;

      // Create mock repository groups with skeletons
      const mockRepos = ['Repository 1', 'Repository 2'];
      prList.innerHTML = mockRepos.map(repoName => `
        <div class="mb-6">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-3">
            <div class="h-6 w-48 bg-gray-200 dark:bg-gray-600 rounded animate-pulse"></div>
          </h3>
          <div class="space-y-4">
            ${Array(2).fill(0).map(() => `
              <div class="animate-pulse border-l-4 border-gray-200 dark:border-gray-600 pl-4">
                <div class="flex flex-col gap-2">
                  <!-- PR Title -->
                  <div class="h-6 w-full bg-gray-200 dark:bg-gray-600 rounded"></div>
                  <!-- Review state and labels -->
                  <div class="flex gap-2 mt-1">
                    <div class="h-5 w-24 bg-gray-200 dark:bg-gray-600 rounded"></div>
                    <div class="h-5 w-20 bg-gray-200 dark:bg-gray-600 rounded"></div>
                    <div class="h-5 w-16 bg-gray-200 dark:bg-gray-600 rounded"></div>
                  </div>
                  <!-- Author and date -->
                  <div class="h-4 w-48 bg-gray-200 dark:bg-gray-600 rounded"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('');
    } else {
      // Only add one loading skeleton at the top
      const firstRepo = document.querySelector('#prList > div:first-child');
      if (firstRepo) {
        const loadingSkeleton = document.createElement('div');
        loadingSkeleton.className = 'mb-6 loading-skeleton';
        loadingSkeleton.innerHTML = `
          <div class="animate-pulse border-l-4 border-gray-200 dark:border-gray-600 pl-4">
            <div class="flex flex-col gap-2">
              <div class="h-6 w-full bg-gray-200 dark:bg-gray-600 rounded"></div>
              <div class="flex gap-2 mt-1">
                <div class="h-5 w-24 bg-gray-200 dark:bg-gray-600 rounded"></div>
                <div class="h-5 w-20 bg-gray-200 dark:bg-gray-600 rounded"></div>
              </div>
              <div class="h-4 w-48 bg-gray-200 dark:bg-gray-600 rounded"></div>
            </div>
          </div>
        `;
        firstRepo.parentNode.insertBefore(loadingSkeleton, firstRepo);
      }
    }
  }

  async loadPullRequests(forceRefresh = false) {
    // Always show loading state for force refresh
    if (forceRefresh) {
      // Keep existing PRs visible but add loading indicator at top
      this.showPRLoading(true);
    } else if (!this.pullRequests.length) {
      // Only show full loading state if no PRs are currently displayed
      this.showPRLoading(false);
    }

    try {
      // Try to use cache first (unless forcing refresh)
      const cached = localStorage.getItem(this.storageKey);
      if (cached && !forceRefresh) {
        const { data, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        const maxAge = this.cacheDuration * 60 * 1000;

        if (age < maxAge) {
          this.pullRequests = data;
          this.lastUpdateTime = new Date(timestamp);
          this.renderPRStats();
          this.renderPullRequests();
          this.updateLastFetchTime();
          return;
        }
      }

      // Fetch fresh data
      this.pullRequests = await this.github.getOpenPullRequests(this.orgName);
      this.savePRCache();
      this.renderPRStats();
      this.renderPullRequests();
      this.updateLastFetchTime();
    } catch (error) {
      this.showError(`Failed to load pull requests: ${error.message}`);
    } finally {
      // Remove loading skeleton
      const loadingSkeleton = document.querySelector('.loading-skeleton');
      if (loadingSkeleton) {
        loadingSkeleton.remove();
      }
      this.isLoadingPRs = false;
    }
  }

  renderPRStats() {
    const stats = new Map();
    this.pullRequests.forEach(pr => {
      const author = pr.user.login;
      stats.set(author, (stats.get(author) || 0) + 1);
    });

    const sortedStats = [...stats.entries()]
      .sort((a, b) => b[1] - a[1]);

    const prStats = document.getElementById('prStats');
    prStats.innerHTML = `
      <p class="text-gray-600 dark:text-gray-400 mb-2">
        Total open PRs: ${this.pullRequests.length}
      </p>
      ${sortedStats.map(([author, count]) => `
        <div class="flex justify-between items-center text-sm">
          <span class="text-gray-700 dark:text-gray-300">${author}</span>
          <span class="text-gray-500 dark:text-gray-400">${count} PR${count !== 1 ? 's' : ''}</span>
        </div>
      `).join('')}
    `;
  }

  renderPullRequests() {
    const prList = document.getElementById('prList');
    let prs = [...this.pullRequests]; // Create a copy for sorting

    if (this.hideRenovate) {
      prs = prs.filter((pr) => {
        return pr.user.login !== 'renovate[bot]';
      });
    }
    if (this.hideDependabot) {
      prs = prs.filter((pr) => {
        return pr.user.login !== 'dependabot[bot]';
      });
    }

    // Apply filters
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      prs = prs.filter(pr =>
        pr.title.toLowerCase().includes(query) ||
        pr.user.login.toLowerCase().includes(query) ||
        pr.user.name.toLowerCase().includes(query) ||
        pr.repoName.toLowerCase().includes(query)
      );
    }

    // Updated label filtering logic
    if (this.activeFilters.labels.size > 0) {
      const labelNames = Array.from(this.activeFilters.labels);
      prs = prs.filter(pr => {
        const prLabelNames = pr.labels.map(label => label.name);
        if (this.labelOperator === 'AND') {
          return labelNames.every(name => prLabelNames.includes(name));
        }
        return labelNames.some(name => prLabelNames.includes(name));
      });
    }

    if (this.activeFilters.reviewState.size > 0) {
      prs = prs.filter(pr =>
        this.activeFilters.reviewState.has(pr.reviewState)
      );
    }

    // Sort PRs by creation date
    prs.sort((a, b) => {
      const dateA = new Date(a.created_at);
      const dateB = new Date(b.created_at);
      return this.sortNewest ? dateB - dateA : dateA - dateB;
    });

    if (prs.length === 0) {
      prList.innerHTML = `
        <div class="text-gray-500 dark:text-gray-400 italic">
          No open pull requests found. Either there are none, or the token might need 'repo' permissions.
        </div>`;
      return;
    }

    // Group by repository
    const groupedPrs = prs.reduce((acc, pr) => {
      if (!acc[pr.repoName]) acc[pr.repoName] = [];
      acc[pr.repoName].push(pr);
      return acc;
    }, {});

    // Render grouped PRs
    prList.innerHTML = Object.entries(groupedPrs).map(([repoName, repoPrs]) => `
      <div class="mb-6">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-3">${repoName}</h3>
        <div class="space-y-4">
          ${repoPrs.map(pr => this.renderPRItem(pr)).join('')}
        </div>
      </div>
    `).join('');

    this.updateFilterCounts();
    this.updateFilterButtons();
  }

  renderPRItem(pr) {
    const borderColor = {
      'APPROVED': 'border-green-500',
      'CHANGES_REQUESTED': 'border-red-500',
      'PENDING': 'border-yellow-500'
    }[pr.reviewState] || 'border-gray-500';

    return `
      <div class="border-l-4 ${borderColor} pl-4">
        <div class="flex items-center gap-2">
          <a href="${pr.html_url}" target="_blank" class="text-lg font-medium text-blue-600 dark:text-blue-400 hover:underline truncate">
            ${pr.title}
          </a>
        </div>
        <div class="flex flex-wrap gap-1 mt-1">
          ${this.renderReviewState(pr.reviewState)}
          ${pr.labels.map(label => this.renderLabel(label)).join('')}
          <span class="text-sm text-gray-500 dark:text-gray-400">
            ${pr.reviews.length} reviews
          </span>
        </div>
        <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
          By ${pr.user.name !== pr.user.login ? `${pr.user.name} (${pr.user.login})` : pr.user.login} • Updated: ${new Date(pr.updated_at).toLocaleString()}
        </p>
      </div>
    `;
  }

  renderLabel(label) {
    const rgb = this.hexToRgb(label.color);
    const isDark = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000 < 128;
    const textColor = isDark ? '#ffffff' : '#000000';

    return `<span class="pr-label" style="background-color: #${label.color}; color: ${textColor}">
      ${label.name}
    </span>`;
  }

  renderReviewState(state) {
    const states = {
      'APPROVED': { icon: '✓', class: 'review-approved' },
      'CHANGES_REQUESTED': { icon: '×', class: 'review-changes' },
      'PENDING': { icon: '⊙', class: 'review-pending' }
    };

    const { icon, class: className } = states[state];
    return `<span class="review-state ${className}">${icon} ${state.replace('_', ' ')}</span>`;
  }

  hexToRgb(hex) {
    const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) {
      return null;
    }
    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    };
  }

  updateFilterButtons() {
    const allLabels = new Set();
    this.pullRequests.forEach(pr => {
      pr.labels.forEach(label => allLabels.add(label.name));
    });

    // Show/hide label operator toggle based on available labels
    const labelOperatorToggle = document.getElementById('labelOperatorToggle');
    if (allLabels.size > 0) {
      labelOperatorToggle.classList.remove('hidden');
    } else {
      labelOperatorToggle.classList.add('hidden');
    }

    // Update available label filters based on current PRs
    const labelFiltersContainer = document.getElementById('labelFilters');
    labelFiltersContainer.innerHTML = [...allLabels].map(label =>
      `<button
        data-filter-type="labels"
        data-filter-value="${label}"
        class="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-700
        dark:hover:bg-gray-600 dark:text-gray-200 rounded ${this.activeFilters.labels.has(label) ? 'filter-active' : ''
      }">
        ${label}
      </button>`
    ).join('');

    // Update review state filter buttons to show active state
    document.querySelectorAll('[data-filter-type="reviewState"]').forEach(btn => {
      const value = btn.dataset.filterValue;
      if (this.activeFilters.reviewState.has(value)) {
        btn.classList.add('filter-active');
      } else {
        btn.classList.remove('filter-active');
      }
    });
  }

  updateFilterCounts() {
    const counts = {
      total: this.pullRequests.length,
      filtered: document.querySelectorAll('#prList .border-l-4').length,
      labels: this.activeFilters.labels.size,
      reviewStates: this.activeFilters.reviewState.size
    };

    document.getElementById('filterCounts').innerHTML = `
      <span class="text-sm text-gray-500 dark:text-gray-400">
        Showing ${counts.filtered} of ${counts.total} PRs
        ${counts.labels + counts.reviewStates > 0 ? `(${counts.labels + counts.reviewStates} filters active)` : ''}
      </span>
    `;
  }

  loadCachedData() {
    const cached = localStorage.getItem(this.storageKey);
    if (!cached) {
      return;
    }

    const { data, timestamp } = JSON.parse(cached);
    const age = Date.now() - timestamp;
    const maxAge = this.cacheDuration * 60 * 1000;

    if (age < maxAge) {
      this.pullRequests = data;
      this.lastUpdateTime = new Date(timestamp);
      this.renderPRStats();
      this.renderPullRequests();
      this.updateLastFetchTime();
    }
  }

  savePRCache() {
    const cache = {
      data: this.pullRequests,
      timestamp: Date.now()
    };
    localStorage.setItem(this.storageKey, JSON.stringify(cache));
  }
}

new Dashboard();
