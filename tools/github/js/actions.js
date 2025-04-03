import GitHubActionsAPI from './actionsApi.js';
import GitHubAPI from './githubApi.js';
import { getConfig } from './config.js';

class ActionsDashboard {
  constructor() {
    this.setupDarkMode();

    const { token, orgName } = getConfig();
    this.orgName = orgName;
    this.token = token;

    // Initialize filter state
    this.activeFilters = {
      status: new Set(),
      annotations: new Set(),
      hideDisabled: new Set(['true']) // Default to hiding disabled workflows
    };
    this.searchQuery = '';
    this.allWorkflows = [];
    this.storageKey = `gh-dashboard-actions-filters-${orgName}`;

    // Update configuration status indicators
    this.updateConfigStatus(orgName, !!token);

    // Restore saved filters
    this.loadSavedFilters();

    if (!this.token) {
      this.showError(
        'Use the token from 1password: `GITHUB_ORG_DASHBOARD_PAT dev@lx ORG`.\n\n' +
        'GitHub token is required. Required token scopes:\n' +
        '• repo (read-only access to repositories)\n' +
        '• org:read (read-only access to organization data)\n' +
        '• actions:read (access to Actions runs and annotations)'
      );
      return;
    }

    this.github = new GitHubAPI(this.token);
    this.actions = new GitHubActionsAPI(this.token);

    // Explicitly set the callback function to ensure it's properly assigned
    const self = this;
    this.actions.onScopeWarning = function () {
      console.log("Scope warning callback triggered");
      self.showError(
        'Use the token from 1password: `GITHUB_ORG_DASHBOARD_PAT dev@lx ORG`.\n\n' +
        'GitHub token is missing required scopes. To be able to view annotations in workflow runs, add:\n' +
        '• actions:read (access to Actions runs and annotations)'
      );
    };

    this.initialize();
    this.setupEventListeners();
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

  loadSavedFilters() {
    try {
      const savedFilters = localStorage.getItem(this.storageKey);
      if (savedFilters) {
        const parsed = JSON.parse(savedFilters);
        this.activeFilters = {
          status: new Set(parsed.status || []),
          annotations: new Set(parsed.annotations || []),
          hideDisabled: new Set(parsed.hideDisabled || ['true']) // Default to hiding disabled
        };
        this.searchQuery = parsed.searchQuery || '';
      }
    } catch (error) {
      console.warn('Failed to load saved filters:', error);
    }
  }

  saveFilters() {
    try {
      const filtersToSave = {
        status: Array.from(this.activeFilters.status),
        annotations: Array.from(this.activeFilters.annotations),
        hideDisabled: Array.from(this.activeFilters.hideDisabled),
        searchQuery: this.searchQuery
      };
      localStorage.setItem(this.storageKey, JSON.stringify(filtersToSave));
    } catch (error) {
      console.warn('Failed to save filters:', error);
    }
  }

  setupEventListeners() {
    // Filter click handlers
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

      this.saveFilters();
      this.applyFiltersAndRender();
    });

