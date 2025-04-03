class GitHubActionsAPI {
  constructor(token) {
    this.token = token;
    this.baseUrl = 'https://api.github.com';
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.hasShownScopeWarning = false;
    this.onScopeWarning = null;
  }

  async fetchWithRateLimit(url, options = {}) {
    const cacheKey = url;
    const cachedData = this.cache.get(cacheKey);

    if (cachedData && (Date.now() - cachedData.timestamp) < this.cacheTimeout) {
      return cachedData.data;
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `token ${this.token}`,
        'Accept': 'application/vnd.github.v3+json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const status = response.status;
      const responseText = await response.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        responseData = {};
      }

      const errorParts = [`GitHub API Error: ${status}`];

      if (response.statusText) {
        errorParts.push(`Status: ${response.statusText}`);
      }

      if (responseData.message) {
        errorParts.push(`Message: ${responseData.message}`);
      }

      if (responseData.documentation_url) {
        errorParts.push(`Documentation: ${responseData.documentation_url}`);
      }

      throw new Error(errorParts.join('. '));
    }

    const data = await response.json();
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });

    return data;
  }

  async getJobDetails(orgName, repoName, jobId) {
    try {
      const job = await this.fetchWithRateLimit(
        `${this.baseUrl}/repos/${orgName}/${repoName}/actions/jobs/${jobId}`
      );
      return job;
    } catch (error) {
      console.warn(`Failed to fetch job details for ${jobId}:`, error);
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
      console.warn(`Failed to fetch run details for ${runId}:`, error);
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
          console.warn(`Failed to fetch annotations for job ${jobId}:`, error);
        }
      }

      return allAnnotations;
    } catch (error) {
      // Improved check for 404 errors and ensure callback is triggered
      if ((error.message.includes('GitHub API Error') || error.message.includes('403') || error.message.includes('Not Found')) && !this.hasShownScopeWarning) {
        this.hasShownScopeWarning = true;
        console.log('Detected missing scope for annotations, showing warning');

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
        })
      );

      return latestRuns.filter(run => run !== null);
    } catch (error) {
      console.warn(`Failed to fetch workflows for ${repoName}:`, error);
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
