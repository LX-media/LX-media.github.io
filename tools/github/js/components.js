/**
 * Shared UI Components Library
 *
 * This file contains reusable UI components that can be used across different parts
 * of the GitHub dashboard application. These components provide a consistent look and feel
 * and reduce code duplication.
 */

/**
 * Generate status indicator HTML
 * @param {string} status - Status name (success, failure, pending, etc.)
 * @param {string} color - Color name (green, red, yellow, gray)
 * @returns {string} HTML for status indicator
 */
export function createStatusIndicator(status, color) {
  return `<span class="status-indicator status-indicator-${color}" title="${status}"></span>`;
}

/**
 * Create a badge element
 * @param {string} text - Badge text content
 * @param {string} color - Badge color (blue, green, yellow, red, gray)
 * @param {boolean} isDarkMode - Whether dark mode is active
 * @returns {string} HTML for badge element
 */
export function createBadge(text, color, options = {}) {
  const { title, extraClasses = '' } = options;
  const titleAttr = title ? `title="${title}"` : '';

  return `<span ${titleAttr} class="badge badge-${color} ${extraClasses}">${text}</span>`;
}

/**
 * Create a button element
 * @param {string} text - Button text
 * @param {Object} options - Button options
 * @param {string} options.id - Button ID (optional)
 * @param {string} options.type - Filter type (optional)
 * @param {string} options.value - Filter value (optional)
 * @param {boolean} options.isActive - Whether button is active
 * @param {string} options.extraClasses - Additional CSS classes
 * @returns {string} HTML for button element
 */
export function createButton(text, options = {}) {
  const {
    id = '',
    type = '',
    value = '',
    isActive = false,
    extraClasses = '',
    icon = null
  } = options;

  const idAttr = id ? `id="${id}"` : '';
  const dataTypeAttr = type ? `data-filter-type="${type}"` : '';
  const dataValueAttr = value ? `data-filter-value="${value}"` : '';
  const stateClass = isActive ? 'filter-btn-active' : 'filter-btn-inactive';
  const iconHtml = icon ? icon : '';

  return `
    <button ${idAttr} ${dataTypeAttr} ${dataValueAttr} class="btn ${stateClass} ${extraClasses}">
      ${iconHtml}${text}
    </button>
  `;
}

/**
 * Create a loading skeleton for content
 * @param {Object} options - Skeleton options
 * @param {string} options.type - Type of skeleton (line, circle, rect)
 * @param {string} options.width - Width of skeleton
 * @param {string} options.height - Height of skeleton
 * @param {number} options.count - Number of skeleton items to generate
 * @returns {string} HTML for loading skeleton
 */
export function createLoadingSkeleton(options = {}) {
  const {
    type = 'line',
    width = 'w-full',
    height = 'h-4',
    count = 1
  } = options;

  let html = '';

  for (let i = 0; i < count; i++) {
    switch (type) {
      case 'circle':
        html += `<div class="animate-pulse ${width} ${height} bg-gray-200 dark:bg-gray-700 rounded-full"></div>`;
        break;
      case 'rect':
        html += `<div class="animate-pulse ${width} ${height} bg-gray-200 dark:bg-gray-700 rounded"></div>`;
        break;
      case 'line':
      default:
        html += `<div class="animate-pulse ${width} ${height} bg-gray-200 dark:bg-gray-700 rounded"></div>`;
    }

    if (i < count - 1) {
      html += '<div class="mt-2"></div>';
    }
  }

  return html;
}

/**
 * Create a panel/card container
 * @param {string} content - HTML content for the panel
 * @param {Object} options - Panel options
 * @param {string} options.heading - Panel heading
 * @param {string} options.extraClasses - Additional CSS classes
 * @returns {string} HTML for panel element
 */
export function createPanel(content, options = {}) {
  const { heading = '', extraClasses = '' } = options;

  const headingHtml = heading ?
    `<div class="flex justify-between items-center mb-4">
      <h2 class="text-xl font-semibold text-gray-900 dark:text-white">${heading}</h2>
    </div>` : '';

  return `
    <div class="panel ${extraClasses}">
      ${headingHtml}
      ${content}
    </div>
  `;
}

