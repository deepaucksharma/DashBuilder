#!/usr/bin/env node

// Script to convert ProcessSample queries to Metric queries for OpenTelemetry

const processToMetricMappings = {
  // ProcessSample fields to Metric dimensions/attributes
  'processDisplayName': 'process.executable.name',
  'cpuPercent': 'process.cpu.utilization',
  'memoryResidentSizeBytes': 'process.memory.physical_usage',
  'memoryVirtualSizeBytes': 'process.memory.virtual_usage',
  'ioReadBytesPerSecond': 'process.disk.io.read',
  'ioWriteBytesPerSecond': 'process.disk.io.write',
  'threadCount': 'process.threads',
  'fileDescriptorCount': 'process.open_file_descriptors',
  'commandLine': 'process.command_line',
  'userName': 'process.owner',
  'processId': 'process.pid',
  'parentProcessId': 'process.parent_pid'
};

const exampleConversions = [
  {
    original: "SELECT uniqueCount(processDisplayName) FROM ProcessSample WHERE cpuPercent > 1 SINCE 1 hour ago",
    converted: "SELECT uniqueCount(dimensions.process.executable.name) FROM Metric WHERE metricName = 'process.cpu.utilization' AND value > 0.01 SINCE 1 hour ago"
  },
  {
    original: "SELECT average(cpuPercent) FROM ProcessSample FACET processDisplayName SINCE 5 minutes ago LIMIT 10",
    converted: "SELECT average(value) FROM Metric WHERE metricName = 'process.cpu.utilization' FACET dimensions.process.executable.name SINCE 5 minutes ago LIMIT 10"
  },
  {
    original: "SELECT average(memoryResidentSizeBytes/1024/1024) as 'Memory (MB)' FROM ProcessSample FACET processDisplayName SINCE 5 minutes ago",
    converted: "SELECT average(value/1024/1024) as 'Memory (MB)' FROM Metric WHERE metricName = 'process.memory.physical_usage' FACET dimensions.process.executable.name SINCE 5 minutes ago"
  },
  {
    original: "SELECT percentage(count(*), WHERE cpuPercent > 0.1) as 'Active %' FROM ProcessSample SINCE 1 hour ago",
    converted: "SELECT percentage(count(*), WHERE value > 0.001) as 'Active %' FROM Metric WHERE metricName = 'process.cpu.utilization' SINCE 1 hour ago"
  }
];

console.log("ProcessSample to Metric Query Conversion Guide");
console.log("=============================================\n");

console.log("Field Mappings:");
console.log("---------------");
Object.entries(processToMetricMappings).forEach(([old, newField]) => {
  console.log(`  ${old} → ${newField}`);
});

console.log("\nImportant Notes:");
console.log("----------------");
console.log("1. CPU percentages in ProcessSample (0-100) map to utilization ratios (0-1) in Metric");
console.log("2. Memory values remain in bytes");
console.log("3. Process names are now in dimensions.process.executable.name");
console.log("4. Add WHERE metricName = 'metric.name' to filter specific metrics");
console.log("5. Use 'value' field for metric values instead of specific field names");

console.log("\nExample Conversions:");
console.log("--------------------");
exampleConversions.forEach((example, index) => {
  console.log(`\n${index + 1}. Original ProcessSample query:`);
  console.log(`   ${example.original}`);
  console.log(`   Converted Metric query:`);
  console.log(`   ${example.converted}`);
});

console.log("\nCommon Query Patterns:");
console.log("----------------------");
console.log(`
// Top CPU consumers
FROM Metric 
SELECT average(value) as 'CPU %' 
WHERE metricName = 'process.cpu.utilization' 
FACET dimensions.process.executable.name 
SINCE 5 minutes ago 
LIMIT 10

// Memory usage by process
FROM Metric 
SELECT latest(value/1024/1024) as 'Memory MB' 
WHERE metricName = 'process.memory.physical_usage' 
FACET dimensions.process.executable.name 
SINCE 5 minutes ago 
LIMIT 20

// Process count
FROM Metric 
SELECT uniqueCount(dimensions.process.executable.name) as 'Unique Processes' 
WHERE metricName LIKE 'process.%' 
SINCE 1 hour ago

// Active processes (CPU > 1%)
FROM Metric 
SELECT uniqueCount(dimensions.process.executable.name) as 'Active Processes' 
WHERE metricName = 'process.cpu.utilization' AND value > 0.01 
SINCE 5 minutes ago
`);

// Files to update
const filesToUpdate = [
  'examples/nrdot-process-dashboard.json',
  'nrdot-nr1-app/lib/hooks/useRealTimeMetrics.js',
  'nrdot-nr1-app/nerdlets/overview/components/CostTileSet.js'
];

console.log("\nFiles that need updating:");
console.log("-------------------------");
filesToUpdate.forEach(file => {
  console.log(`  - ${file}`);
});

console.log("\nTo validate updated queries, use:");
console.log("  npm run cli -- nrql validate \"<your-query>\"");