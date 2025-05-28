/**
 * Client-Side Analytics Engine
 * Performs intelligent analysis directly in the browser
 */

class ClientAnalytics {
  constructor() {
    this.cache = new SmartCache();
    this.predictor = new LocalPredictor();
    this.analyzer = new TrendAnalyzer();
    this.anomalyDetector = new AnomalyDetector();
    this.sampler = new IntelligentSampler();
  }

  /**
   * Analyze data based on type
   */
  async analyze(data, type, options = {}) {
    // Use cached analysis if available
    const cacheKey = this.getCacheKey(data, type, options);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    let result;
    
    switch (type) {
      case 'trend':
        result = await this.analyzer.findTrends(data, options);
        break;
      
      case 'anomaly':
        result = await this.anomalyDetector.detect(data, options);
        break;
      
      case 'forecast':
        result = await this.predictor.forecast(data, options);
        break;
      
      case 'summary':
        result = await this.analyzer.summarize(data, options);
        break;
      
      case 'correlation':
        result = await this.analyzer.findCorrelations(data, options);
        break;
      
      case 'pattern':
        result = await this.analyzer.findPatterns(data, options);
        break;
      
      default:
        result = await this.analyzer.basicAnalysis(data, options);
    }
    
    // Cache the result
    this.cache.set(cacheKey, result);
    
    return result;
  }

  /**
   * Smart data sampling for large datasets
   */
  sample(data, targetSize) {
    return this.sampler.sample(data, targetSize);
  }

  getCacheKey(data, type, options) {
    // Create a unique key based on data characteristics
    const dataHash = this.hashData(data);
    return `${type}-${dataHash}-${JSON.stringify(options)}`;
  }

  hashData(data) {
    // Simple hash based on data length and sample values
    const sample = data.slice(0, 10).concat(data.slice(-10));
    return `${data.length}-${sample.map(d => d.value || d).join(',')}`;
  }
}

/**
 * Trend Analyzer - Identifies patterns and trends
 */
class TrendAnalyzer {
  async findTrends(data, options = {}) {
    const trends = {
      overall: this.calculateOverallTrend(data),
      seasonal: this.findSeasonalPatterns(data),
      shortTerm: this.analyzeShortTermTrend(data),
      longTerm: this.analyzeLongTermTrend(data),
      changePoints: this.detectChangePoints(data),
      forecast: this.simpleForecast(data, options.forecastPeriods || 10)
    };
    
    return trends;
  }