/**
 * Create a config status indicator
 * @param {boolean} isActive - Whether the status is active/successful
 * @param {string} label - Text label for the status
 * @returns {string} HTML for status indicator
 */
export function createConfigStatusIndicator(isActive, label = '') {
  const icon = isActive
    ? '<svg class="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>'
    : '<svg class="w-3 h-3 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>';

  const bgClass = isActive ? 'bg-green-100 dark:bg-green-900' : 'bg-red-100 dark:bg-red-900';

  return `
    <span class="w-4 h-4 rounded-full ${bgClass} flex items-center justify-center">
      ${icon}
    </span>
    ${label ? `<span class="text-xs text-gray-500 dark:text-gray-400">${label}</span>` : ''}
  `;
}

/**
 * Create an error message container
 * @param {string} message - Error message text
 * @returns {string} HTML for error message display
 */
export function createErrorMessage(message) {
  const formattedMessage = message.replace(/\n/g, '<br>');

  return `
    <div class="p-4 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-100 rounded">
      ${formattedMessage}
    </div>
  `;
}

/**
 * Create an input field
 * @param {Object} options - Input options
 * @param {string} options.id - Input ID
 * @param {string} options.type - Input type (text, search, number, etc.)
 * @param {string} options.placeholder - Input placeholder text
 * @param {string} options.value - Input initial value
 * @param {string} options.extraClasses - Additional CSS classes
 * @returns {string} HTML for input element
 */
export function createInput(options = {}) {
  const {
    id = '',
    type = 'text',
    placeholder = '',
    value = '',
    min = null,
    extraClasses = ''
  } = options;

  const idAttr = id ? `id="${id}"` : '';
  const minAttr = min !== null ? `min="${min}"` : '';
  const valueAttr = value ? `value="${value}"` : '';

  return `
    <input type="${type}" ${idAttr} ${minAttr} ${valueAttr} placeholder="${placeholder}"
      class="px-3 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 ${extraClasses}">
  `;
}

/**
 * Create a filter count summary
 * @param {number} filteredCount - Number of items after filtering
 * @param {number} totalCount - Total number of items before filtering
 * @param {number} activeFilterCount - Number of active filters
 * @returns {string} HTML for filter count display
 */
export function createFilterCount(filteredCount, totalCount, activeFilterCount = 0) {
  const filterText = activeFilterCount > 0 ? ` (${activeFilterCount} filters active)` : '';

  return `
    <span class="text-sm text-gray-500 dark:text-gray-400">
      Showing ${filteredCount} of ${totalCount}${filterText}
    </span>
  `;
}

/**
 * Creates a workflow item for GitHub Actions
 * @param {Object} workflow - Workflow data
 * @param {Function} getStatusColor - Function to determine status color
 * @param {Function} getFailureReason - Function to get failure reason
 * @returns {string} HTML for workflow item
 */
