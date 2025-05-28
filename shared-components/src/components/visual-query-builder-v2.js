import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { NRQLValidator } from '../utils/nrql-validator';
import { tokens, spacing, transition, focusRing, getStatusColor } from '../design-system/tokens';
import { buttonStyles, cardStyles, statusIndicator, errorPatterns, DisclosureLevel } from '../design-system/patterns';

// Performance tracking
const trackInteraction = (action, data) => {
  if (typeof window !== 'undefined' && window.performance) {
    console.log(`[Performance] ${action}:`, {
      ...data,
      timestamp: performance.now(),
    });
  }
};

export const VisualQueryBuilderV2 = ({ 
  onQueryChange, 
  onQueryRun, 
  availableMetrics = [],
  availableDimensions = [],
  initialQuery = null,
  className = '',
  disclosureLevel = DisclosureLevel.SECONDARY
}) => {
  const startTime = performance.now();
  const validator = useMemo(() => new NRQLValidator(), []);
  
  const [query, setQuery] = useState(initialQuery || {
    select: [],
    from: 'ProcessSample',
    where: [],
    facet: [],
    since: '1 hour ago'
  });
  
  const [validation, setValidation] = useState({ isValid: true, errors: [] });
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSection, setActiveSection] = useState('metrics');

  // Validate query on change
  useEffect(() => {
    const queryString = buildQueryString();
    const result = validator.validate(queryString);
    setValidation(result);
    
    if (onQueryChange) {
      onQueryChange(queryString);
    }
    
    trackInteraction('query_validation', {
      isValid: result.isValid,
      errorCount: result.errors.length,
      queryLength: queryString.length,
    });
  }, [query]);

  const buildQueryString = useCallback(() => {
    const parts = [];
    
    // SELECT clause
    if (query.select.length > 0) {
      parts.push(`SELECT ${query.select.join(', ')}`);
    } else {
      parts.push('SELECT *');
    }
    
    // FROM clause
    parts.push(`FROM ${query.from}`);
    
    // WHERE clause
    if (query.where.length > 0) {
      parts.push(`WHERE ${query.where.join(' AND ')}`);
    }
    
    // FACET clause
    if (query.facet.length > 0) {
      parts.push(`FACET ${query.facet.join(', ')}`);
    }
    
    // SINCE clause
    if (query.since) {
      parts.push(`SINCE ${query.since}`);
    }
    
    return parts.join(' ');
  }, [query]);

  const handleMetricToggle = useCallback((metric) => {
    const newSelect = query.select.includes(metric)
      ? query.select.filter(m => m !== metric)
      : [...query.select, metric];
    
    setQuery({ ...query, select: newSelect });
    trackInteraction('metric_toggle', { metric, action: newSelect.includes(metric) ? 'add' : 'remove' });
  }, [query]);

  const handleAddFilter = useCallback(() => {
    const newWhere = [...query.where, ''];
    setQuery({ ...query, where: newWhere });
    trackInteraction('filter_add', { filterCount: newWhere.length });
  }, [query]);

  const handleFilterChange = useCallback((index, value) => {
    const newWhere = [...query.where];
    newWhere[index] = value;
    setQuery({ ...query, where: newWhere });
  }, [query]);

  const handleRemoveFilter = useCallback((index) => {
    const newWhere = query.where.filter((_, i) => i !== index);
    setQuery({ ...query, where: newWhere });
    trackInteraction('filter_remove', { remainingFilters: newWhere.length });
  }, [query]);

  const handleFacetToggle = useCallback((dimension) => {
    const newFacet = query.facet.includes(dimension)
      ? query.facet.filter(d => d !== dimension)
      : [...query.facet, dimension];
    
    setQuery({ ...query, facet: newFacet });
    trackInteraction('facet_toggle', { dimension, action: newFacet.includes(dimension) ? 'add' : 'remove' });
  }, [query]);

  const handleRunQuery = useCallback(() => {
    if (validation.isValid && onQueryRun) {
      const queryString = buildQueryString();
      onQueryRun(queryString);
      trackInteraction('query_run', { 
        queryLength: queryString.length,
        timeToRun: performance.now() - startTime 
      });
    }
  }, [validation.isValid, onQueryRun, buildQueryString, startTime]);

  // Filter metrics based on search
  const filteredMetrics = useMemo(() => {
    if (!searchTerm) return availableMetrics;
    const term = searchTerm.toLowerCase();
    return availableMetrics.filter(m => 
      m.value.toLowerCase().includes(term) || 
      m.label.toLowerCase().includes(term)
    );
  }, [availableMetrics, searchTerm]);

  const styles = {
    container: {
      fontFamily: tokens.typography.fontFamily.sans,
      color: tokens.colors.ui.text,
      ...cardStyles[disclosureLevel],
    },
    
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing(2),
    },
    
    title: {
      fontSize: tokens.typography.fontSize.md,
      fontWeight: tokens.typography.fontWeight.semibold,
      display: 'flex',
      alignItems: 'center',
      gap: spacing(1),
    },
    
    expandButton: {
      ...buttonStyles.base,
      ...buttonStyles.variants.secondary,
      ...buttonStyles.sizes.sm,
    },
    
    searchBox: {
      width: '100%',
      padding: `${spacing(1)}px ${spacing(2)}px`,
      border: `1px solid ${tokens.colors.ui.border}`,
      borderRadius: tokens.borderRadius.base,
      fontSize: tokens.typography.fontSize.base,
      transition: transition('border-color'),
      
      '&:focus': {
        ...focusRing(),
        borderColor: tokens.colors.ui.focus,
      },
    },
    
    section: {
      marginBottom: spacing(3),
    },
    
    sectionTitle: {
      fontSize: tokens.typography.fontSize.sm,
      fontWeight: tokens.typography.fontWeight.semibold,
      textTransform: 'uppercase',
      color: tokens.colors.ui.textSecondary,
      marginBottom: spacing(1),
    },
    
    metricGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
      gap: spacing(1),
    },
    
    metricButton: {
      ...buttonStyles.base,
      justifyContent: 'flex-start',
      padding: spacing(1),
      fontSize: tokens.typography.fontSize.sm,
      backgroundColor: tokens.colors.ui.surface,
      border: `1px solid ${tokens.colors.ui.border}`,
      
      '&.selected': {
        backgroundColor: tokens.colors.ui.focus,
        color: tokens.colors.ui.textInverse,
        borderColor: tokens.colors.ui.focus,
      },
    },
    
    filterContainer: {
      display: 'flex',
      flexDirection: 'column',
      gap: spacing(1),
    },
    
    filterRow: {
      display: 'flex',
      gap: spacing(1),
      alignItems: 'center',
    },
    
    filterInput: {
      flex: 1,
      padding: `${spacing(1)}px ${spacing(2)}px`,
      border: `1px solid ${tokens.colors.ui.border}`,
      borderRadius: tokens.borderRadius.base,
      fontSize: tokens.typography.fontSize.sm,
      fontFamily: tokens.typography.fontFamily.mono,
    },
    
    queryPreview: {
      padding: spacing(2),
      backgroundColor: tokens.colors.ui.backgroundAlt,
      borderRadius: tokens.borderRadius.base,
      marginTop: spacing(2),
    },
    
    queryText: {
      fontFamily: tokens.typography.fontFamily.mono,
      fontSize: tokens.typography.fontSize.sm,
      lineHeight: tokens.typography.lineHeight.relaxed,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
    },
    
    validationStatus: {
      marginTop: spacing(1),
      ...statusIndicator(validation.isValid ? 'success' : 'error'),
    },
    
    errorList: {
      ...errorPatterns.inline,
      marginTop: spacing(1),
    },
    
    actions: {
      display: 'flex',
      gap: spacing(2),
      marginTop: spacing(3),
      paddingTop: spacing(3),
      borderTop: `1px solid ${tokens.colors.ui.border}`,
    },
    
    runButton: {
      ...buttonStyles.base,
      ...buttonStyles.variants.primary,
    },
  };

  return (
    <div className={`visual-query-builder-v2 ${className}`} style={styles.container}>
      <div style={styles.header}>
        <div style={styles.title}>
          <span>Visual Query Builder</span>
          {validation.isValid && (
            <span style={{ color: tokens.colors.status.success }}>✓</span>
          )}
        </div>
        {disclosureLevel !== DisclosureLevel.DETAILED && (
          <button 
            style={styles.expandButton}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        )}
      </div>

      {(disclosureLevel === DisclosureLevel.DETAILED || isExpanded) && (
        <>
          {/* Metric Selection */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Select Metrics</h3>
            <input
              type="text"
              placeholder="Search metrics..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={styles.searchBox}
            />
            <div style={{ ...styles.metricGrid, marginTop: spacing(1) }}>
              {filteredMetrics.map(metric => (
                <button
                  key={metric.value}
                  className={query.select.includes(`average(${metric.value})`) ? 'selected' : ''}
                  style={styles.metricButton}
                  onClick={() => handleMetricToggle(`average(${metric.value})`)}
                >
                  {metric.label}
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Filters (WHERE)</h3>
            <div style={styles.filterContainer}>
              {query.where.map((filter, index) => (
                <div key={index} style={styles.filterRow}>
                  <input
                    type="text"
                    value={filter}
                    onChange={(e) => handleFilterChange(index, e.target.value)}
                    placeholder="e.g., hostname = 'server1'"
                    style={styles.filterInput}
                  />
                  <button
                    onClick={() => handleRemoveFilter(index)}
                    style={{ ...buttonStyles.base, ...buttonStyles.variants.secondary, ...buttonStyles.sizes.sm }}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                onClick={handleAddFilter}
                style={{ ...buttonStyles.base, ...buttonStyles.variants.secondary, ...buttonStyles.sizes.sm, alignSelf: 'flex-start' }}
              >
                + Add Filter
              </button>
            </div>
          </div>

          {/* Grouping */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Group By (FACET)</h3>
            <div style={styles.metricGrid}>
              {availableDimensions.map(dimension => (
                <button
                  key={dimension.value}
                  className={query.facet.includes(dimension.value) ? 'selected' : ''}
                  style={styles.metricButton}
                  onClick={() => handleFacetToggle(dimension.value)}
                >
                  {dimension.label}
                </button>
              ))}
            </div>
          </div>

          {/* Time Range */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Time Range</h3>
            <select 
              value={query.since} 
              onChange={(e) => setQuery({ ...query, since: e.target.value })}
              style={{
                ...styles.filterInput,
                width: 'auto',
              }}
            >
              <option value="5 minutes ago">Last 5 minutes</option>
              <option value="15 minutes ago">Last 15 minutes</option>
              <option value="30 minutes ago">Last 30 minutes</option>
              <option value="1 hour ago">Last 1 hour</option>
              <option value="3 hours ago">Last 3 hours</option>
              <option value="6 hours ago">Last 6 hours</option>
              <option value="12 hours ago">Last 12 hours</option>
              <option value="1 day ago">Last 24 hours</option>
              <option value="1 week ago">Last 7 days</option>
            </select>
          </div>
        </>
      )}

      {/* Query Preview - Always visible */}
      <div style={styles.queryPreview}>
        <div style={styles.queryText}>{buildQueryString()}</div>
        <div style={styles.validationStatus}>
          <span className="status-dot" />
          <span className="status-text">
            {validation.isValid ? 'Valid Query' : `${validation.errors.length} error(s)`}
          </span>
        </div>
        {!validation.isValid && validation.errors.length > 0 && (
          <div style={styles.errorList}>
            {validation.errors.map((error, index) => (
              <div key={index} className="error-message">{error}</div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={styles.actions}>
        <button
          onClick={handleRunQuery}
          disabled={!validation.isValid}
          style={styles.runButton}
        >
          Run Query
        </button>
        <button
          onClick={() => setQuery({
            select: [],
            from: 'ProcessSample',
            where: [],
            facet: [],
            since: '1 hour ago'
          })}
          style={{ ...buttonStyles.base, ...buttonStyles.variants.secondary }}
        >
          Clear
        </button>
      </div>
    </div>
  );
};