  calculateOverallTrend(data) {
    if (data.length < 2) return 'insufficient_data';
    
    // Simple linear regression
    const n = data.length;
    const sumX = data.reduce((sum, d, i) => sum + i, 0);
    const sumY = data.reduce((sum, d) => sum + (d.value || d), 0);
    const sumXY = data.reduce((sum, d, i) => sum + i * (d.value || d), 0);
    const sumX2 = data.reduce((sum, d, i) => sum + i * i, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    if (Math.abs(slope) < 0.01) return 'stable';
    if (slope > 0.1) return 'increasing_fast';
    if (slope > 0) return 'increasing';
    if (slope < -0.1) return 'decreasing_fast';
    return 'decreasing';
  }

  findSeasonalPatterns(data) {
    // Detect daily, weekly, monthly patterns
    const patterns = {
      hourly: this.detectHourlyPattern(data),
      daily: this.detectDailyPattern(data),
      weekly: this.detectWeeklyPattern(data)
    };
    
    return patterns;
  }

  detectHourlyPattern(data) {
    if (data.length < 24) return null;
    
    // Group by hour and analyze variance
    const hourlyGroups = new Array(24).fill(null).map(() => []);
    
    data.forEach((d, i) => {
      const hour = new Date(d.timestamp || i).getHours();
      hourlyGroups[hour].push(d.value || d);
    });
    
    const hourlyAverages = hourlyGroups.map(group => 
      group.length > 0 ? group.reduce((a, b) => a + b, 0) / group.length : 0
    );
    
    // Find peak and trough hours
    const maxHour = hourlyAverages.indexOf(Math.max(...hourlyAverages));
    const minHour = hourlyAverages.indexOf(Math.min(...hourlyAverages));
    
    return {
      detected: true,
      peakHour: maxHour,
      troughHour: minHour,
      pattern: hourlyAverages
    };
  }

  detectDailyPattern(data) {
    // Similar to hourly but for days of week
    return null; // Simplified for example
  }

  detectWeeklyPattern(data) {
    // Detect weekly patterns
    return null; // Simplified for example
  }

  analyzeShortTermTrend(data) {
    // Analyze last 10% of data
    const recentData = data.slice(-Math.ceil(data.length * 0.1));
    return this.calculateOverallTrend(recentData);
  }

  analyzeLongTermTrend(data) {
    // Use moving average to smooth data
    const smoothed = this.movingAverage(data, Math.ceil(data.length * 0.1));
    return this.calculateOverallTrend(smoothed);
  }

  detectChangePoints(data) {
    const changePoints = [];
    const windowSize = Math.max(5, Math.floor(data.length * 0.05));
    
    for (let i = windowSize; i < data.length - windowSize; i++) {
      const before = data.slice(i - windowSize, i);
      const after = data.slice(i, i + windowSize);
      
      const beforeAvg = this.average(before);
      const afterAvg = this.average(after);
      
      const change = Math.abs(afterAvg - beforeAvg) / beforeAvg;
      
      if (change > 0.2) { // 20% change threshold
        changePoints.push({
          index: i,
          timestamp: data[i].timestamp,
          changeMagnitude: change,
          direction: afterAvg > beforeAvg ? 'increase' : 'decrease'
        });
      }
    }
    
    return changePoints;
  }

  simpleForecast(data, periods) {
    // Simple linear extrapolation
    const trend = this.calculateOverallTrend(data);
    const lastValue = data[data.length - 1].value || data[data.length - 1];
    const avgChange = this.calculateAverageChange(data);
    
    const forecast = [];
    for (let i = 1; i <= periods; i++) {
      forecast.push({
        period: i,
        value: lastValue + (avgChange * i),
        confidence: Math.max(0, 1 - (i * 0.1)) // Confidence decreases with distance
      });
    }
    
    return forecast;
  }

  async summarize(data, options = {}) {
    const values = data.map(d => d.value || d);
    
    return {
      count: data.length,
      min: Math.min(...values),
      max: Math.max(...values),
      mean: this.average(values),
      median: this.median(values),
      stdDev: this.standardDeviation(values),
      percentiles: {
        p25: this.percentile(values, 25),
        p50: this.percentile(values, 50),
        p75: this.percentile(values, 75),
        p90: this.percentile(values, 90),
        p95: this.percentile(values, 95),
        p99: this.percentile(values, 99)
      }
    };
  }

  async findCorrelations(datasets, options = {}) {
    const correlations = [];
    
    // Compare each pair of datasets
    for (let i = 0; i < datasets.length; i++) {
      for (let j = i + 1; j < datasets.length; j++) {
        const correlation = this.calculateCorrelation(datasets[i], datasets[j]);
        
        if (Math.abs(correlation) > 0.5) { // Significant correlation
          correlations.push({
            dataset1: i,
            dataset2: j,
            correlation,
            strength: Math.abs(correlation) > 0.8 ? 'strong' : 'moderate',
            direction: correlation > 0 ? 'positive' : 'negative'
          });
        }
      }
    }
    
    return correlations;
  }

  async findPatterns(data, options = {}) {
    return {
      trends: await this.findTrends(data, options),
      cycles: this.detectCycles(data),
      outliers: this.detectOutliers(data),
      clusters: this.findClusters(data)
    };
  }

  // Helper methods
  movingAverage(data, windowSize) {
    const result = [];
    
    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - Math.floor(windowSize / 2));
      const end = Math.min(data.length, i + Math.ceil(windowSize / 2));
      const window = data.slice(start, end);
      
      result.push({
        ...data[i],
        value: this.average(window.map(d => d.value || d))
      });
    }
    
