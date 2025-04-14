import errorService, { ErrorCategory, ErrorSeverity } from './ErrorService.js';
import cacheService from './CacheService.js';

class GitHubAPI {
  constructor(token) {
    this.token = token;
    this.baseUrl = 'https://api.github.com';
    this.rateLimitWarningThreshold = 100; // Warn when remaining calls are below this
    this.onRateLimitWarning = () => { }; // Callback for rate limit warnings
    this.reposPerPage = parseInt(localStorage.getItem('gh-dashboard-repos-per-page')) || 20;

    // Set up cache behaviors - using the new CacheService
    this.setupCacheConfig();
  }

  /**
   * Configure caching behavior
   */
  setupCacheConfig() {
    // We can adjust cache durations based on needs
    const userSettings = {
      cacheTime: parseInt(localStorage.getItem('gh-dashboard-cache-minutes')) || null,
      userCacheTime: parseInt(localStorage.getItem('gh-dashboard-user-cache-days')) || null
    };

    // Apply custom cache duration if user has set it
    if (userSettings.cacheTime && !isNaN(userSettings.cacheTime)) {
      cacheService.setDefaultDuration('pr', userSettings.cacheTime);
      cacheService.setDefaultDuration('repo', userSettings.cacheTime * 2); // repos cache longer than PRs
    }

    if (userSettings.userCacheTime && !isNaN(userSettings.userCacheTime)) {
      cacheService.setDefaultDuration('user', userSettings.userCacheTime * 24 * 60); // convert days to minutes
    }
  }

