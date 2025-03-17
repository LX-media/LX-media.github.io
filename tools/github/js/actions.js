import GitHubActionsAPI from './actionsApi.js';
import GitHubAPI from './githubApi.js';
import { getConfig } from './config.js';

class ActionsDashboard {
  constructor() {
    this.setupDarkMode();

    // Get token from querystring if present
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const { orgName } = getConfig();

    this.orgName = orgName;
    this.token = token;

    if (!this.token) {
      this.showError(
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
        'GitHub token is missing required scopes. To be able to view annotations in workflow runs, add:\n' +
        '• actions:read (access to Actions runs and annotations)'
      );
    };

    this.initialize();
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

  async loadActionsMatrix() {
    const repos = await this.github.getActiveRepositories(this.orgName);
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

    const reposWithActions = await Promise.all(
      repos.map(async repo => {
        const workflows = await this.actions.getRepositoryWorkflows(this.orgName, repo.name);
        return {
          name: repo.name,
          workflows
        };
      })
    );

    matrix.innerHTML = reposWithActions
      .filter(repo => repo.workflows.length > 0)
      .map(repo => this.renderRepoWorkflows(repo))
      .join('');

    this.updateLastFetchTime();
  }

  renderRepoWorkflows(repo) {
    return `
      <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">${repo.name}</h2>
        <div class="space-y-3">
          ${repo.workflows.map(workflow => {
      const status = workflow.lastRun.status;
      const conclusion = workflow.lastRun.conclusion;
      const color = this.actions.getStatusColor(status, conclusion);
      const statusClass = `bg-${color}-100 dark:bg-${color}-900 text-${color}-800 dark:text-${color}-200`;

      // Debug logging
      // console.log('Workflow:', workflow.workflowName);
      // console.log('Annotations:', workflow.lastRun.annotations);
      const hasAnnotations = Array.isArray(workflow.lastRun.annotations) && workflow.lastRun.annotations.length > 0;
      // console.log('Has annotations:', hasAnnotations);

      return `
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-${color}-500"></span>
                    <a href="${workflow.lastRun.html_url}" target="_blank"
                       class="text-blue-600 dark:text-blue-400 hover:underline">
                      ${workflow.workflowName}
                    </a>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="px-2 py-1 text-xs rounded ${statusClass}">
                      ${status === 'completed' ? conclusion : status}
                    </span>
                    ${workflow.lastRun.conclusion === 'failure' ? `
                      <span class="text-sm text-red-600 dark:text-red-400 max-w-md truncate"
                            title="${this.getFailureReason(workflow.lastRun).replace(/"/g, '&quot;')}">
                        ${this.getFailureReason(workflow.lastRun).split('\n')[0]}
                      </span>
                    ` : ''}
                  </div>
                </div>
                ${hasAnnotations ? this.renderAnnotations(workflow.lastRun.annotations) : ''}
              </div>
            `;
    }).join('')}
        </div>
      </div>
    `;
  }

  renderAnnotations(annotations) {
    const warnings = annotations.filter(a => a.level === 'warning');
    const errors = annotations.filter(a => a.level === 'error');

    if (!warnings.length && !errors.length) return '';

    return `
      <div class="pl-4 text-sm space-y-2">
        ${errors.length > 0 ? `
          <div class="text-red-600 dark:text-red-400">
            <div class="font-medium">Errors:</div>
            ${this.renderAnnotationList(errors)}
          </div>
        ` : ''}
        ${warnings.length > 0 ? `
          <div class="text-yellow-600 dark:text-yellow-400">
            <div class="font-medium">Warnings:</div>
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
          <li class="truncate" title="${annotation.message.replace(/"/g, '&quot;')}">
            ${annotation.file}:${annotation.line} - ${annotation.title || annotation.message}
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
