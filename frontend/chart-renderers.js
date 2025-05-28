/**
 * Specialized Chart Renderers
 * Each renderer handles a specific chart type with optimized rendering
 */

/**
 * Base Chart Renderer
 */
class BaseChartRenderer {
  constructor() {
    this.colors = [
      '#0366d6', '#28a745', '#dc3545', '#ffc107',
      '#6f42c1', '#20c997', '#fd7e14', '#e83e8c'
    ];
    this.padding = { top: 40, right: 40, bottom: 40, left: 60 };
  }

  getChartArea(context) {
    return {
      x: this.padding.left,
      y: this.padding.top,
      width: context.size.width - this.padding.left - this.padding.right,
      height: context.size.height - this.padding.top - this.padding.bottom
    };
  }

  drawAxes(ctx, chartArea, context) {
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartArea.x, chartArea.y + chartArea.height);
    ctx.lineTo(chartArea.x + chartArea.width, chartArea.y + chartArea.height);
    ctx.moveTo(chartArea.x, chartArea.y);
    ctx.lineTo(chartArea.x, chartArea.y + chartArea.height);
    ctx.stroke();
  }

  drawGrid(ctx, chartArea, xTicks, yTicks) {
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 0.5;
    
    // Horizontal grid lines
    yTicks.forEach(tick => {
      ctx.beginPath();
      ctx.moveTo(chartArea.x, tick.y);
      ctx.lineTo(chartArea.x + chartArea.width, tick.y);
      ctx.stroke();
    });
    
    // Vertical grid lines
    xTicks.forEach(tick => {
      ctx.beginPath();
      ctx.moveTo(tick.x, chartArea.y);
      ctx.lineTo(tick.x, chartArea.y + chartArea.height);
      ctx.stroke();
    });
  }

  formatNumber(value) {
    if (Math.abs(value) >= 1e9) return (value / 1e9).toFixed(1) + 'B';
    if (Math.abs(value) >= 1e6) return (value / 1e6).toFixed(1) + 'M';
    if (Math.abs(value) >= 1e3) return (value / 1e3).toFixed(1) + 'K';
    return value.toFixed(1);
  }
}

/**
 * Line Chart Renderer
 */