  /**
   * Make API requests with caching and rate limit handling
   */
  async fetchWithRateLimit(url, options = {}) {
    // Generate a cache key from the URL and any relevant options
    const cacheKey = this.generateCacheKey(url, options);
    const cacheType = this.determineCacheType(url);

    // Try to get from cache first
    const cachedData = cacheService.get(cacheType, cacheKey);
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

      // Handle rate limits
      this.handleRateLimits(response, url);

      if (!response.ok) {
        await this.handleErrorResponse(response, url, options);
      }

      const data = await response.json();

      // Store in cache with appropriate type
      cacheService.set(cacheType, cacheKey, data);

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
   * Generate a consistent cache key
   */
  generateCacheKey(url, options = {}) {
    // Extract query parameters for the cache key
    const queryStart = url.indexOf('?');
    const baseUrl = queryStart > -1 ? url.substring(0, queryStart) : url;
    const queryParams = queryStart > -1 ? url.substring(queryStart) : '';

    // Include body in cache key if it's a POST/PUT request
    let bodyKey = '';
    if (options.method && ['POST', 'PUT', 'PATCH'].includes(options.method.toUpperCase()) && options.body) {
      try {
        // If it's JSON, we can use it directly
        if (typeof options.body === 'string') {
          bodyKey = `-${options.body}`;
        } else {
          bodyKey = `-${JSON.stringify(options.body)}`;
        }
      } catch {
        // If we can't stringify it, use a simple hash
        bodyKey = `-body-${options.body.length || 0}`;
      }
    }

    // Create a key that uniquely identifies this request
    return `${baseUrl}${queryParams}${bodyKey}`;
  }

  /**
   * Determine the appropriate cache type based on the URL
   */
  determineCacheType(url) {
    if (url.includes('/pulls') || url.includes('/pull/')) {
      return 'PR';
    } else if (url.includes('/repos/') && !url.includes('/pulls')) {
      return 'REPOS';
    } else if (url.includes('/orgs/')) {
      return 'ORG';
    } else if (url.includes('/users/')) {
      return 'USER';
    } else if (url.includes('/actions/')) {
      return 'ACTIONS';
    } else {
      // Default for any other endpoints
      return 'REPOS';
    }
  }

  /**
   * Handle GitHub API rate limits
   */
  handleRateLimits(response, url) {
    const remaining = parseInt(response.headers.get('x-ratelimit-remaining') || '0');
    const resetTime = parseInt(response.headers.get('x-ratelimit-reset') || '0') * 1000;

    if (remaining < this.rateLimitWarningThreshold) {
      // Log rate limit warning through ErrorService
      errorService.logError(`GitHub API Rate Limit Warning: ${remaining} calls remaining until ${new Date(resetTime)}`, {
        category: ErrorCategory.RATE_LIMIT,
        severity: ErrorSeverity.WARNING,
        context: {
          remaining,
          resetTime: new Date(resetTime),
          endpoint: url
        }
      });

      // Trigger warning callback if set
      this.onRateLimitWarning({
        remaining,
        resetTime: new Date(resetTime),
        resetTimeMs: resetTime - Date.now()
      });

      // Adjust cache durations based on rate limit status
      // If we're low on API calls, make the cache last longer
      if (remaining < 50) {
        const multiplier = remaining < 20 ? 3 : 2;
        cacheService.setDefaultDuration('pr', cacheService.defaultDurations.pr * multiplier);
        cacheService.setDefaultDuration('repo', cacheService.defaultDurations.repo * multiplier);
      }
    }

    // Special handling for rate limit exceeded
    if (!response.ok && response.status === 403 && remaining === 0) {
      const resetDate = new Date(resetTime);
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
  }

  /**
   * Handle error responses
   */
  async handleErrorResponse(response, url, options) {
    const responseText = await response.text();
    let responseData = {};
    try {
      responseData = JSON.parse(responseText);
    } catch {
      // Text wasn't JSON, use as is
    }

    // Build error message with documentation URL if available
    let errorMessage = responseData.message || response.statusText || 'Unknown error';
    if (responseData.documentation_url) {
      errorMessage += ` (See: ${responseData.documentation_url})`;
    }

    const error = new Error(`GitHub API Error: ${errorMessage}`);
    error.status = response.status;
    error.response = responseData;
    error.documentationUrl = responseData.documentation_url;

    // Log through Error Service with appropriate category
    const category =
      response.status === 401 || response.status === 403 ? ErrorCategory.AUTH :
        response.status === 404 ? ErrorCategory.API :
          ErrorCategory.NETWORK;

    errorService.logApiError(error, url, options);

    throw error;
  }

  /**
   * Get user details with improved caching
   */
  async getUserDetails(username) {
    // First check if user is in cache
    const cacheKey = username;
    const cachedUser = cacheService.get('USER', cacheKey);

    if (cachedUser) {
      return cachedUser.data;
    }

    try {
      const user = await this.fetchWithRateLimit(`${this.baseUrl}/users/${username}`);
      const data = {
        login: user.login,
        name: user.name || user.login
      };

      // Cache with long duration (user data rarely changes)
      cacheService.set('USER', cacheKey, data);
      return data;
    } catch (error) {
      // Log error but don't fail the operation
      errorService.logError(`Failed to fetch details for user ${username}`, {
        error,
        category: ErrorCategory.API,
        severity: ErrorSeverity.WARNING,
        context: { username }
      });

      // Return minimal fallback without caching
      return { login: username, name: username };
    }
  }

  /**
   * Get organization details with caching
   */
  async getOrganization(orgName) {
    try {
      return await this.fetchWithRateLimit(`${this.baseUrl}/orgs/${orgName}`);
    } catch (error) {
      // Enhanced error with more context
      const enhancedError = new Error(`Failed to fetch organization '${orgName}': ${error.message}`);
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }

  /**
   * Get active repositories with improved caching
   */
  async getActiveRepositories(orgName) {
    try {
      const repos = await this.fetchWithRateLimit(
        `${this.baseUrl}/orgs/${orgName}/repos?sort=pushed&direction=desc&per_page=${this.reposPerPage}`,
        {
          headers: {
            'Accept': 'application/vnd.github.mercy-preview+json' // Required for topics
          }
        }
      );
      return repos.filter(repo => !repo.archived);
    } catch (error) {
      const enhancedError = new Error(`Failed to fetch repositories for '${orgName}': ${error.message}`);
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }

  /**
   * Get all repositories with batched loading and caching
   */
  async getAllRepositories(orgName) {
    // Check if we already have a complete list
    const cacheKey = `all-repos-${orgName}`;
    const cachedRepos = cacheService.get('REPOS', cacheKey);

    if (cachedRepos) {
      return cachedRepos.data;
    }

    const allRepos = [];
    let page = 1;

    try {
      // Use Promise.all for parallel loading with a limit of 3 concurrent requests
      const loadPages = async (startPage, count) => {
        const pagePromises = [];
        for (let p = startPage; p < startPage + count; p++) {
          pagePromises.push(
            this.fetchWithRateLimit(
              `${this.baseUrl}/orgs/${orgName}/repos?page=${p}&per_page=100`
            ).catch(error => {
              // If we get an error (like a 404 on a page that doesn't exist),
              // just return an empty array for that page
              errorService.logError(`Failed to fetch page ${p} of repos`, {
                error,
                category: ErrorCategory.API,
                severity: ErrorSeverity.WARNING,
                context: { orgName, page: p }
              });
              return [];
            })
          );
        }

        return Promise.all(pagePromises);
      };

      // Load first 3 pages in parallel
      const initialPages = await loadPages(1, 3);

      // Process initial pages
      initialPages.forEach(repos => {
        if (repos.length > 0) {
          allRepos.push(...repos.filter(repo => !repo.archived));
        }
      });

      // Determine if we need to fetch more pages
      page = 4;
      let hasMoreData = initialPages[2] && initialPages[2].length > 0;

      // Fetch additional pages as needed (3 at a time)
      while (hasMoreData) {
        const nextPages = await loadPages(page, 3);
        hasMoreData = false;

        nextPages.forEach(repos => {
          if (repos.length > 0) {
            allRepos.push(...repos.filter(repo => !repo.archived));
            hasMoreData = true;
          }
        });

        page += 3;

        // Safety check - don't go beyond 20 pages (2000 repos)
        if (page > 20) break;
      }

      // Cache the complete list
      cacheService.set('REPOS', cacheKey, allRepos);
      return allRepos;
    } catch (error) {
      const enhancedError = new Error(`Failed to fetch all repositories for '${orgName}': ${error.message}`);
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }

  /**
   * Get open pull requests with parallel loading and caching
   */
  async getOpenPullRequests(orgName) {
    // Check if we have cached data
    const cacheKey = `open-prs-${orgName}`;
    const cachedPRs = cacheService.get('PR', cacheKey);

    if (cachedPRs) {
      return cachedPRs.data;
    }

    try {
      // Get all repositories first
      const repos = await this.getAllRepositories(orgName);
      const pullRequests = [];

      // Batch process repositories (8 at a time to avoid overloading the API)
      const batchSize = 8;

      for (let i = 0; i < repos.length; i += batchSize) {
        const batch = repos.slice(i, i + batchSize);

        // Process this batch in parallel
        const batchResults = await Promise.all(
          batch.map(async (repo) => {
            try {
              const prs = await this.fetchWithRateLimit(
                `${this.baseUrl}/repos/${orgName}/${repo.name}/pulls?state=open`
              );

              // Process PRs for this repo and get additional data where needed
              const processedPRs = await this.processPullRequests(orgName, repo.name, prs);
              return processedPRs;
            } catch (repoError) {
              // Log error but continue with other repositories
              errorService.logError(`Error fetching PRs from ${repo.name}`, {
                error: repoError,
                category: ErrorCategory.API,
                severity: ErrorSeverity.WARNING,
                context: {
                  orgName,
                  repoName: repo.name
                }
              });
              return [];
            }
          })
        );

        // Add all PRs from this batch to our results
        batchResults.forEach(repoPRs => {
          pullRequests.push(...repoPRs);
        });
      }

      // Cache the results
      cacheService.set('PR', cacheKey, pullRequests);
      return pullRequests;
    } catch (error) {
      const enhancedError = new Error(`Failed to fetch pull requests: ${error.message}`);
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }

  /**
   * Process pull requests with details and reviews
   */
  async processPullRequests(orgName, repoName, prs) {
    const processedPRs = [];

    // Process PRs in batches of 4 to limit concurrent requests
    const batchSize = 4;

    for (let i = 0; i < prs.length; i += batchSize) {
      const batch = prs.slice(i, i + batchSize);

      // Process this batch in parallel
      const batchResults = await Promise.all(
        batch.map(async (pr) => {
          try {
            // Get reviews and user details in parallel
            const [reviews, userDetails] = await Promise.all([
              this.getPullRequestReviews(orgName, repoName, pr.number),
              this.getUserDetails(pr.user.login)
            ]);

            const reviewState = this.determineReviewState(reviews);

            return {
              number: pr.number,
              title: pr.title,
              html_url: pr.html_url,
              created_at: pr.created_at,
              updated_at: pr.updated_at,
              repoName: repoName,
              user: userDetails,
              labels: pr.labels.map(label => ({
                name: label.name,
                color: label.color
              })),
              reviewState,
              isDraft: pr.draft,
              reviews: reviews.map(review => ({
                state: review.state,
                user: { id: review.user.id },
                submitted_at: review.submitted_at
              }))
            };
          } catch (prError) {
            // Log the error but continue processing other PRs
            errorService.logError(`Error processing PR #${pr.number} in ${repoName}`, {
              error: prError,
              category: ErrorCategory.API,
              severity: ErrorSeverity.WARNING,
              context: {
                orgName,
                repoName,
                prNumber: pr.number
              }
            });
            return null;
          }
        })
      );

      // Add successful results to our processed PRs
      batchResults.filter(Boolean).forEach(pr => {
        processedPRs.push(pr);
      });
    }

    return processedPRs;
  }

  /**
   * Get PR reviews with improved caching
   */
  async getPullRequestReviews(orgName, repoName, prNumber) {
    // Generate cache key for this specific PR's reviews
    const cacheKey = `${orgName}-${repoName}-${prNumber}-reviews`;
    const cachedReviews = cacheService.get('PR', cacheKey);

    if (cachedReviews) {
      return cachedReviews.data;
    }

    try {
      const reviews = await this.fetchWithRateLimit(
        `${this.baseUrl}/repos/${orgName}/${repoName}/pulls/${prNumber}/reviews`
      );

      // Cache the results but with a shorter expiry (reviews change more frequently)
      cacheService.set('PR', cacheKey, reviews, 30); // 30 minute cache for reviews
      return reviews;
    } catch (error) {
      // Log error but don't block the process - just return empty reviews
      errorService.logError(`Failed to fetch PR reviews for ${repoName}#${prNumber}`, {
        error,
        category: ErrorCategory.API,
        severity: ErrorSeverity.WARNING,
        context: {
          orgName,
          repoName,
          prNumber
        }
      });

      return [];
    }
  }

  /**
   * Determine review state from reviews
   */
  determineReviewState(reviews) {
    if (!reviews.length) return 'PENDING';

    // Get latest review per reviewer
    const latestReviews = new Map();
    reviews.forEach(review => {
      const existing = latestReviews.get(review.user.id);
      if (!existing || new Date(existing.submitted_at) < new Date(review.submitted_at)) {
        latestReviews.set(review.user.id, review);
      }
    });

    // Check final states
    const states = [...latestReviews.values()].map(r => r.state);
    if (states.includes('CHANGES_REQUESTED')) return 'CHANGES_REQUESTED';
    if (states.includes('APPROVED')) return 'APPROVED';
    return 'PENDING';
  }

  /**
   * Clear caches for specific data types or for a specific organization
   */
  clearCache(type, orgName = null) {
    if (type === 'ALL') {
      // Clear all cache types
      cacheService.clearType('ALL');
    } else if (orgName) {
      // Clear cache for specific org
      const cacheKey = type === 'PR' ? `open-prs-${orgName}` :
        type === 'REPOS' ? `all-repos-${orgName}` :
          null;

      if (cacheKey) {
        cacheService.remove(type, cacheKey);
      }
    } else {
      // Clear entire type
      cacheService.clearType(type);
    }
  }
}

export default GitHubAPI;
