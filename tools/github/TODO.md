# GitHub Organization Dashboard - TODOs

> This document was generated with assistance from GitHub Copilot and Claude 3.5 Sonnet (Preview).

A focused list of improvements for small team usage (< 10 people).

## Performance
- [ ] Add pagination when org has > 100 PRs
- [ ] Cache review states longer (24h)
- [ ] Implement auto-refresh every 5 minutes
- [ ] Add offline support for last known state

## UX Improvements
- [ ] Add keyboard shortcuts (Esc to clear filters, / to search)
- [ ] Make repository groups collapsible
- [ ] Show PR age indicators (e.g., "3 days old")
- [ ] Add local notifications for new PRs

## Technical
- [ ] Add basic error handling for API failures
- [ ] Implement simple state management
- [ ] Add minimal test coverage
- [ ] Enable PWA features for offline access

## Security
- [x] Support environment variables for token
- [ ] Add basic rate limit handling
- [ ] Implement session timeout
- [ ] Add simple user authentication

## General TODOs (manually added)

### Pull Request loading times

**Problem:** The open pull request list takes quite some time to be loaded. Would it be possible to load/show the basic information about PRs first, then load the additional details like states/labels, PR names, assignees (including their image) - and attach those when loaded? Maybe show loading skeletons to visualize partial data loading for those parts.

- Possible GitHub Copilot suggestions:
I'll optimize the PR loading process by implementing a two-phase loading strategy. This will show basic PR information first, then load and attach additional details progressively.
  - Step-by-Step Solution
    - I'll modify the app.js file to implement progressive loading
    - First, show basic PR information with loading indicators
    - Then asynchronously fetch additional details and update the UI