    // Search input
    const searchInput = document.getElementById('workflowSearch');
    if (searchInput) {
      searchInput.value = this.searchQuery;
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.saveFilters();
        this.applyFiltersAndRender();
      });
    }

    // Clear filters button
    const clearFiltersBtn = document.getElementById('clearFilters');
    if (clearFiltersBtn) {
      clearFiltersBtn.addEventListener('click', () => {
        this.clearFilters();
      });
    }

    // Refresh button
    const refreshBtn = document.getElementById('refreshActions');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.loadActionsMatrix(true);
      });
    }
  }

  clearFilters() {
    this.activeFilters.status.clear();
    this.activeFilters.annotations.clear();
    this.activeFilters.hideDisabled = new Set(['true']); // Reset to default (hiding disabled)
    this.searchQuery = '';

    // Update UI
    document.getElementById('workflowSearch').value = '';
    document.querySelectorAll('[data-filter-type]').forEach(btn => {
      btn.classList.remove('filter-active');
    });
    // Re-apply active class to the "Hide Disabled Workflows" button
    const hideDisabledBtn = document.querySelector('[data-filter-type="hideDisabled"][data-filter-value="true"]');
    if (hideDisabledBtn) {
      hideDisabledBtn.classList.add('filter-active');
    }

    this.saveFilters();
    this.applyFiltersAndRender();
  }

  setupDarkMode() {
    // Check system preference
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark');
    }

    // Setup toggle button if it exists
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
      darkModeToggle.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
      });
    }

    // Listen for system changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      document.documentElement.classList.toggle('dark', e.matches);
    });
  }

  async initialize() {
    try {
      const org = await this.github.getOrganization(this.orgName);
      document.getElementById('orgName').textContent = `${org.name || this.orgName} Actions`;
      document.title = `${org.name || this.orgName} - GitHub Actions Dashboard`;

      await this.loadActionsMatrix();

      // Apply saved filters on initial load
      this.updateFilterButtonState();
    } catch (error) {
      this.showError("Is the token set correctly?\n" + error.stack);
    }
  }

  showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    // Replace text instead of adding to ensure we see the message
    errorDiv.innerHTML = message.replace(/\n/g, '<br>');
    errorDiv.classList.remove('hidden');
    console.log("Showing error message:", message);
  }

  async loadActionsMatrix(forceRefresh = false) {
    const matrix = document.getElementById('actionsMatrix');

    // Show loading state
    matrix.innerHTML = `
      <div class="animate-pulse grid gap-4">
        ${Array(3).fill(0).map(() => `
          <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <div class="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-4"></div>
            <div class="space-y-3">
              <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
              <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    try {
      const repos = await this.github.getActiveRepositories(this.orgName);

      const reposWithActions = await Promise.all(
        repos.map(async repo => {
          const workflows = await this.actions.getRepositoryWorkflows(this.orgName, repo.name);
          return {
            name: repo.name,
            workflows
          };
        })
      );

      // Store all workflows for filtering
      this.allWorkflows = reposWithActions.filter(repo => repo.workflows.length > 0);

      // Apply filters and render
      this.applyFiltersAndRender();

      this.updateLastFetchTime();
    } catch (error) {
      matrix.innerHTML = `
        <div class="bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-100 p-4 rounded">
          <p class="font-bold">Error loading workflows:</p>
          <p>${error.message}</p>
        </div>
      `;
    }
  }

  applyFiltersAndRender() {
    const matrix = document.getElementById('actionsMatrix');
    let filteredWorkflows = [...this.allWorkflows];

    // Keep track of total count for metrics
    let totalWorkflowCount = 0;
    this.allWorkflows.forEach(repo => {
      totalWorkflowCount += repo.workflows.length;
    });

    // Filter repositories
    filteredWorkflows = filteredWorkflows.map(repo => {
      const filteredRepo = {
        name: repo.name,
        workflows: [...repo.workflows]
      };

      // Filter by status
      if (this.activeFilters.status.size > 0) {
        filteredRepo.workflows = filteredRepo.workflows.filter(workflow => {
          const status = workflow.lastRun.status;
          const conclusion = workflow.lastRun.conclusion || '';

          // For completed workflows, check the conclusion
          if (status === 'completed') {
            return this.activeFilters.status.has(conclusion);
          }

          // For non-completed workflows, check the status
          return this.activeFilters.status.has(status);
        });
      }

      // Filter by annotations
      if (this.activeFilters.annotations.has('true')) {
        filteredRepo.workflows = filteredRepo.workflows.filter(workflow => {
          const hasAnnotations = Array.isArray(workflow.lastRun.annotations) &&
            workflow.lastRun.annotations.length > 0;
          return hasAnnotations;
        });
      }

      // Filter disabled workflows
      if (this.activeFilters.hideDisabled.has('true')) {
        filteredRepo.workflows = filteredRepo.workflows.filter(workflow => {
          return workflow.isEnabled !== false;
        });
      }

      // Filter by search query
      if (this.searchQuery) {
        const query = this.searchQuery.toLowerCase();
        filteredRepo.workflows = filteredRepo.workflows.filter(workflow =>
          workflow.workflowName.toLowerCase().includes(query) ||
          repo.name.toLowerCase().includes(query)
        );
      }

      // Sort workflows within each repository by date, newest first
      filteredRepo.workflows.sort((a, b) => {
        const dateA = new Date(a.lastRun.created_at || a.lastRun.updated_at);
        const dateB = new Date(b.lastRun.created_at || b.lastRun.updated_at);
        return dateB - dateA;
      });

      return filteredRepo;
    });

    // Remove empty repositories
    filteredWorkflows = filteredWorkflows.filter(repo => repo.workflows.length > 0);

    // Sort repositories by their newest workflow run date, newest first
    filteredWorkflows.sort((repoA, repoB) => {
      // Get the newest run date from each repo's workflows
      const newestDateA = new Date(repoA.workflows[0].lastRun.created_at || repoA.workflows[0].lastRun.updated_at);
      const newestDateB = new Date(repoB.workflows[0].lastRun.created_at || repoB.workflows[0].lastRun.updated_at);
      return newestDateB - newestDateA;
    });

    // Count filtered workflows for metrics
    let filteredWorkflowCount = 0;
    filteredWorkflows.forEach(repo => {
      filteredWorkflowCount += repo.workflows.length;
    });

    // Update filter counts
    this.updateFilterCounts(filteredWorkflowCount, totalWorkflowCount);

    // Render the filtered workflows
    if (filteredWorkflows.length === 0) {
      matrix.innerHTML = `
        <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <p class="text-gray-500 dark:text-gray-400 text-center">No workflows match the current filters.</p>
        </div>
      `;
    } else {
      matrix.innerHTML = filteredWorkflows.map(repo => this.renderRepoWorkflows(repo)).join('');
    }
  }

  updateFilterCounts(filtered, total) {
    const filterCountsElement = document.getElementById('filterCounts');
    const activeFilterCount =
      this.activeFilters.status.size +
      this.activeFilters.annotations.size +
      this.activeFilters.hideDisabled.size +
      (this.searchQuery ? 1 : 0);

    filterCountsElement.textContent = `Showing ${filtered} of ${total} workflows${activeFilterCount > 0 ? ` (${activeFilterCount} filters active)` : ''
      }`;
  }

  updateFilterButtonState() {
    // Update status filter buttons
    this.activeFilters.status.forEach(status => {
      const button = document.querySelector(`[data-filter-type="status"][data-filter-value="${status}"]`);
      if (button) {
        button.classList.add('filter-active');
      }
    });

    // Update annotations filter button
    if (this.activeFilters.annotations.has('true')) {
      const button = document.querySelector('[data-filter-type="annotations"][data-filter-value="true"]');
      if (button) {
        button.classList.add('filter-active');
      }
    }

    // Update hide disabled filter button
    if (this.activeFilters.hideDisabled.has('true')) {
      const button = document.querySelector('[data-filter-type="hideDisabled"][data-filter-value="true"]');
      if (button) {
        button.classList.add('filter-active');
      }
    }

    // Update search input
    const searchInput = document.getElementById('workflowSearch');
    if (searchInput) {
      searchInput.value = this.searchQuery;
    }
  }

  renderRepoWorkflows(repo) {
    return `
      <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">${repo.name}</h2>
          <span class="text-sm text-gray-500 dark:text-gray-400">${repo.workflows.length} workflow${repo.workflows.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="space-y-3">
          ${repo.workflows.map(workflow => {
      const status = workflow.lastRun.status;
      const conclusion = workflow.lastRun.conclusion;
      const color = this.actions.getStatusColor(status, conclusion);
      const statusClass = `bg-${color}-100 dark:bg-${color}-900 text-${color}-800 dark:text-${color}-200`;
      const hasAnnotations = Array.isArray(workflow.lastRun.annotations) && workflow.lastRun.annotations.length > 0;
      const isEnabled = workflow.isEnabled !== false; // Default to true if not specified
      const lastRunDate = new Date(workflow.lastRun.created_at || workflow.lastRun.updated_at);

      // Apply disabled styling
      const workflowNameClass = isEnabled ?
        "text-blue-600 dark:text-blue-400 hover:underline" :
        "text-gray-500 dark:text-gray-400 hover:underline opacity-70";

      return `
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-${color}-500"></span>
                    <a href="${workflow.lastRun.html_url}" target="_blank"
                       class="${workflowNameClass}">
                      ${workflow.workflowName}
                    </a>
                    ${!isEnabled ? `
                      <span class="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300 rounded-full">
                        disabled
                      </span>
                    ` : ''}
                    ${hasAnnotations && isEnabled ? `
                      <span class="text-xs px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded-full">
                        ${workflow.lastRun.annotations.length} annotation${workflow.lastRun.annotations.length !== 1 ? 's' : ''}
                      </span>
                    ` : ''}
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="px-2 py-1 text-xs rounded ${statusClass}">
                      ${status === 'completed' ? conclusion : status}
                    </span>
                    ${workflow.lastRun.conclusion === 'failure' && isEnabled ? `
                      <span class="text-sm text-red-600 dark:text-red-400 max-w-md truncate"
                            title="${this.getFailureReason(workflow.lastRun).replace(/"/g, '&quot;')}">
                        ${this.getFailureReason(workflow.lastRun).split('\n')[0]}
                      </span>
                    ` : ''}
                  </div>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-xs text-gray-500 dark:text-gray-400">
                    Last run: ${lastRunDate.toLocaleString(navigator.language, {
        dateStyle: 'medium',
        timeStyle: 'medium'
      })}
                  </span>
                </div>
                ${hasAnnotations && isEnabled ? this.renderAnnotations(workflow.lastRun.annotations) : ''}
              </div>
            `;
    }).join('')}
        </div>
      </div>
    `;
  }

  renderAnnotations(annotations) {
    const warnings = annotations.filter(a => a.level === 'warning');
    const failures = annotations.filter(a => a.level === 'failure');

    if (!warnings.length && !failures.length) {
      return '';
    }

    return `
      <div class="pl-4 text-sm space-y-2 w-full overflow-hidden text-wrap">
        ${failures.length > 0 ? `
          <div class="text-red-600 dark:text-red-400">
            <div class="font-medium">❌ Failures:</div>
            ${this.renderAnnotationList(failures)}
          </div>
        ` : ''}
        ${warnings.length > 0 ? `
          <div class="text-yellow-600 dark:text-yellow-400">
            <div class="font-medium">⚠️ Warnings:</div>
            ${this.renderAnnotationList(warnings)}
          </div>
        ` : ''}
      </div>
    `;
  }

  renderAnnotationList(annotations) {
    return `
      <ul class="list-disc list-inside pl-4">
        ${annotations.map(annotation => `
          <li class="flex">
            <div class="truncate max-w-full text-wrap" title="${annotation.message.replace(/"/g, '&quot;')}">
              ${annotation.file}:${annotation.line} - ${annotation.title || annotation.message}
            </div>
          </li>
        `).join('')}
      </ul>
    `;
  }

  getFailureReason(run) {
    if (!run.failureDetails?.length) {
      return 'Unknown failure';
    }

    return run.failureDetails.map(job => {
      const failedSteps = job.steps.map(step =>
        `Step ${step.number} (${step.name}): ${step.error}`
      ).join(', ');
      return `${job.name}: ${failedSteps}`;
    }).join('\n');
  }

  updateLastFetchTime() {
    const lastUpdate = document.getElementById('lastUpdate');
    lastUpdate.textContent = `Last updated: ${new Date().toLocaleString(navigator.language, {
      dateStyle: 'medium',
      timeStyle: 'medium'
    })}`;
  }
}

new ActionsDashboard();
