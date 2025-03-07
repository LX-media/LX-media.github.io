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
