/**
 * Visual Query Builder - Frontend-first NRQL construction
 * No complex GraphQL, just intuitive visual building
 */

class VisualQueryBuilder {
  constructor(container) {
    this.container = container;
    this.components = {
      metrics: null,
      aggregations: null,
      filters: null,
      timeRange: null,
      groupBy: null
    };
    
    this.query = {
      select: [],
      from: 'Metric',
      where: [],
      facet: [],
      since: '1 hour ago'
    };
    
    this.init();
  }

  init() {
    this.render();
    this.attachEventListeners();
    this.loadAvailableMetrics();
  }

  render() {
    this.container.innerHTML = `
      <div class="query-builder">
        <div class="builder-section metrics-section">
          <h3>Select Metrics</h3>
          <div class="metric-search">
            <input type="text" placeholder="Search metrics..." class="metric-search-input">
            <div class="search-suggestions"></div>
          </div>
          <div class="selected-metrics"></div>
        </div>
        
        <div class="builder-section aggregation-section">
          <h3>Aggregation</h3>
          <div class="aggregation-options">
            <button data-agg="average" class="agg-btn active">Average</button>
            <button data-agg="sum" class="agg-btn">Sum</button>
            <button data-agg="max" class="agg-btn">Max</button>
            <button data-agg="min" class="agg-btn">Min</button>
            <button data-agg="count" class="agg-btn">Count</button>
            <button data-agg="percentile" class="agg-btn">Percentile</button>
          </div>
        </div>
        
        <div class="builder-section filter-section">
          <h3>Filters</h3>
          <div class="filter-builder">
            <button class="add-filter-btn">+ Add Filter</button>
            <div class="filters-list"></div>
          </div>
        </div>
        
        <div class="builder-section groupby-section">
          <h3>Group By</h3>
          <div class="groupby-selector">
            <input type="text" placeholder="Add dimension..." class="groupby-input">
            <div class="groupby-suggestions"></div>
          </div>
          <div class="selected-groupby"></div>
        </div>
        
        <div class="builder-section time-section">
          <h3>Time Range</h3>
          <div class="time-selector">
            <button data-time="5 minutes" class="time-btn">5m</button>
            <button data-time="15 minutes" class="time-btn">15m</button>
            <button data-time="1 hour" class="time-btn active">1h</button>
            <button data-time="3 hours" class="time-btn">3h</button>
            <button data-time="1 day" class="time-btn">1d</button>
            <button data-time="7 days" class="time-btn">7d</button>
            <button class="time-btn custom-time">Custom</button>
          </div>
        </div>
        
        <div class="query-preview">
          <h3>Query Preview</h3>
          <code class="nrql-preview"></code>
          <div class="query-actions">
            <button class="run-query-btn">Run Query</button>
            <button class="copy-query-btn">Copy</button>
            <button class="save-query-btn">Save</button>
          </div>
        </div>
        
        <div class="visualization-suggestion">
          <h3>Suggested Visualizations</h3>
          <div class="viz-options"></div>
        </div>
      </div>
    `;
  }

  attachEventListeners() {
    // Metric search
    const metricSearch = this.container.querySelector('.metric-search-input');
    metricSearch.addEventListener('input', (e) => this.handleMetricSearch(e.target.value));
    
    // Aggregation selection
    this.container.querySelectorAll('.agg-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.selectAggregation(e.target.dataset.agg));
    });
    
