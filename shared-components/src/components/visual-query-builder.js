import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { NRQLValidator } from '../utils/nrql-validator';

/**
 * Visual Query Builder Component
 * A React component for building NRQL queries visually
 */
export const VisualQueryBuilder = ({ 
  onQueryChange, 
  onQueryRun, 
  availableMetrics = [],
  availableDimensions = [],
  initialQuery = null,
  className = ''
}) => {
  const validator = new NRQLValidator();
  
  // State management
  const [query, setQuery] = useState(initialQuery || {
    select: [],
    from: 'Metric',
    where: [],
    facet: [],
    since: '1 hour ago'
  });
  
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [groupBySearchTerm, setGroupBySearchTerm] = useState('');
  const [showGroupBySuggestions, setShowGroupBySuggestions] = useState(false);
  const [selectedAggregation, setSelectedAggregation] = useState('average');
  const [filters, setFilters] = useState([]);
  
  // Refs for click outside handling
  const searchRef = useRef(null);
  const groupByRef = useRef(null);

  // Default metrics if none provided
  const defaultMetrics = [
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

  const defaultDimensions = [
    'host', 'service', 'environment', 'region', 'user', 'transaction'
  ];

  const metrics = availableMetrics.length > 0 ? availableMetrics : defaultMetrics;
  const dimensions = availableDimensions.length > 0 ? availableDimensions : defaultDimensions;

  // Build NRQL from query state
  const buildNRQL = () => {
    if (query.select.length === 0) {
      return 'SELECT ... FROM Metric';
    }
    
    let nrql = 'SELECT ';
    
    // SELECT clause
    nrql += query.select
      .map(item => `${item.aggregation}(${item.metric})`)
      .join(', ');
    
    // FROM clause
    nrql += ` FROM ${query.from}`;
    
    // WHERE clause
    if (query.where.length > 0) {
      nrql += ' WHERE ';
      nrql += query.where
        .map(filter => {
          const value = filter.operator === 'IN' 
            ? `(${filter.value})` 
            : `'${filter.value}'`;
          return `${filter.field} ${filter.operator} ${value}`;
        })
        .join(' AND ');
    }
    
    // FACET clause
    if (query.facet.length > 0) {
      nrql += ` FACET ${query.facet.join(', ')}`;
    }
    
    // SINCE clause
    nrql += ` SINCE ${query.since}`;
    
    return nrql;
  };

  // Notify parent of query changes
  useEffect(() => {
    const nrql = buildNRQL();
    const validationResult = validator.validate(nrql);
    
    if (onQueryChange) {
      onQueryChange({
        nrql,
        query,
        isValid: validationResult.valid,
        validationResult
      });
    }
  }, [query]);

  // Click outside handlers
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
      if (groupByRef.current && !groupByRef.current.contains(event.target)) {
        setShowGroupBySuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handlers
  const handleMetricSearch = (value) => {
    setSearchTerm(value);
    setShowSuggestions(value.length > 0);
  };

  const addMetric = (metric) => {
    if (!query.select.find(m => m.metric === metric)) {
      setQuery(prev => ({
        ...prev,
        select: [...prev.select, { metric, aggregation: selectedAggregation }]
      }));
    }
    setSearchTerm('');
    setShowSuggestions(false);
  };

  const removeMetric = (metric) => {
    setQuery(prev => ({
      ...prev,
      select: prev.select.filter(m => m.metric !== metric)
    }));
  };

  const updateAggregation = (agg) => {
    setSelectedAggregation(agg);
    setQuery(prev => ({
      ...prev,
      select: prev.select.map(item => ({ ...item, aggregation: agg }))
    }));
  };

  const addFilter = () => {
    const newFilter = {
      id: Date.now(),
      field: '',
      operator: '=',
      value: ''
    };
    setFilters([...filters, newFilter]);
  };

  const updateFilter = (id, updates) => {
    const updatedFilters = filters.map(f => 
      f.id === id ? { ...f, ...updates } : f
    );
    setFilters(updatedFilters);
    
    // Update query with valid filters
    const validFilters = updatedFilters
      .filter(f => f.field && f.value)
      .map(({ field, operator, value }) => ({ field, operator, value }));
    
    setQuery(prev => ({ ...prev, where: validFilters }));
  };

  const removeFilter = (id) => {
    const updatedFilters = filters.filter(f => f.id !== id);
    setFilters(updatedFilters);
    
    const validFilters = updatedFilters
      .filter(f => f.field && f.value)
      .map(({ field, operator, value }) => ({ field, operator, value }));
    
    setQuery(prev => ({ ...prev, where: validFilters }));
  };

  const handleGroupBySearch = (value) => {
    setGroupBySearchTerm(value);
    setShowGroupBySuggestions(value.length > 0);
  };

  const addGroupBy = (dimension) => {
    if (!query.facet.includes(dimension)) {
      setQuery(prev => ({
        ...prev,
        facet: [...prev.facet, dimension]
      }));
    }
    setGroupBySearchTerm('');
    setShowGroupBySuggestions(false);
  };

  const removeGroupBy = (dimension) => {
    setQuery(prev => ({
      ...prev,
      facet: prev.facet.filter(d => d !== dimension)
    }));
  };

  const updateTimeRange = (time) => {
    setQuery(prev => ({ ...prev, since: time }));
  };

  const handleRunQuery = () => {
    const nrql = buildNRQL();
    if (query.select.length > 0 && onQueryRun) {
      onQueryRun({ nrql, query });
    }
  };

  const handleCopyQuery = () => {
    const nrql = buildNRQL();
    navigator.clipboard.writeText(nrql);
  };

  const getMetricType = (metric) => {
    if (metric.includes('rate') || metric.includes('throughput')) return 'counter';
    if (metric.includes('usage') || metric.includes('percent')) return 'gauge';
    if (metric.includes('time') || metric.includes('duration')) return 'histogram';
    return 'metric';
  };

  const highlightMatch = (text, match) => {
    if (!match) return text;
    const parts = text.split(new RegExp(`(${match})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === match.toLowerCase() 
        ? <strong key={i}>{part}</strong> 
        : part
    );
  };

  const filteredMetrics = metrics.filter(metric =>
    metric.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredDimensions = dimensions.filter(dim =>
    dim.toLowerCase().includes(groupBySearchTerm.toLowerCase())
  );

  return (
    <div className={`query-builder ${className}`}>
      {/* Metrics Section */}
      <div className="builder-section metrics-section">
        <h3>Select Metrics</h3>
        <div className="metric-search" ref={searchRef}>
          <input
            type="text"
            placeholder="Search metrics..."
            className="metric-search-input"
            value={searchTerm}
            onChange={(e) => handleMetricSearch(e.target.value)}
            onFocus={() => setShowSuggestions(searchTerm.length > 0)}
          />
          {showSuggestions && filteredMetrics.length > 0 && (
            <div className="search-suggestions">
              {filteredMetrics.map(metric => (
                <div
                  key={metric}
                  className="suggestion"
                  onClick={() => addMetric(metric)}
                >
                  <span className="metric-name">
                    {highlightMatch(metric, searchTerm)}
                  </span>
                  <span className="metric-type">{getMetricType(metric)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="selected-metrics">
          {query.select.map(item => (
            <div key={item.metric} className="selected-metric">
              <span>{item.aggregation}({item.metric})</span>
              <button
                className="remove-metric"
                onClick={() => removeMetric(item.metric)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Aggregation Section */}
      <div className="builder-section aggregation-section">
        <h3>Aggregation</h3>
        <div className="aggregation-options">
          {['average', 'sum', 'max', 'min', 'count', 'percentile'].map(agg => (
            <button
              key={agg}
              className={`agg-btn ${selectedAggregation === agg ? 'active' : ''}`}
              onClick={() => updateAggregation(agg)}
            >
              {agg.charAt(0).toUpperCase() + agg.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Filter Section */}
      <div className="builder-section filter-section">
        <h3>Filters</h3>
        <div className="filter-builder">
          <button className="add-filter-btn" onClick={addFilter}>
            + Add Filter
          </button>
          <div className="filters-list">
            {filters.map(filter => (
              <div key={filter.id} className="filter-item">
                <select
                  className="filter-field"
                  value={filter.field}
                  onChange={(e) => updateFilter(filter.id, { field: e.target.value })}
                >
                  <option value="">Select field...</option>
                  {dimensions.map(dim => (
                    <option key={dim} value={dim}>{dim}</option>
                  ))}
                </select>
                <select
                  className="filter-operator"
                  value={filter.operator}
                  onChange={(e) => updateFilter(filter.id, { operator: e.target.value })}
                >
                  <option value="=">=</option>
                  <option value="!=">!=</option>
                  <option value="LIKE">LIKE</option>
                  <option value="NOT LIKE">NOT LIKE</option>
                  <option value="IN">IN</option>
                </select>
                <input
                  type="text"
                  className="filter-value"
                  placeholder="Value..."
                  value={filter.value}
                  onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                />
                <button
                  className="remove-filter"
                  onClick={() => removeFilter(filter.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Group By Section */}
      <div className="builder-section groupby-section">
        <h3>Group By</h3>
        <div className="groupby-selector" ref={groupByRef}>
          <input
            type="text"
            placeholder="Add dimension..."
            className="groupby-input"
            value={groupBySearchTerm}
            onChange={(e) => handleGroupBySearch(e.target.value)}
            onFocus={() => setShowGroupBySuggestions(groupBySearchTerm.length > 0)}
          />
          {showGroupBySuggestions && filteredDimensions.length > 0 && (
            <div className="groupby-suggestions">
              {filteredDimensions.map(dim => (
                <div
                  key={dim}
                  className="suggestion"
                  onClick={() => addGroupBy(dim)}
                >
                  {highlightMatch(dim, groupBySearchTerm)}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="selected-groupby">
          {query.facet.map(dim => (
            <div key={dim} className="selected-dimension">
              <span>{dim}</span>
              <button
                className="remove-dimension"
                onClick={() => removeGroupBy(dim)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Time Range Section */}
      <div className="builder-section time-section">
        <h3>Time Range</h3>
        <div className="time-selector">
          {['5 minutes', '15 minutes', '1 hour', '3 hours', '1 day', '7 days'].map(time => (
            <button
              key={time}
              className={`time-btn ${query.since === time ? 'active' : ''}`}
              onClick={() => updateTimeRange(time)}
            >
              {time.includes('minute') ? time.replace(' minutes', 'm').replace(' minute', 'm') : 
               time.includes('hour') ? time.replace(' hours', 'h').replace(' hour', 'h') :
               time.replace(' days', 'd').replace(' day', 'd')}
            </button>
          ))}
          <button
            className="time-btn custom-time"
            onClick={() => {
              const customTime = prompt('Enter custom time range (e.g., "2 hours ago", "3 days ago"):');
              if (customTime) updateTimeRange(customTime);
            }}
          >
            Custom
          </button>
        </div>
      </div>

      {/* Query Preview */}
      <div className="query-preview">
        <h3>Query Preview</h3>
        <code className="nrql-preview">{buildNRQL()}</code>
        <div className="query-actions">
          <button
            className="run-query-btn"
            onClick={handleRunQuery}
            disabled={query.select.length === 0}
          >
            Run Query
          </button>
          <button className="copy-query-btn" onClick={handleCopyQuery}>
            Copy
          </button>
        </div>
      </div>
    </div>
  );
};

VisualQueryBuilder.propTypes = {
  onQueryChange: PropTypes.func,
  onQueryRun: PropTypes.func,
  availableMetrics: PropTypes.arrayOf(PropTypes.string),
  availableDimensions: PropTypes.arrayOf(PropTypes.string),
  initialQuery: PropTypes.shape({
    select: PropTypes.array,
    from: PropTypes.string,
    where: PropTypes.array,
    facet: PropTypes.array,
    since: PropTypes.string
  }),
  className: PropTypes.string
};

export default VisualQueryBuilder;