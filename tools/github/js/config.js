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

export function getConfig() {
  // Check URL parameters first (they take precedence)
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('token');
  const urlOrg = params.get('org');

  // If no URL token and no env token, we'll return undefined which will trigger the error message
  return {
    token: urlToken || config.token,
    orgName: urlOrg || config.defaultOrg
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