    // Time range selection
    this.container.querySelectorAll('.time-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (e.target.classList.contains('custom-time')) {
          this.showCustomTimeDialog();
        } else {
          this.selectTimeRange(e.target.dataset.time);
        }
      });
    });
    
    // Add filter button
    this.container.querySelector('.add-filter-btn').addEventListener('click', () => {
      this.addFilter();
    });
    
    // Group by input
    const groupByInput = this.container.querySelector('.groupby-input');
    groupByInput.addEventListener('input', (e) => this.handleGroupBySearch(e.target.value));
    
    // Query actions
    this.container.querySelector('.run-query-btn').addEventListener('click', () => {
      this.runQuery();
    });
    
    this.container.querySelector('.copy-query-btn').addEventListener('click', () => {
      this.copyQuery();
    });
    
    this.container.querySelector('.save-query-btn').addEventListener('click', () => {
      this.saveQuery();
    });
  }

  async loadAvailableMetrics() {
    // In real implementation, this would fetch from NerdGraph
    this.availableMetrics = [
      'system.cpu.usage',
      'system.memory.usage',
      'system.disk.io',
      'system.network.io',
      'application.response.time',
      'application.error.rate',
      'application.throughput',
      'business.revenue',
      'business.users.active'
    ];
  }

  handleMetricSearch(searchTerm) {
    const suggestions = this.container.querySelector('.search-suggestions');
    
    if (!searchTerm) {
      suggestions.innerHTML = '';
      return;
    }
    
    const matches = this.availableMetrics.filter(metric => 
      metric.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    suggestions.innerHTML = matches.map(metric => `
      <div class="suggestion" data-metric="${metric}">
        <span class="metric-name">${this.highlightMatch(metric, searchTerm)}</span>
        <span class="metric-type">${this.getMetricType(metric)}</span>
      </div>
    `).join('');
    
    // Add click handlers
    suggestions.querySelectorAll('.suggestion').forEach(item => {
      item.addEventListener('click', () => {
        this.addMetric(item.dataset.metric);
        suggestions.innerHTML = '';
        this.container.querySelector('.metric-search-input').value = '';
      });
    });
  }

  highlightMatch(text, match) {
    const regex = new RegExp(`(${match})`, 'gi');
    return text.replace(regex, '<strong>$1</strong>');
  }

  getMetricType(metric) {
    if (metric.includes('rate') || metric.includes('throughput')) return 'counter';
    if (metric.includes('usage') || metric.includes('percent')) return 'gauge';
    if (metric.includes('time') || metric.includes('duration')) return 'histogram';
    return 'metric';
  }

  addMetric(metric) {
    if (!this.query.select.find(m => m.metric === metric)) {
      this.query.select.push({
        metric,
        aggregation: this.getCurrentAggregation()
      });
      this.updateSelectedMetrics();
      this.updateQueryPreview();
      this.suggestVisualizations();
    }
  }

  updateSelectedMetrics() {
    const container = this.container.querySelector('.selected-metrics');
    container.innerHTML = this.query.select.map(item => `
      <div class="selected-metric">
        <span>${item.aggregation}(${item.metric})</span>
        <button class="remove-metric" data-metric="${item.metric}">×</button>
      </div>
    `).join('');
    
    // Add remove handlers
    container.querySelectorAll('.remove-metric').forEach(btn => {
      btn.addEventListener('click', () => {
        this.removeMetric(btn.dataset.metric);
      });
    });
  }

  removeMetric(metric) {
    this.query.select = this.query.select.filter(m => m.metric !== metric);
    this.updateSelectedMetrics();
    this.updateQueryPreview();
    this.suggestVisualizations();
  }

  getCurrentAggregation() {
    const activeBtn = this.container.querySelector('.agg-btn.active');
    return activeBtn ? activeBtn.dataset.agg : 'average';
  }

  selectAggregation(agg) {
    // Update UI
    this.container.querySelectorAll('.agg-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.agg === agg);
    });
    
    // Update all metrics with new aggregation
    this.query.select.forEach(item => {
      item.aggregation = agg;
    });
    
    this.updateSelectedMetrics();
    this.updateQueryPreview();
  }

  selectTimeRange(time) {
    this.query.since = time;
    
    // Update UI
    this.container.querySelectorAll('.time-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.time === time);
    });
    
    this.updateQueryPreview();
  }

  addFilter() {
    const filtersList = this.container.querySelector('.filters-list');
    const filterId = `filter-${Date.now()}`;
    
    const filterHtml = `
      <div class="filter-item" data-filter-id="${filterId}">
        <select class="filter-field">
          <option value="">Select field...</option>
          <option value="host">Host</option>
          <option value="service">Service</option>
          <option value="environment">Environment</option>
          <option value="region">Region</option>
        </select>
        <select class="filter-operator">
          <option value="=">=</option>
          <option value="!=">!=</option>
          <option value="LIKE">LIKE</option>
          <option value="NOT LIKE">NOT LIKE</option>
          <option value="IN">IN</option>
        </select>
        <input type="text" class="filter-value" placeholder="Value...">
        <button class="remove-filter" data-filter-id="${filterId}">×</button>
      </div>
    `;
    
    filtersList.insertAdjacentHTML('beforeend', filterHtml);
    
    // Add event listeners
    const filterItem = filtersList.querySelector(`[data-filter-id="${filterId}"]`);
    filterItem.querySelectorAll('select, input').forEach(element => {
      element.addEventListener('change', () => this.updateFilters());
    });
    
    filterItem.querySelector('.remove-filter').addEventListener('click', () => {
      filterItem.remove();
      this.updateFilters();
    });
  }

  updateFilters() {
    this.query.where = [];
    
    this.container.querySelectorAll('.filter-item').forEach(item => {
      const field = item.querySelector('.filter-field').value;
      const operator = item.querySelector('.filter-operator').value;
      const value = item.querySelector('.filter-value').value;
      
      if (field && value) {
        this.query.where.push({ field, operator, value });
      }
    });
    
    this.updateQueryPreview();
  }

  handleGroupBySearch(searchTerm) {
    const suggestions = this.container.querySelector('.groupby-suggestions');
    
    if (!searchTerm) {
      suggestions.innerHTML = '';
      return;
    }
    
    const dimensions = ['host', 'service', 'environment', 'region', 'user', 'transaction'];
    const matches = dimensions.filter(dim => 
      dim.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    suggestions.innerHTML = matches.map(dim => `
      <div class="suggestion" data-dimension="${dim}">${dim}</div>
    `).join('');
    
    suggestions.querySelectorAll('.suggestion').forEach(item => {
      item.addEventListener('click', () => {
        this.addGroupBy(item.dataset.dimension);
        suggestions.innerHTML = '';
        this.container.querySelector('.groupby-input').value = '';
      });
    });
  }

  addGroupBy(dimension) {
    if (!this.query.facet.includes(dimension)) {
      this.query.facet.push(dimension);
      this.updateSelectedGroupBy();
      this.updateQueryPreview();
    }
  }

  updateSelectedGroupBy() {
    const container = this.container.querySelector('.selected-groupby');
    container.innerHTML = this.query.facet.map(dim => `
      <div class="selected-dimension">
        <span>${dim}</span>
        <button class="remove-dimension" data-dimension="${dim}">×</button>
      </div>
    `).join('');
    
    container.querySelectorAll('.remove-dimension').forEach(btn => {
      btn.addEventListener('click', () => {
        this.removeGroupBy(btn.dataset.dimension);
      });
    });
  }

  removeGroupBy(dimension) {
    this.query.facet = this.query.facet.filter(d => d !== dimension);
    this.updateSelectedGroupBy();
    this.updateQueryPreview();
  }

  updateQueryPreview() {
    const preview = this.container.querySelector('.nrql-preview');
    preview.textContent = this.buildNRQL();
  }

  buildNRQL() {
    if (this.query.select.length === 0) {
      return 'SELECT ... FROM Metric';
    }
    
    let nrql = 'SELECT ';
    
    // SELECT clause
    nrql += this.query.select
      .map(item => `${item.aggregation}(${item.metric})`)
      .join(', ');
    
    // FROM clause
    nrql += ` FROM ${this.query.from}`;
    
    // WHERE clause
    if (this.query.where.length > 0) {
      nrql += ' WHERE ';
      nrql += this.query.where
        .map(filter => {
          const value = filter.operator === 'IN' 
            ? `(${filter.value})` 
            : `'${filter.value}'`;
          return `${filter.field} ${filter.operator} ${value}`;
        })
        .join(' AND ');
    }
    
    // FACET clause
    if (this.query.facet.length > 0) {
      nrql += ` FACET ${this.query.facet.join(', ')}`;
    }
    
    // SINCE clause
    nrql += ` SINCE ${this.query.since}`;
    
    return nrql;
  }

  suggestVisualizations() {
    const vizContainer = this.container.querySelector('.viz-options');
    
    if (this.query.select.length === 0) {
      vizContainer.innerHTML = '<p>Add metrics to see visualization suggestions</p>';
      return;
    }
    
    const suggestions = this.getVisualizationSuggestions();
    
    vizContainer.innerHTML = suggestions.map(viz => `
      <div class="viz-option ${viz.recommended ? 'recommended' : ''}" data-viz="${viz.type}">
        <div class="viz-icon">${viz.icon}</div>
        <div class="viz-name">${viz.name}</div>
        ${viz.recommended ? '<span class="recommended-badge">Recommended</span>' : ''}
      </div>
    `).join('');
    
    vizContainer.querySelectorAll('.viz-option').forEach(option => {
      option.addEventListener('click', () => {
        this.selectVisualization(option.dataset.viz);
      });
    });
  }

  getVisualizationSuggestions() {
    const metricCount = this.query.select.length;
    const hasGroupBy = this.query.facet.length > 0;
    const hasTime = true; // Always true for time series data
    
    const suggestions = [];
    
    // Line chart - good for time series
    suggestions.push({
      type: 'line',
      name: 'Line Chart',
      icon: '📈',
      recommended: hasTime && metricCount <= 5
    });
    
    // Billboard - good for single values
    suggestions.push({
      type: 'billboard',
      name: 'Billboard',
      icon: '🎯',
      recommended: metricCount === 1 && !hasGroupBy
    });
    
    // Bar chart - good for comparisons
    suggestions.push({
      type: 'bar',
      name: 'Bar Chart',
      icon: '📊',
      recommended: hasGroupBy && metricCount === 1
    });
    
    // Table - good for multiple dimensions
    suggestions.push({
      type: 'table',
      name: 'Table',
      icon: '📋',
      recommended: hasGroupBy && metricCount > 2
    });
    
    // Area chart - good for stacked data
    suggestions.push({
      type: 'area',
      name: 'Area Chart',
      icon: '📉',
      recommended: hasTime && hasGroupBy
    });
    
    return suggestions;
  }

  async runQuery() {
    const nrql = this.buildNRQL();
    
    if (this.query.select.length === 0) {
      alert('Please select at least one metric');
      return;
    }
    
    // Emit event for dashboard to handle
    this.container.dispatchEvent(new CustomEvent('query:run', {
      detail: { nrql, query: this.query }
    }));
  }

  copyQuery() {
    const nrql = this.buildNRQL();
    navigator.clipboard.writeText(nrql).then(() => {
      this.showNotification('Query copied to clipboard!');
    });
  }

  saveQuery() {
    const nrql = this.buildNRQL();
    const name = prompt('Enter a name for this query:');
    
    if (name) {
      // Save to local storage for now
      const savedQueries = JSON.parse(localStorage.getItem('savedQueries') || '[]');
      savedQueries.push({
        name,
        nrql,
        query: this.query,
        timestamp: new Date().toISOString()
      });
      localStorage.setItem('savedQueries', JSON.stringify(savedQueries));
      
      this.showNotification('Query saved!');
    }
  }

  showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  selectVisualization(type) {
    this.container.dispatchEvent(new CustomEvent('visualization:select', {
      detail: { type }
    }));
  }

  showCustomTimeDialog() {
    // Implementation for custom time range dialog
    const customTime = prompt('Enter custom time range (e.g., "2 hours ago", "3 days ago"):');
    if (customTime) {
      this.selectTimeRange(customTime);
    }
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VisualQueryBuilder;
}