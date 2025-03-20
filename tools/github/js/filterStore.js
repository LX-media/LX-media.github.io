export class FilterStore {
  constructor() {
    this.storageKey = 'gh-dashboard-filters';
    this.filters = this.loadFilters();
  }

  loadFilters() {
    const stored = localStorage.getItem(this.storageKey);
    return stored ? JSON.parse(stored) : {
      hideRenovate: false,
      hideDependabot: false,
      sortNewest: true,
      labels: [],
      reviewStates: [],
      search: '',
      labelOperator: 'OR' // Add default operator
    };
  }

  saveFilters() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.filters));
  }

  updateFilter(key, value) {
    this.filters[key] = value;
    this.saveFilters();
  }

  clearFilters() {
    this.filters = {
      hideRenovate: false,
      hideDependabot: false,
      sortNewest: true,
      labels: [],
      reviewStates: [],
      search: '',
      labelOperator: 'OR' // Add default operator
    };
    this.saveFilters();
  }
}
