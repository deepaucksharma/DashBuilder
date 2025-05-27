# NRDOT v2 OpenTelemetry Configurations

This directory contains production-ready OpenTelemetry Collector processor configurations that address the critical gaps in the NRDOT v2 implementation.

## Files

### Core Processors

1. **metricstransform-scoring.yaml**
   - Full OTTL-based process classification implementation
   - Assigns `process.importance` scores (0.0 - 1.0) based on process patterns
   - Covers all tiers: critical_system, database, web_server, application, monitoring, utility, noise
   - OS-aware classification (Linux/Windows specific patterns)
   - Sets `process.classification` attribute for each process

2. **metricstransform-ewma.yaml**
   - Basic EWMA (Exponentially Weighted Moving Average) implementation
   - Tracks CPU, memory, and IO metrics with anomaly detection
   - Sets `process.is_anomaly` flag based on deviation thresholds
   - Stores EWMA values and deviation percentages as attributes

3. **ewma-processor-advanced.yaml**
   - Advanced EWMA with ring-based experimentation support
   - Only applies EWMA to treatment rings (2, 3) for A/B testing
   - Multi-level anomaly detection (severe, high, medium, low, normal)
   - Adds experiment metadata to metrics
   - Calculates composite anomaly scores

4. **metricstransform-kpis-complete.yaml**
   - Comprehensive KPI metric generation
   - Pre-filter metrics: `nrdot_process_series_total`, series by tier, critical coverage
   - Post-filter metrics: `nrdot_process_series_kept`, kept by tier, anomaly count
   - Cost estimation with proper datapoint calculations
   - Derived metrics: reduction percentage, coverage percentage, anomaly rate

5. **processor-topk.yaml**
   - Conceptual Top-K series limiting implementation
   - Shows how to rank processes by composite score (importance × resource usage)
   - Demonstrates filtering strategies per host and per classification
   - Includes alternative approaches using sampling and probabilistic methods
   - Notes on production implementation requirements

## Integration

To use these configurations:

1. **Replace placeholder processors** in your collector config with these implementations
2. **Ensure proper ordering**:
   ```yaml
   processors:
     # 1. First: Resource detection and enrichment
     resourcedetection:
     attributes/base_enrichment:
     
     # 2. Process scoring (from metricstransform-scoring.yaml)
     metricstransform/scoring:
     
     # 3. EWMA calculations (optional, from metricstransform-ewma.yaml)
     metricstransform/ewma:
     
     # 4. Pre-filter KPIs (from metricstransform-kpis-complete.yaml)
     metricstransform/kpis_pre_filter:
     
     # 5. Optimization filtering
     filter/optimization:
     
     # 6. Post-filter KPIs (from metricstransform-kpis-complete.yaml)
     metricstransform/kpis_post_filter:
     
     # 7. Top-K limiting (optional, from processor-topk.yaml)
     filter/topk_enforcement:
     
     # 8. Cost calculations
     metricstransform/cost_advanced:
   ```

3. **Configure environment variables** properly using `manage-collector-env.sh`

4. **Generate noise patterns** using `generate-noise-patterns.sh`

## Key Improvements

1. **Real Process Scoring**: Replaces the placeholder "default 0.3" with actual pattern matching
2. **Proper EWMA**: Implements actual exponential smoothing instead of just scaling
3. **Complete KPIs**: Adds the missing `nrdot_process_series_kept` metric
4. **Experiment Support**: Enables ring-based A/B testing for EWMA feature
5. **Top-K Concepts**: Shows approaches for cardinality limiting (requires custom processor for full implementation)

## Production Considerations

- **Performance**: The OTTL statements are optimized but process scoring adds overhead
- **State Management**: EWMA requires the file_storage extension for persistence
- **Memory Usage**: Top-K limiting helps control memory but needs careful tuning
- **Monitoring**: Use the validation script to ensure all processors are working correctly

## Limitations

1. **EWMA State**: The cache-based approach shown is simplified; production needs proper state management
2. **Top-K Implementation**: Standard OTel lacks a true top-K processor; custom development needed
3. **Cross-Metric Calculations**: Some KPIs need correlation between metrics which is challenging in OTel
4. **Dynamic Reloading**: Not all changes can be applied without collector restart