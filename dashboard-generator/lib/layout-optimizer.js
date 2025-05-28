class LayoutOptimizer {
  constructor(options = {}) {
    this.gridColumns = options.gridColumns || 12;
    this.minWidgetWidth = options.minWidgetWidth || 3;
    this.maxWidgetsPerRow = options.maxWidgetsPerRow || 4;
    this.defaultRowHeight = options.defaultRowHeight || 3;
    
    this.widgetPriority = {
      'billboard': 10,
      'line': 8,
      'area': 8,
      'table': 6,
      'pie': 5,
      'bar': 5,
      'histogram': 4,
      'heatmap': 4,
      'markdown': 2
    };
    
    this.widgetSizes = {
      'billboard': { minWidth: 3, minHeight: 2, preferredWidth: 3, preferredHeight: 2 },
      'line': { minWidth: 4, minHeight: 3, preferredWidth: 6, preferredHeight: 3 },
      'area': { minWidth: 4, minHeight: 3, preferredWidth: 6, preferredHeight: 3 },
      'table': { minWidth: 6, minHeight: 4, preferredWidth: 12, preferredHeight: 4 },
      'pie': { minWidth: 4, minHeight: 3, preferredWidth: 4, preferredHeight: 3 },
      'bar': { minWidth: 4, minHeight: 3, preferredWidth: 6, preferredHeight: 3 },
      'histogram': { minWidth: 4, minHeight: 3, preferredWidth: 6, preferredHeight: 3 },
      'heatmap': { minWidth: 6, minHeight: 4, preferredWidth: 8, preferredHeight: 4 },
      'markdown': { minWidth: 3, minHeight: 2, preferredWidth: 12, preferredHeight: 2 }
    };
  }

  optimizeLayout(widgets, options = {}) {
    const {
      layoutPreference = 'balanced',
      groupBy = 'category',
      priorityOverrides = {}
    } = options;
    
    const sortedWidgets = this.sortWidgetsByPriority(widgets, priorityOverrides);
    const groupedWidgets = this.groupWidgets(sortedWidgets, groupBy);
    const layout = this.generateLayout(groupedWidgets, layoutPreference);
    
    return this.finalizeLayout(layout);
  }

  sortWidgetsByPriority(widgets, overrides = {}) {
    return widgets.sort((a, b) => {
      const priorityA = overrides[a.id] || this.widgetPriority[a.type] || 0;
      const priorityB = overrides[b.id] || this.widgetPriority[b.type] || 0;
      
      if (priorityA !== priorityB) {
        return priorityB - priorityA;
      }
      
      if (a.kpi && !b.kpi) return -1;
      if (!a.kpi && b.kpi) return 1;
      
      return 0;
    });
  }

  groupWidgets(widgets, groupBy) {
    if (groupBy === 'none') {
      return [{ name: 'all', widgets }];
    }
    
    const groups = {};
    
    widgets.forEach(widget => {
      let groupKey = 'other';
      
      if (groupBy === 'category' && widget.category) {
        groupKey = widget.category;
      } else if (groupBy === 'type') {
        groupKey = widget.type;
      } else if (groupBy === 'metric' && widget.metric) {
        groupKey = widget.metric.category || 'other';
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      
      groups[groupKey].push(widget);
    });
    
    return Object.entries(groups).map(([name, widgets]) => ({ name, widgets }));
  }

  generateLayout(groups, preference) {
    let layout = [];
    let currentRow = 0;
    
    groups.forEach(group => {
      const groupLayout = this.layoutGroup(group, preference, currentRow);
      layout = layout.concat(groupLayout);
      currentRow = Math.max(...groupLayout.map(w => w.row + w.height));
    });
    
    return layout;
  }

  layoutGroup(group, preference, startRow) {
    const layout = [];
    let currentRow = startRow;
    let currentColumn = 0;
    
    if (group.name !== 'other' && group.widgets.length > 1) {
      layout.push({
        type: 'markdown',
        title: this.formatGroupName(group.name),
        content: `# ${this.formatGroupName(group.name)}`,
        column: 0,
        row: currentRow,
        width: this.gridColumns,
        height: 1
      });
      currentRow += 1;
    }
    
    group.widgets.forEach(widget => {
      const size = this.calculateWidgetSize(widget, preference);
      
      if (currentColumn + size.width > this.gridColumns) {
        currentRow += this.defaultRowHeight;
        currentColumn = 0;
      }
      
      layout.push({
        ...widget,
        column: currentColumn,
        row: currentRow,
        width: size.width,
        height: size.height
      });
      
      currentColumn += size.width;
      
      if (widget.type === 'table' || (widget.fullWidth && preference !== 'compact')) {
        currentRow += size.height;
        currentColumn = 0;
      }
    });
    
    return layout;
  }

  calculateWidgetSize(widget, preference) {
    const sizeConfig = this.widgetSizes[widget.type] || this.widgetSizes['line'];
    
    let width, height;
    
    switch (preference) {
      case 'compact':
        width = sizeConfig.minWidth;
        height = sizeConfig.minHeight;
        break;
      
      case 'detailed':
        width = Math.min(sizeConfig.preferredWidth * 1.5, this.gridColumns);
        height = sizeConfig.preferredHeight + 1;
        break;
      
      case 'balanced':
      default:
        width = sizeConfig.preferredWidth;
        height = sizeConfig.preferredHeight;
        break;
    }
    
    if (widget.size) {
      width = widget.size.width || width;
      height = widget.size.height || height;
    }
    
    width = Math.max(sizeConfig.minWidth, Math.min(width, this.gridColumns));
    height = Math.max(sizeConfig.minHeight, height);
    
    return { width, height };
  }

  finalizeLayout(layout) {
    const compactedLayout = this.compactRows(layout);
    const alignedLayout = this.alignWidgets(compactedLayout);
    
    return this.addLayoutMetadata(alignedLayout);
  }

  compactRows(layout) {
    const rows = {};
    
    layout.forEach(widget => {
      if (!rows[widget.row]) {
        rows[widget.row] = [];
      }
      rows[widget.row].push(widget);
    });
    
    let compactedRow = 0;
    const compactedLayout = [];
    
    Object.keys(rows)
      .sort((a, b) => parseInt(a) - parseInt(b))
      .forEach(rowKey => {
        rows[rowKey].forEach(widget => {
          compactedLayout.push({
            ...widget,
            row: compactedRow
          });
        });
        
        const maxHeight = Math.max(...rows[rowKey].map(w => w.height));
        compactedRow += maxHeight;
      });
    
    return compactedLayout;
  }

  alignWidgets(layout) {
    const rows = {};
    
    layout.forEach(widget => {
      if (!rows[widget.row]) {
        rows[widget.row] = [];
      }
      rows[widget.row].push(widget);
    });
    
    const alignedLayout = [];
    
    Object.values(rows).forEach(rowWidgets => {
      rowWidgets.sort((a, b) => a.column - b.column);
      
      let currentColumn = 0;
      rowWidgets.forEach(widget => {
        if (widget.column > currentColumn) {
          currentColumn = widget.column;
        }
        
        alignedLayout.push({
          ...widget,
          column: currentColumn
        });
        
        currentColumn += widget.width;
      });
    });
    
    return alignedLayout;
  }

  addLayoutMetadata(layout) {
    const totalRows = Math.max(...layout.map(w => w.row + w.height));
    const widgetsByType = {};
    
    layout.forEach(widget => {
      if (!widgetsByType[widget.type]) {
        widgetsByType[widget.type] = 0;
      }
      widgetsByType[widget.type]++;
    });
    
    return {
      widgets: layout,
      metadata: {
        totalRows,
        totalWidgets: layout.length,
        widgetsByType,
        gridColumns: this.gridColumns
      }
    };
  }

  formatGroupName(name) {
    return name
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  validateLayout(layout) {
    const errors = [];
    const occupiedCells = {};
    
    layout.widgets.forEach((widget, index) => {
      if (widget.column < 0 || widget.column >= this.gridColumns) {
        errors.push(`Widget ${index} has invalid column: ${widget.column}`);
      }
      
      if (widget.width <= 0 || widget.column + widget.width > this.gridColumns) {
        errors.push(`Widget ${index} has invalid width: ${widget.width}`);
      }
      
      if (widget.height <= 0) {
        errors.push(`Widget ${index} has invalid height: ${widget.height}`);
      }
      
      for (let row = widget.row; row < widget.row + widget.height; row++) {
        for (let col = widget.column; col < widget.column + widget.width; col++) {
          const key = `${row}-${col}`;
          if (occupiedCells[key]) {
            errors.push(`Widget ${index} overlaps with widget ${occupiedCells[key]}`);
          }
          occupiedCells[key] = index;
        }
      }
    });
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  suggestImprovements(layout) {
    const suggestions = [];
    
    const widgetDensity = layout.widgets.length / layout.metadata.totalRows;
    if (widgetDensity < 2) {
      suggestions.push({
        type: 'density',
        message: 'Consider using a more compact layout to reduce scrolling'
      });
    }
    
    const tableCount = layout.metadata.widgetsByType['table'] || 0;
    if (tableCount > layout.widgets.length * 0.3) {
      suggestions.push({
        type: 'visualization',
        message: 'Consider using more visual representations instead of tables'
      });
    }
    
    const kpiWidgets = layout.widgets.filter(w => w.kpi);
    if (kpiWidgets.length > 0 && kpiWidgets.some(w => w.row > 3)) {
      suggestions.push({
        type: 'hierarchy',
        message: 'Move KPI widgets to the top for better visibility'
      });
    }
    
    return suggestions;
  }

  generateResponsiveBreakpoints(layout) {
    return {
      desktop: layout,
      tablet: this.adaptLayoutForBreakpoint(layout, 8),
      mobile: this.adaptLayoutForBreakpoint(layout, 4)
    };
  }

  adaptLayoutForBreakpoint(layout, columns) {
    const scaleFactor = columns / this.gridColumns;
    const adaptedWidgets = [];
    let currentRow = 0;
    
    const sortedWidgets = [...layout.widgets].sort((a, b) => {
      if (a.row !== b.row) return a.row - b.row;
      return a.column - b.column;
    });
    
    sortedWidgets.forEach(widget => {
      const newWidth = Math.max(
        this.widgetSizes[widget.type]?.minWidth || 3,
        Math.min(columns, Math.round(widget.width * scaleFactor))
      );
      
      adaptedWidgets.push({
        ...widget,
        column: 0,
        row: currentRow,
        width: newWidth
      });
      
      if (newWidth >= columns * 0.8) {
        currentRow += widget.height;
      }
    });
    
    return {
      widgets: adaptedWidgets,
      metadata: {
        ...layout.metadata,
        gridColumns: columns
      }
    };
  }
}

module.exports = LayoutOptimizer;