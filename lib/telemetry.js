/**
 * OpenTelemetry instrumentation for DashBuilder
 * Provides comprehensive tracing and metrics collection
 */

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-grpc');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { trace, metrics, DiagConsoleLogger, DiagLogLevel, diag } = require('@opentelemetry/api');

// New Relic specific
const newrelic = require('newrelic');

// Enable debug logging
if (process.env.OTEL_LOG_LEVEL === 'debug') {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
}

// Initialize telemetry
function initTelemetry(serviceName, serviceVersion = '2.0') {
  // Configure resource
  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    [SemanticResourceAttributes.SERVICE_VERSION]: serviceVersion,
    [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: process.env.HOSTNAME || 'local',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'production',
    'service.namespace': 'dashbuilder',
    'nrdot.enabled': 'true',
    'nrdot.profile': process.env.OPTIMIZATION_MODE || 'balanced'
  });

  // Configure trace exporter
  const traceExporter = new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
    headers: process.env.OTEL_EXPORTER_OTLP_HEADERS ? 
      { 'api-key': process.env.NEW_RELIC_LICENSE_KEY } : {}
  });

  // Configure metrics exporter
  const metricExporter = new OTLPMetricExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
    headers: process.env.OTEL_EXPORTER_OTLP_HEADERS ? 
      { 'api-key': process.env.NEW_RELIC_LICENSE_KEY } : {}
  });

  // Prometheus exporter for local metrics
  const prometheusExporter = new PrometheusExporter({
    port: 3000,
    endpoint: '/metrics'
  }, () => {
    console.log(`Prometheus metrics for ${serviceName} available at http://localhost:3000/metrics`);
  });

  // Configure SDK
  const sdk = new NodeSDK({
    resource,
    spanProcessor: new BatchSpanProcessor(traceExporter),
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 10000
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': {
          enabled: false // Disable fs instrumentation to reduce noise
        },
        '@opentelemetry/instrumentation-http': {
          requestHook: (span, request) => {
            span.setAttribute('http.request.body.size', request.headers['content-length'] || 0);
          },
          responseHook: (span, response) => {
            span.setAttribute('http.response.body.size', response.headers['content-length'] || 0);
          }
        },
        '@opentelemetry/instrumentation-express': {
          requestHook: (span, info) => {
            span.setAttribute('express.route', info.route);
            span.setAttribute('express.type', info.layerType);
          }
        }
      })
    ]
  });

  // Start SDK
  sdk.start();

  // Create meters
  const meter = metrics.getMeter(serviceName, serviceVersion);

  // Create common metrics
  const httpRequestDuration = meter.createHistogram('http.server.request.duration', {
    description: 'Duration of HTTP requests',
    unit: 'ms'
  });

  const httpRequestCount = meter.createCounter('http.server.request.count', {
    description: 'Total number of HTTP requests'
  });

  const activeRequests = meter.createUpDownCounter('http.server.active_requests', {
    description: 'Number of active HTTP requests'
  });

  // Process metrics
  const processMemory = meter.createObservableGauge('process.memory.usage', {
    description: 'Process memory usage',
    unit: 'bytes'
  });

  const processCpu = meter.createObservableGauge('process.cpu.usage', {
    description: 'Process CPU usage',
    unit: 'percent'
  });

  // Set up observable callbacks
  processMemory.addCallback((observableResult) => {
    const memUsage = process.memoryUsage();
    observableResult.observe(memUsage.rss, { type: 'rss' });
    observableResult.observe(memUsage.heapTotal, { type: 'heap_total' });
    observableResult.observe(memUsage.heapUsed, { type: 'heap_used' });
    observableResult.observe(memUsage.external, { type: 'external' });
  });

  let lastCpuUsage = process.cpuUsage();
  let lastTime = Date.now();

  processCpu.addCallback((observableResult) => {
    const currentCpuUsage = process.cpuUsage();
    const currentTime = Date.now();
    
    const userDiff = currentCpuUsage.user - lastCpuUsage.user;
    const systemDiff = currentCpuUsage.system - lastCpuUsage.system;
    const timeDiff = (currentTime - lastTime) * 1000; // Convert to microseconds
    
    const userPercent = (userDiff / timeDiff) * 100;
    const systemPercent = (systemDiff / timeDiff) * 100;
    
    observableResult.observe(userPercent, { type: 'user' });
    observableResult.observe(systemPercent, { type: 'system' });
    observableResult.observe(userPercent + systemPercent, { type: 'total' });
    
    lastCpuUsage = currentCpuUsage;
    lastTime = currentTime;
  });

  // Custom metrics for NRDOT
  const nrdotMetrics = {
    experimentCount: meter.createCounter('nrdot.experiments.count', {
      description: 'Number of NRDOT experiments run'
    }),
    optimizationScore: meter.createHistogram('nrdot.optimization.score', {
      description: 'NRDOT optimization effectiveness score',
      unit: 'score'
    }),
    costSavings: meter.createObservableGauge('nrdot.cost.savings', {
      description: 'Estimated cost savings percentage',
      unit: 'percent'
    }),
    datapointsReduced: meter.createObservableCounter('nrdot.datapoints.reduced', {
      description: 'Number of datapoints reduced'
    })
  };

  // Return instrumentation utilities
  return {
    sdk,
    tracer: trace.getTracer(serviceName, serviceVersion),
    meter,
    metrics: {
      httpRequestDuration,
      httpRequestCount,
      activeRequests,
      ...nrdotMetrics
    },
    prometheusExporter,
    
    // Helper middleware for Express
    expressMiddleware: (req, res, next) => {
      const startTime = Date.now();
      activeRequests.add(1);
      httpRequestCount.add(1, {
        method: req.method,
        route: req.route?.path || req.path
      });

      // Trace the request
      const span = trace.getActiveSpan();
      if (span) {
        span.setAttributes({
          'http.request.method': req.method,
          'http.request.path': req.path,
          'http.request.query': JSON.stringify(req.query),
          'user_agent': req.headers['user-agent'] || 'unknown'
        });
      }

      // Hook into response
      const originalEnd = res.end;
      res.end = function(...args) {
        const duration = Date.now() - startTime;
        activeRequests.add(-1);
        httpRequestDuration.record(duration, {
          method: req.method,
          route: req.route?.path || req.path,
          status_code: res.statusCode,
          status_class: `${Math.floor(res.statusCode / 100)}xx`
        });

        if (span) {
          span.setAttributes({
            'http.response.status_code': res.statusCode,
            'http.response.duration': duration
          });
        }

        // Call original end
        originalEnd.apply(res, args);
      };

      next();
    },

    // Helper for tracing async functions
    traceAsync: (name, fn, attributes = {}) => {
      return async (...args) => {
        const span = trace.getActiveSpan()?.tracer.startSpan(name) || 
                     trace.getTracer(serviceName).startSpan(name);
        
        try {
          span.setAttributes(attributes);
          const result = await fn(...args);
          span.setStatus({ code: 1 }); // OK
          return result;
        } catch (error) {
          span.recordException(error);
          span.setStatus({ code: 2, message: error.message }); // ERROR
          throw error;
        } finally {
          span.end();
        }
      };
    },

    // Helper for recording custom metrics
    recordMetric: (metricName, value, attributes = {}) => {
      if (nrdotMetrics[metricName]) {
        if (typeof nrdotMetrics[metricName].record === 'function') {
          nrdotMetrics[metricName].record(value, attributes);
        } else if (typeof nrdotMetrics[metricName].add === 'function') {
          nrdotMetrics[metricName].add(value, attributes);
        }
      }
    },

    // New Relic integration
    newrelic: {
      // Record custom event
      recordCustomEvent: (eventType, attributes) => {
        if (newrelic) {
          newrelic.recordCustomEvent(eventType, {
            ...attributes,
            serviceName,
            serviceVersion,
            timestamp: Date.now()
          });
        }
      },

      // Record metric
      recordMetric: (name, value) => {
        if (newrelic) {
          newrelic.recordMetric(name, value);
        }
      },

      // Add custom attributes to current transaction
      addCustomAttributes: (attributes) => {
        if (newrelic) {
          Object.entries(attributes).forEach(([key, value]) => {
            newrelic.addCustomAttribute(key, value);
          });
        }
      }
    },

    // Shutdown function
    shutdown: async () => {
      await sdk.shutdown();
      await prometheusExporter.shutdown();
    }
  };
}

// Export initialization function
module.exports = { initTelemetry };