    return result;
  }

  average(values) {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  standardDeviation(values) {
    const avg = this.average(values);
    const squareDiffs = values.map(value => Math.pow(value - avg, 2));
    return Math.sqrt(this.average(squareDiffs));
  }

  percentile(values, p) {
    const sorted = [...values].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;
    
    if (lower === upper) return sorted[lower];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  calculateAverageChange(data) {
    if (data.length < 2) return 0;
    
    let totalChange = 0;
    for (let i = 1; i < data.length; i++) {
      totalChange += (data[i].value || data[i]) - (data[i - 1].value || data[i - 1]);
    }
    
    return totalChange / (data.length - 1);
  }

  calculateCorrelation(data1, data2) {
    // Pearson correlation coefficient
    const n = Math.min(data1.length, data2.length);
    if (n < 2) return 0;
    
    const values1 = data1.slice(0, n).map(d => d.value || d);
    const values2 = data2.slice(0, n).map(d => d.value || d);
    
    const mean1 = this.average(values1);
    const mean2 = this.average(values2);
    
    let numerator = 0;
    let denominator1 = 0;
    let denominator2 = 0;
    
    for (let i = 0; i < n; i++) {
      const diff1 = values1[i] - mean1;
      const diff2 = values2[i] - mean2;
      
      numerator += diff1 * diff2;
      denominator1 += diff1 * diff1;
      denominator2 += diff2 * diff2;
    }
    
    const denominator = Math.sqrt(denominator1 * denominator2);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  detectCycles(data) {
    // Simplified cycle detection
    return {
      detected: false,
      period: null,
      confidence: 0
    };
  }

  detectOutliers(data) {
    const values = data.map(d => d.value || d);
    const q1 = this.percentile(values, 25);
    const q3 = this.percentile(values, 75);
    const iqr = q3 - q1;
    
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    
    return data.filter((d, i) => {
      const value = d.value || d;
      return value < lowerBound || value > upperBound;
    }).map((d, i) => ({
      index: data.indexOf(d),
      value: d.value || d,
      type: (d.value || d) < lowerBound ? 'low' : 'high',
      severity: 'moderate'
    }));
  }

  findClusters(data) {
    // Simplified clustering
    return {
      clusters: [],
      optimal_k: 1
    };
  }
}

/**
 * Anomaly Detector - Detects unusual patterns
 */
class AnomalyDetector {
  async detect(data, options = {}) {
    const methods = {
      statistical: this.statisticalAnomalies(data),
      isolation: this.isolationForest(data),
      pattern: this.patternAnomalies(data),
      contextual: this.contextualAnomalies(data)
    };
    
    // Combine results from different methods
    const combined = this.combineResults(methods);
    
    return {
      anomalies: combined,
      summary: this.summarizeAnomalies(combined),
      confidence: this.calculateConfidence(methods)
    };
  }

  statisticalAnomalies(data) {
    const analyzer = new TrendAnalyzer();
    return analyzer.detectOutliers(data);
  }

  isolationForest(data) {
    // Simplified isolation forest
    return [];
  }

  patternAnomalies(data) {
    // Detect anomalies based on pattern breaks
    const anomalies = [];
    const windowSize = Math.max(5, Math.floor(data.length * 0.05));
    
    for (let i = windowSize; i < data.length; i++) {
      const window = data.slice(i - windowSize, i);
      const current = data[i].value || data[i];
      
      const expectedRange = this.getExpectedRange(window);
      
      if (current < expectedRange.min || current > expectedRange.max) {
        anomalies.push({
          index: i,
          value: current,
          expected: expectedRange,
          deviation: Math.abs(current - expectedRange.mean) / expectedRange.stdDev,
          type: 'pattern_break'
        });
      }
    }
    
    return anomalies;
  }

  contextualAnomalies(data) {
    // Detect anomalies based on context (time of day, day of week, etc.)
    return [];
  }

  getExpectedRange(window) {
    const values = window.map(d => d.value || d);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
    );
    
    return {
      mean,
      stdDev,
      min: mean - 2 * stdDev,
      max: mean + 2 * stdDev
    };
  }

  combineResults(methods) {
    const allAnomalies = [];
    const indexMap = new Map();
    
    // Combine and score anomalies
    Object.entries(methods).forEach(([method, anomalies]) => {
      anomalies.forEach(anomaly => {
        if (!indexMap.has(anomaly.index)) {
          indexMap.set(anomaly.index, {
            ...anomaly,
            methods: [method],
            score: 1
          });
        } else {
          const existing = indexMap.get(anomaly.index);
          existing.methods.push(method);
          existing.score++;
        }
      });
    });
    
    // Convert to array and sort by score
    return Array.from(indexMap.values())
      .sort((a, b) => b.score - a.score)
      .map(anomaly => ({
        ...anomaly,
        confidence: anomaly.score / Object.keys(methods).length
      }));
  }

  summarizeAnomalies(anomalies) {
    return {
      total: anomalies.length,
      highConfidence: anomalies.filter(a => a.confidence > 0.7).length,
      types: this.groupBy(anomalies, 'type'),
      severity: this.categorizeSeverity(anomalies)
    };
  }

  calculateConfidence(methods) {
    const totalMethods = Object.keys(methods).length;
    const methodsWithAnomalies = Object.values(methods).filter(m => m.length > 0).length;
    return methodsWithAnomalies / totalMethods;
  }

  groupBy(array, key) {
    return array.reduce((result, item) => {
      const group = item[key] || 'unknown';
      if (!result[group]) result[group] = 0;
      result[group]++;
      return result;
    }, {});
  }

  categorizeSeverity(anomalies) {
    return {
      critical: anomalies.filter(a => a.deviation > 4 || a.confidence > 0.9).length,
      high: anomalies.filter(a => a.deviation > 3 || a.confidence > 0.7).length,
      medium: anomalies.filter(a => a.deviation > 2 || a.confidence > 0.5).length,
      low: anomalies.length
    };
  }
}

/**
 * Local Predictor - Client-side predictions
 */
class LocalPredictor {
  async forecast(data, options = {}) {
    const {
      horizon = 10,
      method = 'auto',
      confidence = true
    } = options;
    
    // Select best method based on data characteristics
    const selectedMethod = method === 'auto' 
      ? this.selectBestMethod(data)
      : method;
    
    let forecast;
    
    switch (selectedMethod) {
      case 'linear':
        forecast = this.linearForecast(data, horizon);
        break;
      
      case 'exponential':
        forecast = this.exponentialSmoothing(data, horizon);
        break;
      
      case 'arima':
        forecast = this.simplifiedARIMA(data, horizon);
        break;
      
      case 'neural':
        forecast = this.simpleNeuralForecast(data, horizon);
        break;
      
      default:
        forecast = this.linearForecast(data, horizon);
    }
    
    if (confidence) {
      forecast = this.addConfidenceIntervals(forecast, data);
    }
    
    return {
      method: selectedMethod,
      forecast,
      accuracy: this.estimateAccuracy(data, selectedMethod)
    };
  }

  selectBestMethod(data) {
    // Analyze data characteristics
    const trend = this.detectTrend(data);
    const seasonality = this.detectSeasonality(data);
    const noise = this.estimateNoise(data);
    
    if (seasonality.detected) return 'arima';
    if (trend === 'exponential') return 'exponential';
    if (noise < 0.2) return 'linear';
    
    return 'exponential';
  }

  linearForecast(data, horizon) {
    // Simple linear regression
    const n = data.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = data.map(d => d.value || d);
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    const forecast = [];
    for (let i = 0; i < horizon; i++) {
      const x_i = n + i;
      forecast.push({
        period: i + 1,
        value: slope * x_i + intercept,
        timestamp: this.extrapolateTimestamp(data, i + 1)
      });
    }
    
    return forecast;
  }

  exponentialSmoothing(data, horizon, alpha = 0.3) {
    const values = data.map(d => d.value || d);
    const smoothed = [values[0]];
    
    // Calculate smoothed values
    for (let i = 1; i < values.length; i++) {
      smoothed.push(alpha * values[i] + (1 - alpha) * smoothed[i - 1]);
    }
    
    // Forecast
    const lastSmoothed = smoothed[smoothed.length - 1];
    const trend = smoothed[smoothed.length - 1] - smoothed[smoothed.length - 2];
    
    const forecast = [];
    for (let i = 0; i < horizon; i++) {
      forecast.push({
        period: i + 1,
        value: lastSmoothed + trend * (i + 1),
        timestamp: this.extrapolateTimestamp(data, i + 1)
      });
    }
    
    return forecast;
  }

  simplifiedARIMA(data, horizon) {
    // Very simplified ARIMA-like forecast
    // In production, use proper ARIMA implementation
    const values = data.map(d => d.value || d);
    
    // Difference the series
    const diffed = [];
    for (let i = 1; i < values.length; i++) {
      diffed.push(values[i] - values[i - 1]);
    }
    
    // Forecast differenced series
    const avgDiff = diffed.reduce((a, b) => a + b, 0) / diffed.length;
    
    const forecast = [];
    let lastValue = values[values.length - 1];
    
    for (let i = 0; i < horizon; i++) {
      lastValue += avgDiff;
      forecast.push({
        period: i + 1,
        value: lastValue,
        timestamp: this.extrapolateTimestamp(data, i + 1)
      });
    }
    
    return forecast;
  }

  simpleNeuralForecast(data, horizon) {
    // Placeholder for neural network forecast
    // In production, use TensorFlow.js or similar
    return this.exponentialSmoothing(data, horizon, 0.5);
  }

  addConfidenceIntervals(forecast, historicalData) {
    // Calculate prediction intervals based on historical variance
    const values = historicalData.map(d => d.value || d);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    return forecast.map((point, i) => ({
      ...point,
      lower95: point.value - 1.96 * stdDev * Math.sqrt(1 + i / 10),
      upper95: point.value + 1.96 * stdDev * Math.sqrt(1 + i / 10),
      lower80: point.value - 1.28 * stdDev * Math.sqrt(1 + i / 10),
      upper80: point.value + 1.28 * stdDev * Math.sqrt(1 + i / 10)
    }));
  }

  detectTrend(data) {
    const values = data.map(d => d.value || d);
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    const ratio = secondAvg / firstAvg;
    
    if (ratio > 1.5) return 'exponential';
    if (ratio > 1.1) return 'increasing';
    if (ratio < 0.9) return 'decreasing';
    return 'stable';
  }

  detectSeasonality(data) {
    // Simplified seasonality detection
    if (data.length < 24) return { detected: false };
    
    // Check for patterns every 24 periods (daily seasonality)
    const period = 24;
    const cycles = Math.floor(data.length / period);
    
    if (cycles < 2) return { detected: false };
    
    // Compare cycles
    let totalDiff = 0;
    for (let i = 0; i < period; i++) {
      const values = [];
      for (let cycle = 0; cycle < cycles; cycle++) {
        const index = cycle * period + i;
        if (index < data.length) {
          values.push(data[index].value || data[index]);
        }
      }
      
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;
      totalDiff += variance;
    }
    
    return {
      detected: totalDiff < data.length * 0.1,
      period: period,
      strength: 1 - (totalDiff / data.length)
    };
  }

  estimateNoise(data) {
    // Estimate noise level in data
    const values = data.map(d => d.value || d);
    const smoothed = this.movingAverage(values, 3);
    
    let totalDiff = 0;
    for (let i = 0; i < values.length; i++) {
      totalDiff += Math.abs(values[i] - smoothed[i]);
    }
    
    const avgDiff = totalDiff / values.length;
    const avgValue = values.reduce((a, b) => a + b, 0) / values.length;
    
    return avgDiff / avgValue; // Noise ratio
  }

  movingAverage(values, window) {
    const result = [];
    
    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - Math.floor(window / 2));
      const end = Math.min(values.length, i + Math.ceil(window / 2));
      const windowValues = values.slice(start, end);
      
      result.push(windowValues.reduce((a, b) => a + b, 0) / windowValues.length);
    }
    
    return result;
  }

  estimateAccuracy(data, method) {
    // Estimate forecast accuracy based on historical patterns
    // This is a placeholder - in production, use backtesting
    const noise = this.estimateNoise(data);
    
    const baseAccuracy = {
      linear: 0.8,
      exponential: 0.85,
      arima: 0.9,
      neural: 0.88
    };
    
    return Math.max(0.5, (baseAccuracy[method] || 0.7) - noise);
  }

  extrapolateTimestamp(data, periods) {
    if (!data[0].timestamp) return null;
    
    // Calculate average time interval
    const intervals = [];
    for (let i = 1; i < Math.min(data.length, 10); i++) {
      intervals.push(data[i].timestamp - data[i - 1].timestamp);
    }
    
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const lastTimestamp = data[data.length - 1].timestamp;
    
    return lastTimestamp + (avgInterval * periods);
  }
}