export function createWorkflowItem(workflow, options = {}) {
  const { getStatusColor, getFailureReason, renderAnnotations } = options;

  const status = workflow.lastRun.status;
  const conclusion = workflow.lastRun.conclusion;
  const color = getStatusColor ? getStatusColor(status, conclusion) : 'gray';
  const statusClass = `bg-${color}-100 dark:bg-${color}-900 text-${color}-800 dark:text-${color}-200`;

  const hasAnnotations = Array.isArray(workflow.lastRun.annotations) && workflow.lastRun.annotations.length > 0;
  const isEnabled = workflow.isEnabled !== false;
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
          ${workflow.lastRun.conclusion === 'failure' && isEnabled && getFailureReason ? `
            <span class="text-sm text-red-600 dark:text-red-400 max-w-md truncate"
                  title="${getFailureReason(workflow.lastRun).replace(/"/g, '&quot;')}">
              ${getFailureReason(workflow.lastRun).split('\n')[0]}
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
      ${hasAnnotations && isEnabled && renderAnnotations ? renderAnnotations(workflow.lastRun.annotations) : ''}
    </div>
  `;
}

/**
 * Create a PR item for GitHub Pull Requests
 * @param {Object} pr - Pull Request data
 * @param {Function} renderLabel - Function to render a PR label
 * @param {Function} renderReviewState - Function to render PR review state
 * @returns {string} HTML for PR item
 */
export function createPullRequestItem(pr, options = {}) {
  const { renderLabel, renderReviewState } = options;

  const borderColor = {
    'APPROVED': 'border-green-500',
    'CHANGES_REQUESTED': 'border-red-500',
    'PENDING': 'border-yellow-500'
  }[pr.reviewState] || 'border-gray-500';

  // Add draft status styling
  const draftClass = pr.isDraft ? 'opacity-70' : '';
  const titleClass = pr.isDraft ? 'text-gray-500 dark:text-gray-400' : 'text-blue-600 dark:text-blue-400';

  const labels = renderLabel ?
    pr.labels.map(label => renderLabel(label)).join('') : '';

  const reviewStateHtml = renderReviewState ?
    renderReviewState(pr.reviewState) : '';

  return `
    <div class="border-l-4 ${borderColor} pl-4 ${draftClass}">
      <div class="flex items-center gap-2">
        ${pr.isDraft ? '<span class="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-300 rounded">DRAFT</span>' : ''}
        <a href="${pr.html_url}" target="_blank" class="text-lg font-medium ${titleClass} hover:underline truncate">
          ${pr.title}
        </a>
      </div>
      <div class="flex flex-wrap gap-1 mt-1">
        ${reviewStateHtml}
        ${labels}
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

/**
 * Creates a common loading skeleton for a list of items
 * @param {Object} options - Options for skeleton
 * @param {number} options.itemCount - Number of skeleton items to create
 * @param {boolean} options.includeHeader - Whether to include header skeleton
 * @returns {string} HTML for loading skeleton
 */
export function createLoadingSkeletonList(options = {}) {
  const { itemCount = 3, includeHeader = true } = options;

  const headerHtml = includeHeader ?
    `<div class="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-4"></div>` : '';

  let itemsHtml = '';
  for (let i = 0; i < itemCount; i++) {
    itemsHtml += `
      <div class="animate-pulse bg-white dark:bg-gray-800 p-4 rounded-lg">
        <div class="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
        <div class="flex gap-2 mb-2">
          <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
          <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
          <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
        </div>
        <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
      </div>
    `;
  }

  return `
    <div class="animate-pulse">
      ${headerHtml}
      <div class="space-y-3">
        ${itemsHtml}
      </div>
    </div>
  `;
}

/**
 * Generate a last updated timestamp
 * @param {Date|string} date - Date object or date string
 * @returns {string} HTML for last updated timestamp
 */
export function createLastUpdatedText(date) {
  const lastUpdateTime = date instanceof Date ? date : new Date(date);

  return `Last updated: ${lastUpdateTime.toLocaleString(navigator.language, {
    dateStyle: 'medium',
    timeStyle: 'medium'
  })}`;
}

/**
 * Helper function for updating button active/inactive state
 * @param {HTMLElement} button - Button element to update
 * @param {boolean} isActive - Whether button is active
 */
export function updateButtonState(button, isActive) {
  // Remove all classes first
  button.classList.remove(
    'filter-btn-active', 'filter-btn-inactive',
    'bg-gray-200', 'hover:bg-gray-300', 'dark:bg-gray-700', 'dark:hover:bg-gray-600', 'dark:text-gray-200',
    'bg-blue-100', 'hover:bg-blue-200', 'dark:bg-blue-800', 'dark:hover:bg-blue-700', 'text-blue-700', 'dark:text-blue-300'
  );

  // Add appropriate classes based on state
  if (isActive) {
    button.classList.add('filter-btn-active');
  } else {
    button.classList.add('filter-btn-inactive');
  }
}
