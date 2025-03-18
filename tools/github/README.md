# GitHub Organization Dashboard

> This project was developed with assistance from GitHub Copilot and Claude 3.5 Sonnet (Preview).

A simple dashboard to monitor your GitHub organization's repositories and pull requests, designed for small teams (< 10 people).

## Features

- Shows last 20 active repositories
- Lists all open pull requests across the organization
- GitHub Actions status overview per repository
  - Current workflow status
  - Latest run details
  - Failed job information
  - Build errors and warnings
- Filter and search capabilities:
  - Search by title, author, or repository
  - Filter by review state
  - Filter by PR labels
  - Hide/show bot PRs (Renovate, Dependabot)
  - Sort by creation date
- Dark mode support (auto-detects system preference)
- Pull request statistics
- Persistent filter preferences
- Rate limit warnings
- Grouped by repository view

See [TODO.md](TODO.md) for planned improvements focused on small team usage.

## Prerequisites

Use the token from 1password: `GITHUB_ORG_DASHBOARD_PAT dev@lx ORG`.

- GitHub Personal Access Token (PAT) with these scopes:
  - `repo` - Required for:
    - Reading repository information
    - Accessing pull requests
    - Reading PR reviews and comments
  - `org:read` - Required for:
    - Reading organization information
    - Listing organization repositories
  - `actions:read` - Required for:
    - Accessing workflow runs
    - Reading workflow failures
    - Viewing build annotations and errors

> Note: Read-only access is sufficient; no write permissions are needed.

## Configuration

You have two options to configure the dashboard:

### 1. Environment Variables (Recommended)

```bash
# Required
GITHUB_TOKEN=your-github-pat

# Optional
GITHUB_ORG=your-org-name  # Defaults to 'lx-media'
```

### 2. URL Parameters

```bash
http://your-server/web/github/?token=your-github-pat&org=your-org-name
```

> Note: URL parameters take precedence over environment variables if both are present.

## Setup

1. Clone or copy these files maintaining the directory structure:

   ```bash
   web/github/
   ├── README.md
   ├── TODO.md
   ├── index.html
   ├── css/
   │   └── styles.css
   └── js/
       ├── app.js
       ├── filterStore.js
       ├── githubApi.js
       └── tailwind.config.js
   ```

2. Configure your GitHub token and organization:
   - Via URL parameters:

     ```bash
     http://your-server/index.html?token=your-github-pat&org=your-org-name
     ```

   - Default organization is "lx-media" if not specified in URL

## Local Testing

You have several options to test locally:

### Option 1: Using npx http-server (Recommended)

1. Open terminal in the `web` directory
2. Run:

   ```bash
   npx -y http-server -c-1 -o
   ```

  `-c-1` disables caching, `-o` opens the browser automatically
3. Add your GitHub token to the URL:

   ```bash
   http://127.0.0.1:8080/web/github/?token=your-github-pat&org=your-org-name
   ```

### Option 2: Using Python's built-in server

1. Open terminal in the `web` directory
2. Run:

   ```bash
   # Python 3
   python -m http.server 8080
   # Python 2
   python -m SimpleHTTPServer 8080
   ```

3. Open `http://localhost:8080/github/` in your browser

### Option 3: Using VS Code Live Server

1. Install "Live Server" extension
2. Right-click `index.html`
3. Select "Open with Live Server"

## Security Notes

- Never commit your GitHub token
- The token is exposed in the URL - use only on trusted networks
- Consider implementing proper backend authentication for production use

## Browser Support

- Requires modern browser with ES6 support
- Tested on latest Chrome, Firefox, and Edge