/**
 * Intelligent Sampler - Smart data sampling
 */
class IntelligentSampler {
  sample(data, targetSize) {
    if (data.length <= targetSize) return data;
    
    const method = this.selectSamplingMethod(data, targetSize);
    
    switch (method) {
      case 'lttb':
        return this.largestTriangleThreeBuckets(data, targetSize);
      
      case 'peaks':
        return this.peakPreservingSample(data, targetSize);
      
      case 'uniform':
        return this.uniformSample(data, targetSize);
      
      case 'adaptive':
        return this.adaptiveSample(data, targetSize);
      
      default:
        return this.uniformSample(data, targetSize);
    }
  }

  selectSamplingMethod(data, targetSize) {
    const compressionRatio = data.length / targetSize;
    
    if (compressionRatio > 100) return 'lttb';
    if (this.hasSignificantPeaks(data)) return 'peaks';
    if (compressionRatio > 10) return 'adaptive';
    
    return 'uniform';
  }

  largestTriangleThreeBuckets(data, targetSize) {
    // LTTB algorithm - preserves visual characteristics
    const sampled = [];
    const bucketSize = (data.length - 2) / (targetSize - 2);
    
    // Always include first point
    sampled.push(data[0]);
    
    let a = 0; // Previous selected point
    
    for (let i = 0; i < targetSize - 2; i++) {
      // Calculate bucket boundaries
      const bucketStart = Math.floor((i + 0) * bucketSize) + 1;
      const bucketEnd = Math.floor((i + 1) * bucketSize) + 1;
      
      // Get average point in next bucket
      const nextBucketStart = Math.floor((i + 1) * bucketSize) + 1;
      const nextBucketEnd = Math.floor((i + 2) * bucketSize) + 1;
      
      let avgX = 0, avgY = 0;
      const nextBucketLength = Math.min(nextBucketEnd, data.length) - nextBucketStart;
      
      for (let j = nextBucketStart; j < Math.min(nextBucketEnd, data.length); j++) {
        avgX += j;
        avgY += data[j].value || data[j];
      }
      
      avgX /= nextBucketLength;
      avgY /= nextBucketLength;
      
      // Find point in current bucket with largest triangle area
      let maxArea = -1;
      let maxAreaIndex = bucketStart;
      
      for (let j = bucketStart; j < Math.min(bucketEnd, data.length); j++) {
        const area = Math.abs(
          (a - avgX) * ((data[j].value || data[j]) - (data[a].value || data[a])) -
          (a - j) * (avgY - (data[a].value || data[a]))
        ) * 0.5;
        
        if (area > maxArea) {
          maxArea = area;
          maxAreaIndex = j;
        }
      }
      
      sampled.push(data[maxAreaIndex]);
      a = maxAreaIndex;
    }
    
    // Always include last point
    sampled.push(data[data.length - 1]);
    
    return sampled;
  }

