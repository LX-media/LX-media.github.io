/**
 * Advanced caching service for API responses
 * Features:
 * - Typed cache stores (PR, REPO, USER, etc.)
 * - Time-based expiration
 * - Size limits with LRU (least recently used) eviction
 * - Analytics and debugging
 */
class CacheService {
  constructor() {
    this.caches = new Map();
    this.analytics = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0,
      byType: {}
    };

    // Default cache durations in minutes
    this.defaultDurations = {
      pr: 60, // PR data cached for 1 hour
      repos: 120, // Repository data cached for 2 hours
      org: 240, // Org data cached for 4 hours
      user: 1440, // User data cached for 24 hours (rarely changes)
      actions: 30 // Actions data cached for 30 minutes
    };

    // Cache size limits (number of entries)
    this.sizeLimits = {
      pr: 500,
      repos: 200,
      org: 20,
      user: 100,
      actions: 100
    };

    // Initialize cache stores
    this._initCaches();
  }

  /**
   * Initialize cache stores for different types
   */
  _initCaches() {
    // Initialize cache stores for each type
    ['PR', 'REPOS', 'ORG', 'USER', 'ACTIONS'].forEach(type => {
      this.caches.set(type, new Map());
      this.analytics.byType[type] = { hits: 0, misses: 0, sets: 0, evictions: 0 };
    });

    // Attempt to load persisted cache data
    this._loadFromLocalStorage();

    // Set up periodic cleanup
    this._setupCleanupInterval();
  }

  /**
   * Set up a periodic cleanup interval to remove expired items
   */
  _setupCleanupInterval() {
    // Run cleanup every 5 minutes
    setInterval(() => this.runCleanup(), 5 * 60 * 1000);
  }

  /**
   * Get normalized cache type
   */
  _normalizeType(type) {
    // Convert to uppercase and handle aliases
    type = type.toUpperCase();

    // Map variants to standard types
    const typeMap = {
      'PULL_REQUEST': 'PR',
      'PR': 'PR',
      'REPO': 'REPOS',
      'REPOS': 'REPOS',
      'REPOSITORY': 'REPOS',
      'REPOSITORIES': 'REPOS',
      'ORGANIZATION': 'ORG',
      'ORG': 'ORG',
      'USER': 'USER',
      'USERS': 'USER',
      'ACTION': 'ACTIONS',
      'ACTIONS': 'ACTIONS'
    };

    return typeMap[type] || 'REPOS'; // Default to REPOS if unknown
  }

  /**
   * Get a value from the cache
   * @param {string} type The cache type (PR, REPOS, USER, etc.)
   * @param {string} key The cache key
   * @returns {Object|null} The cached data or null if not found
   */
  get(type, key) {
    const normalizedType = this._normalizeType(type);
    const cache = this.caches.get(normalizedType);

    if (!cache) {
      this.analytics.misses++;
      return null;
    }

    const cachedItem = cache.get(key);

    // If not in cache or expired
    if (!cachedItem || (cachedItem.expiresAt && cachedItem.expiresAt < Date.now())) {
      this.analytics.misses++;
      this.analytics.byType[normalizedType].misses++;

      // Remove if expired
      if (cachedItem && cachedItem.expiresAt < Date.now()) {
        cache.delete(key);
      }

      return null;
    }

    // Update access time for LRU algorithm
    cachedItem.lastAccessed = Date.now();

    // Track analytics
    this.analytics.hits++;
    this.analytics.byType[normalizedType].hits++;

    return cachedItem;
  }

  /**
   * Set a value in the cache
   * @param {string} type The cache type (PR, REPOS, USER, etc.)
   * @param {string} key The cache key
   * @param {any} data The data to cache
   * @param {number} [duration] Optional override for cache duration in minutes
   */
  set(type, key, data, duration) {
    const normalizedType = this._normalizeType(type);
    let cache = this.caches.get(normalizedType);

    if (!cache) {
      cache = new Map();
      this.caches.set(normalizedType, cache);
      this.analytics.byType[normalizedType] = { hits: 0, misses: 0, sets: 0, evictions: 0 };
    }

    // Get duration in ms (default from type or override)
    const durationMinutes = duration || this.defaultDurations[normalizedType.toLowerCase()] || 60;
    const expiresAt = Date.now() + (durationMinutes * 60 * 1000);

    // Check if we need to evict items
    if (cache.size >= this.sizeLimits[normalizedType.toLowerCase()]) {
      this._evictLRU(normalizedType);
    }

    // Store with metadata
    cache.set(key, {
      data,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      expiresAt,
      type: normalizedType
    });

    // Track analytics
    this.analytics.sets++;
    this.analytics.byType[normalizedType].sets++;

    // Periodically save to localStorage
    this._debouncedSaveToLocalStorage();

    return true;
  }

  /**
   * Remove an item from the cache
   * @param {string} type The cache type
   * @param {string} key The cache key
   */
  remove(type, key) {
    const normalizedType = this._normalizeType(type);
    const cache = this.caches.get(normalizedType);

    if (cache) {
      return cache.delete(key);
    }

    return false;
  }

  /**
   * Clear all items of a specific type
   * @param {string} type The cache type or 'ALL' to clear everything
   */
  clearType(type) {
    if (type === 'ALL') {
      this.caches.forEach((cache, type) => {
        cache.clear();
      });
      return true;
    }

    const normalizedType = this._normalizeType(type);
    const cache = this.caches.get(normalizedType);

    if (cache) {
      cache.clear();
      return true;
    }

    return false;
  }

  /**
   * Run cleanup to remove expired entries
   */
  runCleanup() {
    let totalRemoved = 0;

    this.caches.forEach((cache, type) => {
      const now = Date.now();
      let removed = 0;

      cache.forEach((value, key) => {
        if (value.expiresAt && value.expiresAt < now) {
          cache.delete(key);
          removed++;
          totalRemoved++;
        }
      });

      if (removed > 0) {
        console.debug(`Cache cleanup: Removed ${removed} expired items from ${type}`);
      }
    });

    return totalRemoved;
  }

  /**
   * Set default duration for a specific cache type
   * @param {string} type The cache type
   * @param {number} minutes Duration in minutes
   */
  setDefaultDuration(type, minutes) {
    const normalizedType = this._normalizeType(type).toLowerCase();
    if (minutes > 0) {
      this.defaultDurations[normalizedType] = minutes;
      return true;
    }
    return false;
  }

  /**
   * Evict least recently used items from cache when it reaches size limit
   * @param {string} type The cache type
   */
  _evictLRU(type) {
    const cache = this.caches.get(type);
    if (!cache || cache.size === 0) return;

    // Convert to array for sorting
    const entries = Array.from(cache.entries());

    // Sort by last accessed (oldest first)
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    // Remove 10% of oldest entries or at least one
    const removeCount = Math.max(1, Math.floor(entries.length * 0.1));

    for (let i = 0; i < removeCount; i++) {
      if (entries[i]) {
        cache.delete(entries[i][0]);
        this.analytics.evictions++;
        this.analytics.byType[type].evictions++;
      }
    }

    console.debug(`Cache eviction: Removed ${removeCount} LRU items from ${type}`);
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const stats = {
      ...this.analytics,
      hitRate: this.analytics.hits / (this.analytics.hits + this.analytics.misses) || 0,
      size: {}
    };

    this.caches.forEach((cache, type) => {
      stats.size[type] = cache.size;
    });

    return stats;
  }

  /**
   * Save cache to localStorage (debounced)
   */
  _debouncedSaveToLocalStorage() {
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout);
    }

    this._saveTimeout = setTimeout(() => {
      this._saveToLocalStorage();
    }, 5000); // Wait 5 seconds of inactivity before saving
  }

  /**
   * Save cache to localStorage
   */
  _saveToLocalStorage() {
    try {
      // We'll only persist certain caches that are valuable across page loads
      const persistTypes = ['USER', 'ORG']; // These change less frequently

      const persistData = {};

      persistTypes.forEach(type => {
        const cache = this.caches.get(type);
        if (cache && cache.size > 0) {
          persistData[type] = Array.from(cache.entries());
        }
      });

      if (Object.keys(persistData).length > 0) {
        localStorage.setItem('gh-dashboard-cache', JSON.stringify(persistData));
      }
    } catch (e) {
      console.warn('Failed to save cache to localStorage', e);
    }
  }

  /**
   * Load cache from localStorage
   */
  _loadFromLocalStorage() {
    try {
      const saved = localStorage.getItem('gh-dashboard-cache');
      if (saved) {
        const data = JSON.parse(saved);

        // Restore each cache type
        Object.entries(data).forEach(([type, entries]) => {
          if (Array.isArray(entries)) {
            const cache = this.caches.get(type) || new Map();

            entries.forEach(([key, value]) => {
              // Only restore if not expired
              if (value && (!value.expiresAt || value.expiresAt > Date.now())) {
                cache.set(key, value);
              }
            });

            this.caches.set(type, cache);
          }
        });
      }
    } catch (e) {
      console.warn('Failed to load cache from localStorage', e);
    }
  }
}

// Create and export a singleton instance
const cacheService = new CacheService();
export default cacheService;
