export const config = {
  token: (() => {
    try {
      return process?.env?.GITHUB_TOKEN;
    } catch {
      return undefined;
    }
  })(),
  defaultOrg: (() => {
    try {
      return process?.env?.GITHUB_ORG;
    } catch {
      return 'lx-media';
    }
  })()
};

// Create a unified storage for dashboard configurations
export function saveDashboardConfig(configObj) {
  localStorage.setItem('gh-dashboard-config', JSON.stringify(configObj));
}

export function getDashboardConfig() {
  try {
    const saved = localStorage.getItem('gh-dashboard-config');
    return saved ? JSON.parse(saved) : {};
  } catch (e) {
    console.warn('Failed to parse dashboard config', e);
    return {};
  }
}

export function getConfig() {
  // Check URL parameters first (they take precedence)
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('token');
  const urlOrg = params.get('org');

  // Check localStorage next
  const savedConfig = getDashboardConfig();

  // Determine final values with URL params taking highest precedence
  const token = urlToken || savedConfig.token || config.token;
  const orgName = urlOrg || savedConfig.orgName || config.defaultOrg;

  // Save the determined values to localStorage if they came from URL
  if (urlToken || urlOrg) {
    saveDashboardConfig({
      ...savedConfig,
      token: urlToken || savedConfig.token,
      orgName: urlOrg || savedConfig.orgName
    });
  }

  return {
    token,
    orgName
  };
}

// Optional: Add helper method to check if we're in a Node.js environment
export function isNodeEnvironment() {
  try {
    return typeof process !== 'undefined' && process.env;
  } catch {
    return false;
  }
}