  peakPreservingSample(data, targetSize) {
    // Preserve peaks and valleys
    const peaks = this.findPeaksAndValleys(data);
    const important = [...peaks];
    
    // Add first and last points
    if (!important.includes(0)) important.push(0);
    if (!important.includes(data.length - 1)) important.push(data.length - 1);
    
    important.sort((a, b) => a - b);
    
    // If we have room, add more points
    if (important.length < targetSize) {
      const additional = this.uniformSample(
        data.filter((_, i) => !important.includes(i)),
        targetSize - important.length
      );
      
      return [...important.map(i => data[i]), ...additional].sort((a, b) => 
        (a.timestamp || 0) - (b.timestamp || 0)
      );
    }
    
    // If too many important points, prioritize by magnitude
    return important
      .slice(0, targetSize)
      .map(i => data[i])
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }

  uniformSample(data, targetSize) {
    const step = data.length / targetSize;
    const sampled = [];
    
    for (let i = 0; i < targetSize; i++) {
      const index = Math.floor(i * step);
      sampled.push(data[Math.min(index, data.length - 1)]);
    }
    
    return sampled;
  }

  adaptiveSample(data, targetSize) {
    // Sample more densely where variance is high
    const variances = this.calculateLocalVariances(data);
    const weights = this.normalizeWeights(variances);
    
    const sampled = [];
    let accumulator = 0;
    const threshold = 1 / targetSize;
    
    for (let i = 0; i < data.length; i++) {
      accumulator += weights[i];
      
      if (accumulator >= threshold) {
        sampled.push(data[i]);
        accumulator -= threshold;
      }
    }
    
    // Ensure we have exactly targetSize points
    while (sampled.length < targetSize && sampled.length < data.length) {
      const randomIndex = Math.floor(Math.random() * data.length);
      if (!sampled.includes(data[randomIndex])) {
        sampled.push(data[randomIndex]);
      }
    }
    
    return sampled.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }

