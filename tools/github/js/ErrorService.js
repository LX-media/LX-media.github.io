/**
 * Error Handling and Logging Service
 *
 * This service provides centralized error handling and logging functionality:
 * - Consistent error classification
 * - Standardized error messages
 * - Centralized logging
 * - Error recovery strategies
 */

// Error severity levels
export const ErrorSeverity = {
  INFO: 'info',       // Informational messages, not errors
  WARNING: 'warning', // Non-critical errors that don't break functionality
  ERROR: 'error',     // Errors that impact functionality but don't crash the app
  CRITICAL: 'critical' // Severe errors that prevent core functionality
};

// Error categories for classification
export const ErrorCategory = {
  NETWORK: 'network',     // Network/connectivity related errors
  API: 'api',             // GitHub API errors
  AUTH: 'auth',           // Authentication/authorization errors
  RATE_LIMIT: 'rateLimit', // API rate limiting
  CACHE: 'cache',         // Cache read/write errors
  RENDER: 'render',       // UI rendering errors
  CONFIG: 'config'        // Configuration errors
};

class ErrorService {
  constructor() {
    this.listeners = new Set();
    this.errorLog = [];
    this.maxLogSize = 100; // Limit size of in-memory log

    // Default UI error handler
    this.uiErrorElement = null;
  }

  /**
   * Log an error with structured metadata
   * @param {string} message - Error message
   * @param {Object} options - Error options
   * @param {Error} options.error - Original error object
   * @param {string} options.category - Error category
   * @param {string} options.severity - Error severity
   * @param {Object} options.context - Additional context about the error
   */
  logError(message, options = {}) {
    const {
      error = null,
      category = ErrorCategory.API,
      severity = ErrorSeverity.ERROR,
      context = {}
    } = options;

    const timestamp = new Date();
    const errorEntry = {
      message,
      timestamp,
      category,
      severity,
      context: {
        ...context,
        url: window.location.href,
        userAgent: navigator.userAgent
      }
    };

    // Add stack trace if available
    if (error && error.stack) {
      errorEntry.stack = error.stack;
    }

    console[severity === ErrorSeverity.INFO ? 'info' :
      severity === ErrorSeverity.WARNING ? 'warn' : 'error'](
        `[${timestamp.toISOString()}] [${severity.toUpperCase()}] [${category}] ${message}`,
        error || '',
        context
      );

    // Add to in-memory log with size limit
    this.errorLog.push(errorEntry);
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }

    // Notify all listeners
    this.notifyListeners(errorEntry);

    return errorEntry;
  }

  /**
   * Specialized method for logging API errors
   * @param {Error} error - Error object
   * @param {string} endpoint - The API endpoint
   * @param {Object} params - The API parameters
   */
  logApiError(error, endpoint, params = {}) {
    // Determine if this is a rate limit error
    const isRateLimit = error.message &&
      (error.message.includes('rate limit') ||
        error.message.includes('API Rate Limit'));

    // Determine severity based on the error
    const severity = isRateLimit ?
      ErrorSeverity.WARNING :
      ErrorSeverity.ERROR;

    // Determine category based on error type
    const category = isRateLimit ?
      ErrorCategory.RATE_LIMIT :
      error.message?.includes('401') ? ErrorCategory.AUTH :
        error.message?.includes('403') ? ErrorCategory.AUTH :
          error.message?.includes('404') ? ErrorCategory.API :
            ErrorCategory.NETWORK;

    const sanitizedParams = this.sanitizeParams(params);

    return this.logError(
      `API Error: ${error.message || 'Unknown Error'}`,
      {
        error,
        category,
        severity,
        context: {
          endpoint,
          params: sanitizedParams
        }
      }
    );
  }

  /**
   * Sanitize parameters to remove sensitive information
   * @param {Object} params - Parameters to sanitize
   * @returns {Object} Sanitized parameters
   */
  sanitizeParams(params) {
    const sanitized = { ...params };

    // Remove token if present
    if (sanitized.token) {
      sanitized.token = '[REDACTED]';
    }

    return sanitized;
  }

  /**
   * Add a listener for error events
   * @param {Function} listener - Function to call when an error occurs
   */
  addListener(listener) {
    if (typeof listener === 'function') {
      this.listeners.add(listener);
    }
  }

  /**
   * Remove a listener
   * @param {Function} listener - Listener to remove
   */
  removeListener(listener) {
    this.listeners.delete(listener);
  }

  /**
   * Notify all listeners about a new error
   * @param {Object} errorEntry - The error entry
   */
  notifyListeners(errorEntry) {
    this.listeners.forEach(listener => {
      try {
        listener(errorEntry);
      } catch (error) {
        console.error('Error in error listener:', error);
      }
    });
  }

  /**
   * Set the UI element to display errors
   * @param {HTMLElement} element - The error container element
   */
  setUIErrorElement(element) {
    this.uiErrorElement = element;
  }

  /**
   * Display an error in the UI
   * @param {string} message - Error message
   * @param {Object} options - Options for displaying the error
   */
  showUIError(message, options = {}) {
    const {
      severity = ErrorSeverity.ERROR,
      autoHide = false,
      duration = 5000 // 5 seconds
    } = options;

    // Log the error
    this.logError(message, { severity, ...options });

    // If no UI element is set, just log to console
    if (!this.uiErrorElement || !document.body.contains(this.uiErrorElement)) {
      return;
    }

    // Create error message HTML
    const errorHTML = this.createErrorHTML(message, severity);

    // Add to UI
    this.uiErrorElement.innerHTML = errorHTML;
    this.uiErrorElement.classList.remove('hidden');

    // Auto hide if requested
    if (autoHide) {
      setTimeout(() => {
        if (this.uiErrorElement) {
          this.uiErrorElement.classList.add('hidden');
        }
      }, duration);
    }
  }

  /**
   * Creates HTML for error display
   * @param {string} message - Error message
   * @param {string} severity - Error severity
   * @returns {string} HTML string
   */
  createErrorHTML(message, severity) {
    const formattedMessage = message.replace(/\n/g, '<br>');

    const severityClasses = {
      [ErrorSeverity.INFO]: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-100',
      [ErrorSeverity.WARNING]: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-100',
      [ErrorSeverity.ERROR]: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-100',
      [ErrorSeverity.CRITICAL]: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-100 border-2 border-red-400 dark:border-red-600'
    };

    const classes = severityClasses[severity] || severityClasses[ErrorSeverity.ERROR];

    return `<div class="${classes} p-4 rounded">
      <div class="flex items-center">
        <div class="flex-shrink-0">
          ${this.getSeverityIcon(severity)}
        </div>
        <div class="ml-3">
          <p class="text-sm">${formattedMessage}</p>
        </div>
      </div>
    </div>`;
  }

  /**
   * Get icon for severity level
   * @param {string} severity - Error severity
   * @returns {string} Icon HTML
   */
  getSeverityIcon(severity) {
    switch (severity) {
      case ErrorSeverity.INFO:
        return '<svg class="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>';
      case ErrorSeverity.WARNING:
        return '<svg class="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>';
      case ErrorSeverity.CRITICAL:
        return '<svg class="h-5 w-5 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>';
      default: // ERROR
        return '<svg class="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>';
    }
  }

  /**
   * Get the error log
   * @returns {Array} Array of error log entries
   */
  getErrorLog() {
    return [...this.errorLog];
  }

  /**
   * Clear the error log
   */
  clearErrorLog() {
    this.errorLog = [];
  }
}

// Create a singleton instance
const errorService = new ErrorService();

export default errorService;