class LineChartRenderer extends BaseChartRenderer {
  renderCanvas(ctx, data, context) {
    const chartArea = this.getChartArea(context);
    
    // Draw axes and grid
    this.drawAxes(ctx, chartArea, context);
    
    if (data.length === 0) return;
    
    // Calculate scales
    const xScale = chartArea.width / (data.length - 1);
    const yRange = context.dataRange.max - context.dataRange.min;
    const yScale = chartArea.height / yRange;
    
    // Draw grid
    const yTicks = this.calculateYTicks(context.dataRange, chartArea);
    const xTicks = this.calculateXTicks(data, chartArea);
    this.drawGrid(ctx, chartArea, xTicks, yTicks);
    
    // Draw labels
    this.drawLabels(ctx, xTicks, yTicks, context);
    
    // Draw line
    ctx.strokeStyle = this.colors[0];
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    
    data.forEach((point, i) => {
      const x = chartArea.x + i * xScale;
      const y = chartArea.y + chartArea.height - ((point.value || point) - context.dataRange.min) * yScale;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
    
    // Draw area fill
    if (context.preferences?.fillArea) {
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = this.colors[0];
      ctx.lineTo(chartArea.x + chartArea.width, chartArea.y + chartArea.height);
      ctx.lineTo(chartArea.x, chartArea.y + chartArea.height);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    
    // Draw data points
    if (data.length < 50) {
      ctx.fillStyle = this.colors[0];
      data.forEach((point, i) => {
        const x = chartArea.x + i * xScale;
        const y = chartArea.y + chartArea.height - ((point.value || point) - context.dataRange.min) * yScale;
        
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  renderSVG(svg, data, context) {
    const chartArea = this.getChartArea(context);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    
    // Add axes
    const axes = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    axes.setAttribute('d', `M${chartArea.x},${chartArea.y + chartArea.height} L${chartArea.x + chartArea.width},${chartArea.y + chartArea.height} M${chartArea.x},${chartArea.y} L${chartArea.x},${chartArea.y + chartArea.height}`);
    axes.setAttribute('stroke', '#e0e0e0');
    axes.setAttribute('fill', 'none');
    g.appendChild(axes);
    
    if (data.length === 0) {
      svg.appendChild(g);
      return;
    }
    
    // Calculate scales
    const xScale = chartArea.width / (data.length - 1);
    const yRange = context.dataRange.max - context.dataRange.min;
    const yScale = chartArea.height / yRange;
    
    // Create line path
    const pathData = data.map((point, i) => {
      const x = chartArea.x + i * xScale;
      const y = chartArea.y + chartArea.height - ((point.value || point) - context.dataRange.min) * yScale;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
    
    // Add line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', pathData);
    line.setAttribute('stroke', this.colors[0]);
    line.setAttribute('stroke-width', '2');
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke-linejoin', 'round');
    line.setAttribute('stroke-linecap', 'round');
    
    // Add animation
    if (context.preferences?.animations) {
      const length = line.getTotalLength();
      line.style.strokeDasharray = length;
      line.style.strokeDashoffset = length;
      line.style.animation = 'dash 1s ease-out forwards';
    }
    
    g.appendChild(line);
    
    // Add data points for smaller datasets
    if (data.length < 50) {
      data.forEach((point, i) => {
        const x = chartArea.x + i * xScale;
        const y = chartArea.y + chartArea.height - ((point.value || point) - context.dataRange.min) * yScale;
        
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', '3');
        circle.setAttribute('fill', this.colors[0]);
        
        // Add hover effect
        circle.setAttribute('class', 'data-point');
        circle.setAttribute('data-value', point.value || point);
        
        g.appendChild(circle);
      });
    }
    
    svg.appendChild(g);
  }

  calculateYTicks(dataRange, chartArea) {
    const tickCount = 5;
    const range = dataRange.max - dataRange.min;
    const tickInterval = range / tickCount;
    const ticks = [];
    
    for (let i = 0; i <= tickCount; i++) {
      const value = dataRange.min + i * tickInterval;
      const y = chartArea.y + chartArea.height - (i * chartArea.height / tickCount);
      ticks.push({ value, y });
    }
    
    return ticks;
  }

  calculateXTicks(data, chartArea) {
    const maxTicks = 10;
    const interval = Math.ceil(data.length / maxTicks);
    const ticks = [];
    
    for (let i = 0; i < data.length; i += interval) {
      const x = chartArea.x + (i / (data.length - 1)) * chartArea.width;
      ticks.push({ 
        value: data[i].timestamp || i, 
        x,
        label: data[i].label || i
      });
    }
    
    return ticks;
  }

  drawLabels(ctx, xTicks, yTicks, context) {
    ctx.fillStyle = '#666';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    
    // Y-axis labels
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    yTicks.forEach(tick => {
      ctx.fillText(this.formatNumber(tick.value), this.padding.left - 10, tick.y);
    });
    
    // X-axis labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    xTicks.forEach(tick => {
      ctx.fillText(tick.label, tick.x, context.size.height - this.padding.bottom + 10);
    });
  }
}

/**
 * Bar Chart Renderer
 */
class BarChartRenderer extends BaseChartRenderer {
  renderCanvas(ctx, data, context) {
    const chartArea = this.getChartArea(context);
    
    // Draw axes
    this.drawAxes(ctx, chartArea, context);
    
    if (data.length === 0) return;
    
    // Calculate dimensions
    const barWidth = chartArea.width / data.length * 0.8;
    const barSpacing = chartArea.width / data.length * 0.2;
    const yScale = chartArea.height / (context.dataRange.max - context.dataRange.min);
    
    // Draw bars
    data.forEach((point, i) => {
      const value = point.value || point;
      const x = chartArea.x + i * (barWidth + barSpacing) + barSpacing / 2;
      const barHeight = (value - context.dataRange.min) * yScale;
      const y = chartArea.y + chartArea.height - barHeight;
      
      // Bar fill
      ctx.fillStyle = this.colors[i % this.colors.length];
      ctx.fillRect(x, y, barWidth, barHeight);
      
      // Value label
      if (context.preferences?.showValues) {
        ctx.fillStyle = '#666';
        ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(this.formatNumber(value), x + barWidth / 2, y - 5);
      }
      
      // Category label
      if (point.category) {
        ctx.fillStyle = '#666';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.save();
        ctx.translate(x + barWidth / 2, chartArea.y + chartArea.height + 10);
        ctx.rotate(-Math.PI / 4);
        ctx.fillText(point.category, 0, 0);
        ctx.restore();
      }
    });
  }

  renderSVG(svg, data, context) {
    const chartArea = this.getChartArea(context);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    
    // Add axes
    const axes = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    axes.setAttribute('d', `M${chartArea.x},${chartArea.y + chartArea.height} L${chartArea.x + chartArea.width},${chartArea.y + chartArea.height} M${chartArea.x},${chartArea.y} L${chartArea.x},${chartArea.y + chartArea.height}`);
    axes.setAttribute('stroke', '#e0e0e0');
    axes.setAttribute('fill', 'none');
    g.appendChild(axes);
    
    if (data.length === 0) {
      svg.appendChild(g);
      return;
    }
    
    // Calculate dimensions
    const barWidth = chartArea.width / data.length * 0.8;
    const barSpacing = chartArea.width / data.length * 0.2;
    const yScale = chartArea.height / (context.dataRange.max - context.dataRange.min);
    
    // Create bars
    data.forEach((point, i) => {
      const value = point.value || point;
      const x = chartArea.x + i * (barWidth + barSpacing) + barSpacing / 2;
      const barHeight = (value - context.dataRange.min) * yScale;
      const y = chartArea.y + chartArea.height - barHeight;
      
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', y);
      rect.setAttribute('width', barWidth);
      rect.setAttribute('height', barHeight);
      rect.setAttribute('fill', this.colors[i % this.colors.length]);
      rect.setAttribute('class', 'bar');
      rect.setAttribute('data-value', value);
      
      // Add animation
      if (context.preferences?.animations) {
        rect.setAttribute('height', '0');
        rect.setAttribute('y', chartArea.y + chartArea.height);
        rect.style.animation = `barGrow 0.5s ease-out ${i * 0.05}s forwards`;
      }
      
      g.appendChild(rect);
    });
    
    svg.appendChild(g);
  }
}

/**
 * Pie Chart Renderer
 */
class PieChartRenderer extends BaseChartRenderer {
  renderCanvas(ctx, data, context) {
    const centerX = context.size.width / 2;
    const centerY = context.size.height / 2;
    const radius = Math.min(context.size.width, context.size.height) * 0.35;
    
    if (data.length === 0) return;
    
    // Calculate total
    const total = data.reduce((sum, point) => sum + (point.value || point), 0);
    
    // Draw slices
    let currentAngle = -Math.PI / 2;
    
    data.forEach((point, i) => {
      const value = point.value || point;
      const sliceAngle = (value / total) * Math.PI * 2;
      
      // Draw slice
      ctx.fillStyle = this.colors[i % this.colors.length];
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
      ctx.closePath();
      ctx.fill();
      
      // Draw label
      if (sliceAngle > 0.1) { // Only show label for slices > 5%
        const labelAngle = currentAngle + sliceAngle / 2;
        const labelX = centerX + Math.cos(labelAngle) * radius * 0.7;
        const labelY = centerY + Math.sin(labelAngle) * radius * 0.7;
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.round(value / total * 100)}%`, labelX, labelY);
      }
      
      currentAngle += sliceAngle;
    });
    
    // Draw legend
    if (context.preferences?.showLegend !== false) {
      this.drawLegend(ctx, data, context);
    }
  }

  renderSVG(svg, data, context) {
    const centerX = context.size.width / 2;
    const centerY = context.size.height / 2;
    const radius = Math.min(context.size.width, context.size.height) * 0.35;
    
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    
    if (data.length === 0) {
      svg.appendChild(g);
      return;
    }
    
    // Calculate total
    const total = data.reduce((sum, point) => sum + (point.value || point), 0);
    
    // Create slices
    let currentAngle = -Math.PI / 2;
    
    data.forEach((point, i) => {
      const value = point.value || point;
      const sliceAngle = (value / total) * Math.PI * 2;
      
      // Create path for slice
      const x1 = centerX + Math.cos(currentAngle) * radius;
      const y1 = centerY + Math.sin(currentAngle) * radius;
      const x2 = centerX + Math.cos(currentAngle + sliceAngle) * radius;
      const y2 = centerY + Math.sin(currentAngle + sliceAngle) * radius;
      
      const largeArcFlag = sliceAngle > Math.PI ? 1 : 0;
      
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`);
      path.setAttribute('fill', this.colors[i % this.colors.length]);
      path.setAttribute('class', 'pie-slice');
      path.setAttribute('data-value', value);
      path.setAttribute('data-category', point.category || `Category ${i + 1}`);
      
      // Add animation
      if (context.preferences?.animations) {
        path.style.transformOrigin = `${centerX}px ${centerY}px`;
        path.style.animation = `pieGrow 0.5s ease-out ${i * 0.1}s forwards`;
      }
      
      g.appendChild(path);
      
      currentAngle += sliceAngle;
    });
    
    svg.appendChild(g);
  }

  drawLegend(ctx, data, context) {
    const legendX = context.size.width - 150;
    const legendY = 50;
    const lineHeight = 20;
    
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    
    data.forEach((point, i) => {
      const y = legendY + i * lineHeight;
      
      // Color box
      ctx.fillStyle = this.colors[i % this.colors.length];
      ctx.fillRect(legendX, y - 10, 15, 15);
      
      // Label
      ctx.fillStyle = '#666';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(point.category || `Category ${i + 1}`, legendX + 20, y - 2);
    });
  }
}

/**
 * Scatter Plot Renderer
 */
class ScatterPlotRenderer extends BaseChartRenderer {
  renderCanvas(ctx, data, context) {
    const chartArea = this.getChartArea(context);
    
    // Draw axes
    this.drawAxes(ctx, chartArea, context);
    
    if (data.length === 0) return;
    
    // Calculate scales
    const xRange = this.getRange(data, 'x');
    const yRange = this.getRange(data, 'y');
    const xScale = chartArea.width / (xRange.max - xRange.min);
    const yScale = chartArea.height / (yRange.max - yRange.min);
    
    // Draw points
    data.forEach((point, i) => {
      const x = chartArea.x + (point.x - xRange.min) * xScale;
      const y = chartArea.y + chartArea.height - (point.y - yRange.min) * yScale;
      const size = point.size || 5;
      const color = point.color || this.colors[i % this.colors.length];
      
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    });
    
    ctx.globalAlpha = 1;
  }

  renderSVG(svg, data, context) {
    const chartArea = this.getChartArea(context);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    
    // Add axes
    const axes = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    axes.setAttribute('d', `M${chartArea.x},${chartArea.y + chartArea.height} L${chartArea.x + chartArea.width},${chartArea.y + chartArea.height} M${chartArea.x},${chartArea.y} L${chartArea.x},${chartArea.y + chartArea.height}`);
    axes.setAttribute('stroke', '#e0e0e0');
    axes.setAttribute('fill', 'none');
    g.appendChild(axes);
    
    if (data.length === 0) {
      svg.appendChild(g);
      return;
    }
    
    // Calculate scales
    const xRange = this.getRange(data, 'x');
    const yRange = this.getRange(data, 'y');
    const xScale = chartArea.width / (xRange.max - xRange.min);
    const yScale = chartArea.height / (yRange.max - yRange.min);
    
    // Create points
    data.forEach((point, i) => {
      const x = chartArea.x + (point.x - xRange.min) * xScale;
      const y = chartArea.y + chartArea.height - (point.y - yRange.min) * yScale;
      const size = point.size || 5;
      const color = point.color || this.colors[i % this.colors.length];
      
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', size);
      circle.setAttribute('fill', color);
      circle.setAttribute('opacity', '0.7');
      circle.setAttribute('class', 'scatter-point');
      circle.setAttribute('data-x', point.x);
      circle.setAttribute('data-y', point.y);
      
      g.appendChild(circle);
    });
    
    svg.appendChild(g);
  }

  getRange(data, field) {
    const values = data.map(d => d[field]);
    return {
      min: Math.min(...values),
      max: Math.max(...values)
    };
  }
}

/**
 * Heatmap Renderer
 */
class HeatmapRenderer extends BaseChartRenderer {
  renderCanvas(ctx, data, context) {
    const chartArea = this.getChartArea(context);
    
    if (!data || data.length === 0) return;
    
    const rows = data.length;
    const cols = data[0].length;
    const cellWidth = chartArea.width / cols;
    const cellHeight = chartArea.height / rows;
    
    // Find min/max values
    let min = Infinity;
    let max = -Infinity;
    data.forEach(row => {
      row.forEach(value => {
        if (value < min) min = value;
        if (value > max) max = value;
      });
    });
    
    // Draw cells
    data.forEach((row, i) => {
      row.forEach((value, j) => {
        const x = chartArea.x + j * cellWidth;
        const y = chartArea.y + i * cellHeight;
        const intensity = (value - min) / (max - min);
        
        ctx.fillStyle = this.getHeatColor(intensity);
        ctx.fillRect(x, y, cellWidth, cellHeight);
      });
    });
  }

  renderSVG(svg, data, context) {
    const chartArea = this.getChartArea(context);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    
    if (!data || data.length === 0) {
      svg.appendChild(g);
      return;
    }
    
    const rows = data.length;
    const cols = data[0].length;
    const cellWidth = chartArea.width / cols;
    const cellHeight = chartArea.height / rows;
    
    // Find min/max values
    let min = Infinity;
    let max = -Infinity;
    data.forEach(row => {
      row.forEach(value => {
        if (value < min) min = value;
        if (value > max) max = value;
      });
    });
    
    // Create cells
    data.forEach((row, i) => {
      row.forEach((value, j) => {
        const x = chartArea.x + j * cellWidth;
        const y = chartArea.y + i * cellHeight;
        const intensity = (value - min) / (max - min);
        
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', cellWidth);
        rect.setAttribute('height', cellHeight);
        rect.setAttribute('fill', this.getHeatColor(intensity));
        rect.setAttribute('class', 'heatmap-cell');
        rect.setAttribute('data-value', value);
        
        g.appendChild(rect);
      });
    });
    
    svg.appendChild(g);
  }

  getHeatColor(intensity) {
    // Blue to red gradient
    const r = Math.round(255 * intensity);
    const b = Math.round(255 * (1 - intensity));
    const g = 0;
    return `rgb(${r}, ${g}, ${b})`;
  }
}

/**
 * Gauge Renderer
 */
class GaugeRenderer extends BaseChartRenderer {
  renderCanvas(ctx, data, context) {
    const centerX = context.size.width / 2;
    const centerY = context.size.height * 0.6;
    const radius = Math.min(context.size.width, context.size.height) * 0.35;
    const value = data[0]?.value || data[0] || 0;
    
    // Calculate angle
    const minAngle = Math.PI * 0.75;
    const maxAngle = Math.PI * 2.25;
    const range = context.dataRange.max - context.dataRange.min;
    const percentage = (value - context.dataRange.min) / range;
    const angle = minAngle + (maxAngle - minAngle) * percentage;
    
    // Draw background arc
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = radius * 0.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, minAngle, maxAngle);
    ctx.stroke();
    
    // Draw value arc
    ctx.strokeStyle = this.getGaugeColor(percentage);
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, minAngle, angle);
    ctx.stroke();
    
    // Draw value text
    ctx.fillStyle = '#333';
    ctx.font = `bold ${radius * 0.3}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.formatNumber(value), centerX, centerY);
    
    // Draw label
    if (data[0]?.label) {
      ctx.font = `${radius * 0.15}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.fillStyle = '#666';
      ctx.fillText(data[0].label, centerX, centerY + radius * 0.3);
    }
  }

  renderSVG(svg, data, context) {
    const centerX = context.size.width / 2;
    const centerY = context.size.height * 0.6;
    const radius = Math.min(context.size.width, context.size.height) * 0.35;
    const value = data[0]?.value || data[0] || 0;
    
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    
    // Calculate angles
    const minAngle = Math.PI * 0.75;
    const maxAngle = Math.PI * 2.25;
    const range = context.dataRange.max - context.dataRange.min;
    const percentage = (value - context.dataRange.min) / range;
    const angle = minAngle + (maxAngle - minAngle) * percentage;
    
    // Create arc path
    const createArcPath = (startAngle, endAngle) => {
      const x1 = centerX + Math.cos(startAngle) * radius;
      const y1 = centerY + Math.sin(startAngle) * radius;
      const x2 = centerX + Math.cos(endAngle) * radius;
      const y2 = centerY + Math.sin(endAngle) * radius;
      const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;
      
      return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`;
    };
    
    // Background arc
    const bgArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    bgArc.setAttribute('d', createArcPath(minAngle, maxAngle));
    bgArc.setAttribute('stroke', '#e0e0e0');
    bgArc.setAttribute('stroke-width', radius * 0.2);
    bgArc.setAttribute('stroke-linecap', 'round');
    bgArc.setAttribute('fill', 'none');
    g.appendChild(bgArc);
    
    // Value arc
    const valueArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    valueArc.setAttribute('d', createArcPath(minAngle, angle));
    valueArc.setAttribute('stroke', this.getGaugeColor(percentage));
    valueArc.setAttribute('stroke-width', radius * 0.2);
    valueArc.setAttribute('stroke-linecap', 'round');
    valueArc.setAttribute('fill', 'none');
    
    if (context.preferences?.animations) {
      const length = valueArc.getTotalLength();
      valueArc.style.strokeDasharray = length;
      valueArc.style.strokeDashoffset = length;
      valueArc.style.animation = 'dash 1s ease-out forwards';
    }
    
    g.appendChild(valueArc);
    
    // Value text
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', centerX);
    text.setAttribute('y', centerY);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('font-size', radius * 0.3);
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('fill', '#333');
    text.textContent = this.formatNumber(value);
    g.appendChild(text);
    
    svg.appendChild(g);
  }

  getGaugeColor(percentage) {
    if (percentage < 0.3) return '#28a745';
    if (percentage < 0.7) return '#ffc107';
    return '#dc3545';
  }
}

/**
 * Sparkline Renderer
 */
class SparklineRenderer extends BaseChartRenderer {
  constructor() {
    super();
    this.padding = { top: 5, right: 5, bottom: 5, left: 5 };
  }

  renderCanvas(ctx, data, context) {
    const chartArea = this.getChartArea(context);
    
    if (data.length === 0) return;
    
    // Calculate scales
    const xScale = chartArea.width / (data.length - 1);
    const yRange = context.dataRange.max - context.dataRange.min;
    const yScale = chartArea.height / yRange;
    
    // Draw line
    ctx.strokeStyle = this.colors[0];
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    
    data.forEach((point, i) => {
      const x = chartArea.x + i * xScale;
      const y = chartArea.y + chartArea.height - ((point.value || point) - context.dataRange.min) * yScale;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
    
    // Highlight last point
    const lastPoint = data[data.length - 1];
    const lastX = chartArea.x + (data.length - 1) * xScale;
    const lastY = chartArea.y + chartArea.height - ((lastPoint.value || lastPoint) - context.dataRange.min) * yScale;
    
    ctx.fillStyle = this.colors[0];
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  renderSVG(svg, data, context) {
    const chartArea = this.getChartArea(context);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    
    if (data.length === 0) {
      svg.appendChild(g);
      return;
    }
    
    // Calculate scales
    const xScale = chartArea.width / (data.length - 1);
    const yRange = context.dataRange.max - context.dataRange.min;
    const yScale = chartArea.height / yRange;
    
    // Create line path
    const pathData = data.map((point, i) => {
      const x = chartArea.x + i * xScale;
      const y = chartArea.y + chartArea.height - ((point.value || point) - context.dataRange.min) * yScale;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
    
    // Add line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', pathData);
    line.setAttribute('stroke', this.colors[0]);
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke-linejoin', 'round');
    line.setAttribute('stroke-linecap', 'round');
    g.appendChild(line);
    
    // Highlight last point
    const lastPoint = data[data.length - 1];
    const lastX = chartArea.x + (data.length - 1) * xScale;
    const lastY = chartArea.y + chartArea.height - ((lastPoint.value || lastPoint) - context.dataRange.min) * yScale;
    
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', lastX);
    circle.setAttribute('cy', lastY);
    circle.setAttribute('r', '3');
    circle.setAttribute('fill', this.colors[0]);
    g.appendChild(circle);
    
    svg.appendChild(g);
  }
}

/**
 * Table Renderer
 */
class TableRenderer extends BaseChartRenderer {
  renderCanvas(ctx, data, context) {
    // Tables are better rendered as HTML
    return this.createHTMLTable(data, context);
  }

  renderSVG(svg, data, context) {
    // Tables are better rendered as HTML
    return this.createHTMLTable(data, context);
  }

  createHTMLTable(data, context) {
    const container = document.createElement('div');
    container.className = 'adaptive-table-container';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.overflow = 'auto';
    
    const table = document.createElement('table');
    table.className = 'adaptive-table';
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    
    // Create header
    if (data.length > 0 && typeof data[0] === 'object') {
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      
      Object.keys(data[0]).forEach(key => {
        const th = document.createElement('th');
        th.textContent = key;
        th.style.padding = '10px';
        th.style.textAlign = 'left';
        th.style.borderBottom = '2px solid #e0e0e0';
        th.style.fontWeight = '600';
        headerRow.appendChild(th);
      });
      
      thead.appendChild(headerRow);
      table.appendChild(thead);
    }
    
    // Create body
    const tbody = document.createElement('tbody');
    
    data.forEach((row, i) => {
      const tr = document.createElement('tr');
      
      if (i % 2 === 1) {
        tr.style.backgroundColor = '#f8f9fa';
      }
      
      if (typeof row === 'object') {
        Object.values(row).forEach(value => {
          const td = document.createElement('td');
          td.textContent = value;
          td.style.padding = '8px 10px';
          td.style.borderBottom = '1px solid #e0e0e0';
          tr.appendChild(td);
        });
      } else {
        const td = document.createElement('td');
        td.textContent = row;
        td.style.padding = '8px 10px';
        td.style.borderBottom = '1px solid #e0e0e0';
        tr.appendChild(td);
      }
      
      tbody.appendChild(tr);
    });
    
    table.appendChild(tbody);
    container.appendChild(table);
    
    return container;
  }
}

// Export renderers
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LineChartRenderer,
    BarChartRenderer,
    PieChartRenderer,
    ScatterPlotRenderer,
    HeatmapRenderer,
    GaugeRenderer,
    SparklineRenderer,
    TableRenderer
  };
}