  hasSignificantPeaks(data) {
    const values = data.map(d => d.value || d);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
    );
    
    // Check if we have values significantly far from mean
    return values.some(val => Math.abs(val - mean) > 2 * stdDev);
  }

  findPeaksAndValleys(data) {
    const peaks = [];
    
    for (let i = 1; i < data.length - 1; i++) {
      const prev = data[i - 1].value || data[i - 1];
      const curr = data[i].value || data[i];
      const next = data[i + 1].value || data[i + 1];
      
      // Peak
      if (curr > prev && curr > next) {
        peaks.push(i);
      }
      // Valley
      else if (curr < prev && curr < next) {
        peaks.push(i);
      }
    }
    
    return peaks;
  }

  calculateLocalVariances(data, windowSize = 5) {
    const variances = [];
    
    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - Math.floor(windowSize / 2));
      const end = Math.min(data.length, i + Math.ceil(windowSize / 2));
      const window = data.slice(start, end).map(d => d.value || d);
      
      const mean = window.reduce((a, b) => a + b, 0) / window.length;
      const variance = window.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / window.length;
      
      variances.push(variance);
    }
    
    return variances;
  }

  normalizeWeights(weights) {
    const sum = weights.reduce((a, b) => a + b, 0);
    return weights.map(w => w / sum);
  }
}

