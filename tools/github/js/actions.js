import GitHubActionsAPI from './actionsApi.js';
import { BaseDashboard } from './baseDashboard.js';
import {
  createLoadingSkeletonList,
  createWorkflowItem,
  createPanel,
  createFilterCount
} from './components.js';

class ActionsDashboard extends BaseDashboard {
  constructor() {
    // Call the parent constructor with Actions dashboard specific options
    const initSuccess = super({ storageKeyPrefix: 'gh-dashboard-actions' });
    if (!initSuccess) {
      return;
    }

    // Initialize filter state
    this.activeFilters = {
      status: new Set(),
      annotations: new Set(),
      hideDisabled: new Set(['true']) // Default to hiding disabled workflows
    };
    this.allWorkflows = [];
    this.storageKey = `${this.storageKeyPrefix}-filters-${this.orgName}`;

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

    // Restore saved filters
    this.loadSavedFilters();

    this.initialize();
    this.setupEventListeners();
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

    // Setup Clear filters button (using the base method)
    this.setupClearFiltersButton(() => {
      this.clearFilters();
    });

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

  async initialize() {
    try {
      const org = await this.loadOrganization();
      if (org) {
        document.getElementById('orgName').textContent = `${org.name || this.orgName} Actions`;
        document.title = `${org.name || this.orgName} - GitHub Actions Dashboard`;
      }

      await this.loadActionsMatrix();

      // Apply saved filters on initial load
      this.updateFilterButtonState();
    } catch (error) {
      this.showError("Is the token set correctly?\n" + error.stack);
    }
  }

  async loadActionsMatrix(forceRefresh = false) {
    const matrix = document.getElementById('actionsMatrix');

    // Show loading state using shared component
    matrix.innerHTML = createLoadingSkeletonList({
      itemCount: 3,
      includeHeader: true
    });

    try {
      const repos = await this.loadRepositories();

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
      this.showError(`Error loading workflows: ${error.message}`);
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

    // Use shared component for filter count
    filterCountsElement.innerHTML = createFilterCount(filtered, total, activeFilterCount);
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
    // Use the shared panel component for the container
    return createPanel(
      `<div class="space-y-3">
        ${repo.workflows.map(workflow => this.renderWorkflowItem(workflow)).join('')}
      </div>`,
      {
        heading: `${repo.name} <span class="text-sm text-gray-500 dark:text-gray-400">${repo.workflows.length} workflow${repo.workflows.length !== 1 ? 's' : ''}</span>`,
        extraClasses: "bg-white dark:bg-gray-800 p-4 rounded-lg shadow"
      }
    );
  }

  renderWorkflowItem(workflow) {
    // Use the shared component for workflow items
    return createWorkflowItem(workflow, {
      getStatusColor: this.actions.getStatusColor.bind(this.actions),
      getFailureReason: this.getFailureReason.bind(this),
      renderAnnotations: this.renderAnnotations.bind(this)
    });
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
}

new ActionsDashboard();
