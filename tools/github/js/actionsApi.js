import errorService, { ErrorCategory, ErrorSeverity } from './ErrorService.js';
import cacheService from './CacheService.js';

class GitHubActionsAPI {
  constructor(token) {
    this.token = token;
    this.baseUrl = 'https://api.github.com';
    this.hasShownScopeWarning = false;
    this.onScopeWarning = null;

    // Set up cache behaviors
    this.setupCacheConfig();
  }

  /**
   * Configure caching behavior
   */
  setupCacheConfig() {
    // We can adjust cache durations based on needs
    const userSettings = {
      cacheTime: parseInt(localStorage.getItem('gh-dashboard-actions-cache-minutes')) || null
    };

    // Apply custom cache duration if user has set it
    if (userSettings.cacheTime && !isNaN(userSettings.cacheTime)) {
      cacheService.setDefaultDuration('actions', userSettings.cacheTime);
    }
  }

  /**
   * Generate a cache key from the URL and any relevant options
   */
  generateCacheKey(url, options = {}) {
    return url;
  }

  async fetchWithRateLimit(url, options = {}) {
    const cacheKey = this.generateCacheKey(url, options);

    // Try to get from cache first
    const cachedData = cacheService.get('actions', cacheKey);
    if (cachedData) {
      return cachedData.data;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `token ${this.token}`,
          'Accept': 'application/vnd.github.v3+json',
          ...options.headers
        }
      });

      // Handle rate limit detection
      const remaining = parseInt(response.headers.get('x-ratelimit-remaining') || '0');
      const resetTime = parseInt(response.headers.get('x-ratelimit-reset') || '0') * 1000;
      const resetDate = new Date(resetTime);

      if (!response.ok) {
        // Special handling for rate limits
        if (response.status === 403 && remaining === 0) {
          const error = new Error(`GitHub API Rate Limit exceeded. Resets at ${resetDate}`);
          error.status = response.status;
          error.resetTime = resetDate;

          errorService.logError(`GitHub API Rate Limit exceeded. Resets at ${resetDate}`, {
            category: ErrorCategory.RATE_LIMIT,
            severity: ErrorSeverity.ERROR,
            context: {
              endpoint: url,
              resetTime: resetDate,
              status: response.status
            }
          });

          throw error;
        }

        // Handle other API errors with detailed parsing
        const responseText = await response.text();
        let responseData = {};
        try {
          responseData = JSON.parse(responseText);
        } catch (e) {
          // Text wasn't JSON, use as is
        }

        // Build an error message that includes documentation_url if available
        let errorMessage = responseData.message || response.statusText || 'Unknown error';
        if (responseData.documentation_url) {
          errorMessage += ` (See: ${responseData.documentation_url})`;
        }

        const error = new Error(`GitHub API Error: ${errorMessage}`);
        error.status = response.status;
        error.response = responseData;
        error.documentationUrl = responseData.documentation_url; // Store separately for programmatic access

        // Log through Error Service with appropriate category
        const category =
          response.status === 401 || response.status === 403 ? ErrorCategory.AUTH :
            response.status === 404 ? ErrorCategory.API :
              ErrorCategory.NETWORK;

        errorService.logApiError(error, url, options);

        throw error;
      }

      const data = await response.json();

      // Store in cache with appropriate type
      cacheService.set('actions', cacheKey, data);

      return data;
    } catch (error) {
      // For network errors (fetch failures) that aren't API errors
      if (!error.status) {
        errorService.logError(`Network Error: ${error.message}`, {
          error,
          category: ErrorCategory.NETWORK,
          context: { endpoint: url }
        });
      }
      throw error;
    }
  }

  /**
   * Prefetch repository data to improve perceived performance
   * This method proactively fetches and caches common API calls
   * @param {string} orgName - Organization name
   * @param {string} repoName - Repository name
   * @param {Object} options - Prefetch options
   * @param {boolean} options.workflows - Whether to prefetch workflows
   * @param {boolean} options.runs - Whether to prefetch recent runs
   * @returns {Promise<void>}
   */
  async prefetchRepositoryData(orgName, repoName, options = { workflows: true, runs: false }) {
    try {
      // Use a lower priority fetch that won't block UI
      const fetchPromises = [];

      // Prefetch workflows data
      if (options.workflows) {
        const workflowsPromise = this.fetchWithRateLimit(
          `${this.baseUrl}/repos/${orgName}/${repoName}/actions/workflows`
        ).catch(err => {
          // Silently log prefetch errors but don't propagate them
          errorService.logError(`Prefetch workflows failed for ${orgName}/${repoName}`, {
            error: err,
            category: ErrorCategory.API,
            severity: ErrorSeverity.INFO, // Lower severity for prefetch errors
            context: { orgName, repoName }
          });
          return null;
        });

        fetchPromises.push(workflowsPromise);
      }

      // Wait for all prefetch operations to complete
      await Promise.all(fetchPromises);
    } catch (error) {
      // Silently fail prefetch operations - they're just optimizations
      errorService.logError(`Repository data prefetch failed for ${orgName}/${repoName}`, {
        error,
        category: ErrorCategory.API,
        severity: ErrorSeverity.INFO,
        context: { orgName, repoName, options }
      });
    }
  }

  /**
   * Prefetch common dashboard data to improve perceived performance
   * This method fetches and caches data that will likely be needed soon
   * @param {string} orgName - Organization name
   * @param {Array<string>} priorityRepos - List of repositories to prioritize in prefetching
   * @returns {Promise<void>}
   */
  async prefetchDashboardData(orgName, priorityRepos = []) {
    // Don't block UI with await - we're just warming the cache
    this.prefetchPromise = (async () => {
      try {
        const startTime = performance.now();

        // Track prefetch requests for analytics
        const prefetchRequests = [];

        // First fetch core organization data
        prefetchRequests.push(this.fetchWithRateLimit(`/orgs/${orgName}`));

        // Get repositories (limited to most active ones to avoid rate limits)
        let repos = priorityRepos;
        if (!repos.length) {
          try {
            // If no priority repos specified, get most recently updated repos
            const allRepos = await this.fetchWithRateLimit(
              `/orgs/${orgName}/repos?sort=updated&direction=desc&per_page=10`
            );
            repos = allRepos.map(repo => repo.name);
          } catch (err) {
            // Non-critical error, just log it
            errorService.logError('Failed to fetch repositories for prefetching', {
              error: err,
              category: ErrorCategory.API,
              severity: ErrorSeverity.INFO,
              context: { operation: 'prefetch', orgName }
            });
          }
        }

        // For each priority repo, prefetch its workflow runs
        const prefetchWorkflowPromises = repos.slice(0, 5).map(async (repoName) => {
          try {
            // Prefetch workflow runs
            prefetchRequests.push(
              this.fetchWithRateLimit(
                `/repos/${orgName}/${repoName}/actions/runs?per_page=10`
              )
            );

            // Also prefetch workflows to get the workflow names
            prefetchRequests.push(
              this.fetchWithRateLimit(
                `/repos/${orgName}/${repoName}/actions/workflows`
              )
            );
          } catch (err) {
            // Non-critical error, just log it
            errorService.logError(`Failed to prefetch data for repo: ${repoName}`, {
              error: err,
              category: ErrorCategory.API,
              severity: ErrorSeverity.INFO,
              context: { operation: 'prefetch', repoName }
            });
          }
        });

        // Start prefetching in parallel
        await Promise.allSettled(prefetchWorkflowPromises);

        // Log prefetch analytics
        const timeElapsed = Math.round(performance.now() - startTime);
        console.debug(`Prefetch completed in ${timeElapsed}ms for ${prefetchRequests.length} requests`);

      } catch (error) {
        // Don't surface prefetch errors to users, just log them
        errorService.logError('Error in prefetch operation', {
          error,
          category: ErrorCategory.API,
          severity: ErrorSeverity.INFO,
          context: { operation: 'prefetch' }
        });
      }
    })();

    // Return immediately to avoid blocking UI
    return;
  }

  async getJobDetails(orgName, repoName, jobId) {
    try {
      const job = await this.fetchWithRateLimit(
        `${this.baseUrl}/repos/${orgName}/${repoName}/actions/jobs/${jobId}`
      );
      return job;
    } catch (error) {
      // Log error but allow graceful fallback
      errorService.logError(`Failed to fetch job details for job ID ${jobId}`, {
        error,
        category: ErrorCategory.API,
        severity: ErrorSeverity.WARNING,
        context: { orgName, repoName, jobId }
      });

      return null;
    }
  }

  async getRunDetails(orgName, repoName, runId) {
    try {
      const jobs = await this.fetchWithRateLimit(
        `${this.baseUrl}/repos/${orgName}/${repoName}/actions/runs/${runId}/jobs`
      );
      const failedJobs = jobs.jobs.filter(job => job.conclusion === 'failure');

      // Get detailed information for failed jobs
      const detailedJobs = await Promise.all(
        failedJobs.map(job => this.getJobDetails(orgName, repoName, job.id))
      );

      return {
        failureDetails: detailedJobs.filter(Boolean).map(job => ({
          name: job.name,
          steps: job.steps.filter(step => step.conclusion === 'failure').map(step => ({
            name: step.name,
            number: step.number,
            error: step.completed_at ? 'Failed' : 'Timeout or canceled'
          }))
        })),
        // Return all job IDs to be used for annotations
        jobIds: jobs.jobs.map(job => job.id)
      };
    } catch (error) {
      // Log error with better context
      errorService.logError(`Failed to fetch run details for run ID ${runId}`, {
        error,
        category: ErrorCategory.API,
        severity: ErrorSeverity.WARNING,
        context: { orgName, repoName, runId }
      });

      return { failureDetails: [], jobIds: [] };
    }
  }

  async getRunAnnotations(orgName, repoName, jobIds = []) {
    try {
      const allAnnotations = [];

      // Fetch annotations for each job through the check-runs endpoint
      for (const jobId of jobIds) {
        try {
          const jobAnnotations = await this.fetchWithRateLimit(
            `${this.baseUrl}/repos/${orgName}/${repoName}/check-runs/${jobId}/annotations`
          );

          const mappedAnnotations = jobAnnotations.map(annotation => ({
            level: annotation.annotation_level,
            message: annotation.message,
            title: annotation.title,
            file: annotation.path,
            line: annotation.start_line
          }));

          allAnnotations.push(...mappedAnnotations);
        } catch (error) {
          // Log individual job annotation errors but continue with others
          errorService.logError(`Failed to fetch annotations for job ID ${jobId}`, {
            error,
            category: ErrorCategory.API,
            severity: ErrorSeverity.WARNING,
            context: { orgName, repoName, jobId }
          });
        }
      }

      return allAnnotations;
    } catch (error) {
      // Improved check for 403/404 errors and ensure callback is triggered
      if ((error.message.includes('GitHub API Error') ||
        error.status === 403 ||
        error.status === 404 ||
        error.message.includes('Not Found')) &&
        !this.hasShownScopeWarning) {

        this.hasShownScopeWarning = true;

        errorService.logError('Missing required scope for annotations (actions:read)', {
          error,
          category: ErrorCategory.AUTH,
          severity: ErrorSeverity.WARNING,
          context: { orgName, repoName }
        });

        // Use setTimeout to ensure this runs after current execution
        setTimeout(() => {
          if (typeof this.onScopeWarning === 'function') {
            this.onScopeWarning();
          }
        }, 0);
      }

      return [];
    }
  }

  async getRepositoryWorkflows(orgName, repoName) {
    try {
      const workflows = await this.fetchWithRateLimit(
        `${this.baseUrl}/repos/${orgName}/${repoName}/actions/workflows`
      );

      const latestRuns = await Promise.all(
        workflows.workflows.map(async workflow => {
          try {
            const runs = await this.fetchWithRateLimit(
              `${this.baseUrl}/repos/${orgName}/${repoName}/actions/workflows/${workflow.id}/runs?per_page=1`
            );
            if (!runs.workflow_runs[0]) {
              return null;
            }

            const lastRun = runs.workflow_runs[0];
            const runDetails = await this.getRunDetails(orgName, repoName, lastRun.id);

            // Use the jobIds from runDetails to get annotations
            const annotations = await this.getRunAnnotations(
              orgName,
              repoName,
              runDetails.jobIds
            );

            return {
              workflowName: workflow.name,
              workflowState: workflow.state,
              isEnabled: workflow.state === "active",
              lastRun: {
                ...lastRun,
                failureDetails: runDetails.failureDetails,
                annotations
              }
            };
          } catch (error) {
            // Log workflow-specific error but continue with other workflows
            errorService.logError(`Failed to fetch runs for workflow ${workflow.name}`, {
              error,
              category: ErrorCategory.API,
              severity: ErrorSeverity.WARNING,
              context: { orgName, repoName, workflowId: workflow.id }
            });

            return null;
          }
        })
      );

      // Filter out nulls from workflows that had errors
      return latestRuns.filter(run => run !== null);
    } catch (error) {
      // Log comprehensive error for repository workflows
      errorService.logError(`Failed to fetch workflows for ${repoName}`, {
        error,
        category: ErrorCategory.API,
        severity: ErrorSeverity.ERROR,
        context: { orgName, repoName }
      });

      return [];
    }
  }

  getStatusColor(status, conclusion) {
    if (status === 'in_progress') return 'yellow';
    if (status === 'completed') {
      switch (conclusion) {
        case 'success': return 'green';
        case 'failure': return 'red';
        case 'cancelled': return 'gray';
        case 'skipped': return 'gray';
        default: return 'yellow';
      }
    }
    return 'gray';
  }
}

export default GitHubActionsAPI;