/**
 * Smart Cache for analytics results
 */
class SmartCache {
  constructor(maxSize = 100, ttl = 300000) { // 5 minutes default TTL
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.accessCounts = new Map();
  }

  get(key) {
    const item = this.cache.get(key);
    
    if (!item) return null;
    
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      this.accessCounts.delete(key);
      return null;
    }
    
    // Update access count
    this.accessCounts.set(key, (this.accessCounts.get(key) || 0) + 1);
    
    return item.value;
  }

  set(key, value) {
    // Evict if necessary
    if (this.cache.size >= this.maxSize) {
      this.evict();
    }
    
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
    
    this.accessCounts.set(key, 1);
  }

  evict() {
    // LFU (Least Frequently Used) with age consideration
    let minScore = Infinity;
    let keyToEvict = null;
    
    this.cache.forEach((item, key) => {
      const age = Date.now() - item.timestamp;
      const accessCount = this.accessCounts.get(key) || 1;
      const score = accessCount / (1 + age / 60000); // Access per minute
      
      if (score < minScore) {
        minScore = score;
        keyToEvict = key;
      }
    });
    
    if (keyToEvict) {
      this.cache.delete(keyToEvict);
      this.accessCounts.delete(keyToEvict);
    }
  }

  clear() {
    this.cache.clear();
    this.accessCounts.clear();
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ClientAnalytics;
}