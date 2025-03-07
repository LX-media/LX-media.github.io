class GitHubAPI {
  constructor(token) {
    this.token = token;
    this.baseUrl = 'https://api.github.com';
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.reviewStateCache = new Map();
    this.rateLimitWarningThreshold = 100; // Warn when remaining calls are below this
    this.onRateLimitWarning = () => { }; // Callback for rate limit warnings
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

    // Rate limit handling
    const remaining = parseInt(response.headers.get('x-ratelimit-remaining'));
    const resetTime = parseInt(response.headers.get('x-ratelimit-reset')) * 1000;

    if (remaining < this.rateLimitWarningThreshold) {
      this.onRateLimitWarning({
        remaining,
        resetTime: new Date(resetTime),
        resetTimeMs: resetTime - Date.now()
      });
    }

    if (!response.ok) {
      if (response.status === 403 && remaining === 0) {
        throw new Error(`GitHub API Rate Limit exceeded. Resets at ${new Date(resetTime)}`);
      }
      throw new Error(`GitHub API Error: ${response.statusText}`);
    }

    const data = await response.json();
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });

    return data;
  }

  async getOrganization(orgName) {
    return this.fetchWithRateLimit(`${this.baseUrl}/orgs/${orgName}`);
  }

  async getActiveRepositories(orgName) {
    const repos = await this.fetchWithRateLimit(
      `${this.baseUrl}/orgs/${orgName}/repos?sort=pushed&direction=desc&per_page=20`
    );
    return repos.filter(repo => !repo.archived);
  }

  async getAllRepositories(orgName) {
    const allRepos = [];
    let page = 1;

    while (true) {
      const repos = await this.fetchWithRateLimit(
        `${this.baseUrl}/orgs/${orgName}/repos?page=${page}&per_page=100`
      );

      if (repos.length === 0) break;
      allRepos.push(...repos.filter(repo => !repo.archived));
      page++;
    }

    return allRepos;
  }

  async getOpenPullRequests(orgName) {
    const repos = await this.getAllRepositories(orgName);
    const pullRequests = [];

    for (const repo of repos) {
      const prs = await this.fetchWithRateLimit(
        `${this.baseUrl}/repos/${orgName}/${repo.name}/pulls?state=open`
      );

      // Fetch reviews for each PR
      for (const pr of prs) {
        const reviews = await this.getPullRequestReviews(orgName, repo.name, pr.number);
        const reviewState = this.determineReviewState(reviews);

        pullRequests.push({
          ...pr,
          repoName: repo.name,
          reviewState,
          reviews
        });
      }
    }

    return pullRequests;
  }

  // Cache review states with PR number as key
  async getPullRequestReviews(orgName, repoName, prNumber) {
    const cacheKey = `${orgName}/${repoName}/${prNumber}/reviews`;
    if (this.reviewStateCache.has(cacheKey)) {
      return this.reviewStateCache.get(cacheKey);
    }

    const reviews = await this.fetchWithRateLimit(
      `${this.baseUrl}/repos/${orgName}/${repoName}/pulls/${prNumber}/reviews`
    );

    this.reviewStateCache.set(cacheKey, reviews);
    return reviews;
  }

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
}

export default GitHubAPI;
