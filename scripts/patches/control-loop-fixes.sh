#!/bin/bash
# Control Loop Fixes - Metric Name Alignment

# Fix metric names in control loop script to use underscores
sed -i 's/nrdot\.process\.series\.total/nrdot_process_series_total/g' /opt/nrdot/nrdot-control-loop.sh
sed -i 's/nrdot\.process\.series\.kept/nrdot_process_series_kept/g' /opt/nrdot/nrdot-control-loop.sh
sed -i 's/nrdot\.process\.coverage\.critical/nrdot_process_coverage_critical/g' /opt/nrdot/nrdot-control-loop.sh
sed -i 's/nrdot\.estimated\.cost\.per\.hour/nrdot_estimated_cost_per_hour/g' /opt/nrdot/nrdot-control-loop.sh
sed -i 's/nrdot\.cost\.estimated_hr/nrdot_cost_estimated_hr/g' /opt/nrdot/nrdot-control-loop.sh

# Add collector reload after profile change
cat >> /opt/nrdot/nrdot-control-loop.sh << 'EOF'

# Function to reload collector after profile change
reload_collector_on_change() {
    local new_profile="$1"
    local old_profile="$2"
    
    if [[ "$new_profile" != "$old_profile" ]]; then
        log "INFO" "Profile changed from $old_profile to $new_profile, reloading collector"
        
        # Update environment
        /usr/local/bin/manage-collector-env.sh sync
        
        # Send SIGHUP to collector for config reload
        if command -v pkill >/dev/null 2>&1; then
            pkill -HUP -f "nrdot-collector-host" || true
        else
            # Fallback to systemctl reload
            systemctl reload nrdot-collector-host.service || systemctl restart nrdot-collector-host.service
        fi
    fi
}
EOF

# Fix NR1 control loop to use correct mutation
sed -i 's/nerdStorageWriteDocument/nerdStorageWriteDocumentDocument/g' /opt/nrdot/nrdot-nr1-control-loop.sh

# Update NR1 JS to use underscore metric names
cat > /tmp/nr1-metric-fixes.js << 'EOF'
// Fix metric names in NR1 app
const metricNameMap = {
  'nrdot.process.series.total': 'nrdot_process_series_total',
  'nrdot.process.series.kept': 'nrdot_process_series_kept', 
  'nrdot.process.coverage.critical': 'nrdot_process_coverage_critical',
  'nrdot.estimated.cost.per.hour': 'nrdot_estimated_cost_per_hour',
  'nrdot.cost.estimated_hr': 'nrdot_cost_estimated_hr',
  'nrdot.anomaly.detected': 'nrdot_anomaly_detected',
  'nrdot.optimization_profile': 'nrdot_optimization_profile'
};

// Update NRQL queries
export function fixMetricName(metricName) {
  return metricNameMap[metricName] || metricName;
}
EOF