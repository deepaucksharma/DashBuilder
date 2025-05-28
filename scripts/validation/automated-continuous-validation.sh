#!/bin/bash
# NRDOT v2 Automated Continuous Validation System
# Runs all checks automatically and maintains comprehensive logs

set -euo pipefail

# Configuration
LOG_DIR="/var/log/nrdot-validation"
STATE_DIR="/var/lib/nrdot-plus/validation"
REPORT_DIR="/var/www/dashboard/reports"
CHECK_INTERVAL=60  # Run checks every minute
DETAILED_CHECK_INTERVAL=300  # Run detailed checks every 5 minutes

# Create directories
mkdir -p "$LOG_DIR" "$STATE_DIR" "$REPORT_DIR"

# Log levels
LOG_LEVELS=(DEBUG INFO WARN ERROR CRITICAL)

# Initialize structured logging
init_logging() {
    # Create log files
    touch "$LOG_DIR/validation.log"
    touch "$LOG_DIR/metrics.log"
    touch "$LOG_DIR/health.log"
    touch "$LOG_DIR/alerts.log"
    touch "$LOG_DIR/audit.log"
    
    # Create JSON log structure
    cat > "$LOG_DIR/log-config.json" << EOF
{
    "version": "1.0",
    "log_files": {
        "validation": "$LOG_DIR/validation.log",
        "metrics": "$LOG_DIR/metrics.log",
        "health": "$LOG_DIR/health.log",
        "alerts": "$LOG_DIR/alerts.log",
        "audit": "$LOG_DIR/audit.log"
    },
    "rotation": {
        "max_size": "100MB",
        "max_files": 10,
        "compress": true
    }
}
EOF
}

# Structured logging function
log_event() {
    local level=$1
    local category=$2
    local message=$3
    local details=${4:-"{}"}
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
    local log_file="$LOG_DIR/${category}.log"
    
    # Create JSON log entry
    local log_entry=$(jq -n \
        --arg ts "$timestamp" \
        --arg lvl "$level" \
        --arg cat "$category" \
        --arg msg "$message" \
        --argjson details "$details" \
        '{
            timestamp: $ts,
            level: $lvl,
            category: $cat,
            message: $msg,
            details: $details,
            hostname: env.HOSTNAME,
            container_id: env.HOSTNAME
        }')
    
    # Write to appropriate log file
    echo "$log_entry" >> "$log_file"
    
    # Also write to main validation log
    echo "$log_entry" >> "$LOG_DIR/validation.log"
    
    # Send critical alerts to stderr
    if [ "$level" = "ERROR" ] || [ "$level" = "CRITICAL" ]; then
        echo "$log_entry" >&2
    fi
}

# Automated check functions
check_service_health() {
    local service=$1
    local url=$2
    local expected_status=${3:-200}
    
    log_event "DEBUG" "health" "Checking service health" "{\"service\": \"$service\", \"url\": \"$url\"}"
    
    local status_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" || echo "000")
    local success=false
    
    if [ "$status_code" = "$expected_status" ]; then
        success=true
        log_event "INFO" "health" "Service health check passed" \
            "{\"service\": \"$service\", \"status_code\": $status_code, \"success\": true}"
    else
        log_event "ERROR" "health" "Service health check failed" \
            "{\"service\": \"$service\", \"status_code\": $status_code, \"expected\": $expected_status, \"success\": false}"
    fi
    
    # Store result
    echo "$success" > "$STATE_DIR/${service}-health.state"
    return $([ "$success" = true ] && echo 0 || echo 1)
}

# Check data ingestion
check_data_ingestion() {
    log_event "INFO" "validation" "Starting data ingestion check" "{}"
    
    cd /app/scripts
    
    # Check for recent metrics
    local metric_check=$(node src/cli.js nrql validate \
        "SELECT count(*) as 'count' FROM Metric WHERE metricName IS NOT NULL SINCE 5 minutes ago" \
        2>&1 || echo "error")
    
    if echo "$metric_check" | grep -q "valid: true"; then
        # Extract count if possible
        local count=$(echo "$metric_check" | grep -oP "count.*?(\d+)" | grep -oP "\d+" || echo "0")
        log_event "INFO" "metrics" "Data ingestion check passed" \
            "{\"metric_count\": $count, \"status\": \"healthy\"}"
        echo "healthy" > "$STATE_DIR/data-ingestion.state"
        return 0
    else
        log_event "ERROR" "metrics" "Data ingestion check failed" \
            "{\"error\": \"No recent metrics found\", \"status\": \"unhealthy\"}"
        echo "unhealthy" > "$STATE_DIR/data-ingestion.state"
        return 1
    fi
}

# Check OpenTelemetry pipeline
check_otel_pipeline() {
    log_event "INFO" "validation" "Checking OpenTelemetry pipeline" "{}"
    
    # Check metrics endpoint
    local metrics=$(curl -s http://localhost:8888/metrics || echo "")
    
    if [ -n "$metrics" ]; then
        # Count metric lines
        local metric_count=$(echo "$metrics" | grep -c "^[a-zA-Z]" || echo "0")
        
        # Check for specific NRDOT metrics
        local has_nrdot_metrics=false
        if echo "$metrics" | grep -q "otelcol_receiver_accepted_metric_points"; then
            has_nrdot_metrics=true
        fi
        
        log_event "INFO" "metrics" "OpenTelemetry pipeline check" \
            "{\"metric_count\": $metric_count, \"has_nrdot_metrics\": $has_nrdot_metrics, \"status\": \"healthy\"}"
        
        # Extract key metrics
        local accepted_points=$(echo "$metrics" | grep "otelcol_receiver_accepted_metric_points" | awk '{print $2}' | head -1 || echo "0")
        local refused_points=$(echo "$metrics" | grep "otelcol_receiver_refused_metric_points" | awk '{print $2}' | head -1 || echo "0")
        
        # Store metrics
        echo "{\"accepted\": $accepted_points, \"refused\": $refused_points, \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"}" \
            > "$STATE_DIR/otel-metrics.json"
        
        return 0
    else
        log_event "ERROR" "metrics" "OpenTelemetry pipeline unavailable" "{\"status\": \"down\"}"
        return 1
    fi
}

# Check for known issues from NRDOT operational reality
check_known_issues() {
    log_event "INFO" "validation" "Checking for known NRDOT issues" "{}"
    
    local issues_found=()
    
    # 1. Check for filter processor CPU spike
    local cpu_usage=$(ps aux | grep otelcol-contrib | awk '{print $3}' | head -1 || echo "0")
    if (( $(echo "$cpu_usage > 80" | bc -l) )); then
        issues_found+=("high_cpu")
        log_event "WARN" "health" "High CPU usage detected" "{\"cpu_percent\": $cpu_usage, \"threshold\": 80}"
    fi
    
    # 2. Check for memory leak
    local memory_usage=$(ps aux | grep otelcol-contrib | awk '{print $6}' | head -1 || echo "0")
    if [ -f "$STATE_DIR/initial-memory.state" ]; then
        local initial_memory=$(cat "$STATE_DIR/initial-memory.state")
        if [ "$memory_usage" -gt $((initial_memory * 2)) ]; then
            issues_found+=("memory_leak")
            log_event "WARN" "health" "Potential memory leak detected" \
                "{\"current_memory_kb\": $memory_usage, \"initial_memory_kb\": $initial_memory}"
        fi
    else
        echo "$memory_usage" > "$STATE_DIR/initial-memory.state"
    fi
    
    # 3. Check for process discovery explosion
    local process_count=$(ps aux | wc -l)
    if [ "$process_count" -gt 1000 ]; then
        issues_found+=("process_explosion")
        log_event "WARN" "health" "High process count detected" "{\"process_count\": $process_count, \"threshold\": 1000}"
    fi
    
    # 4. Check for metric pipeline backup
    if [ -f "$STATE_DIR/otel-metrics.json" ]; then
        local refused_points=$(jq -r '.refused // 0' "$STATE_DIR/otel-metrics.json")
        if [ "$refused_points" -gt 0 ]; then
            issues_found+=("pipeline_backup")
            log_event "WARN" "metrics" "Metric pipeline backup detected" "{\"refused_points\": $refused_points}"
        fi
    fi
    
    # 5. Check for state persistence
    if [ ! -f "/var/lib/nrdot-plus/state/ring-assignments.json" ]; then
        issues_found+=("state_missing")
        log_event "ERROR" "validation" "State persistence file missing" "{\"file\": \"ring-assignments.json\"}"
    fi
    
    # Store issues summary
    printf '%s\n' "${issues_found[@]}" > "$STATE_DIR/known-issues.list"
    
    if [ ${#issues_found[@]} -eq 0 ]; then
        log_event "INFO" "validation" "No known issues detected" "{\"status\": \"clean\"}"
        return 0
    else
        log_event "WARN" "validation" "Known issues detected" "{\"issues\": $(printf '"%s",' "${issues_found[@]}" | sed 's/,$//')}"
        return 1
    fi
}

# Check dashboard functionality
check_dashboards() {
    log_event "INFO" "validation" "Checking dashboard functionality" "{}"
    
    cd /app/scripts
    
    if [ -f /tmp/dashboard-id.txt ]; then
        local dashboard_id=$(cat /tmp/dashboard-id.txt)
        
        # Validate dashboard widgets
        local validation_result=$(node src/cli.js dashboard validate-widgets "$dashboard_id" 2>&1 || echo "error")
        
        if echo "$validation_result" | grep -q "widgets"; then
            log_event "INFO" "validation" "Dashboard validation passed" "{\"dashboard_id\": \"$dashboard_id\", \"status\": \"valid\"}"
            return 0
        else
            log_event "ERROR" "validation" "Dashboard validation failed" "{\"dashboard_id\": \"$dashboard_id\", \"error\": \"validation failed\"}"
            return 1
        fi
    else
        log_event "WARN" "validation" "No dashboard ID found" "{\"status\": \"missing\"}"
        return 1
    fi
}

# Check control loop functionality
check_control_loop() {
    log_event "INFO" "validation" "Checking control loop functionality" "{}"
    
    # Check if control loop is running
    if pgrep -f "control-loop" > /dev/null; then
        # Check control loop config
        if [ -f /etc/nrdot-plus/control-loop.conf ]; then
            source /etc/nrdot-plus/control-loop.conf
            
            log_event "INFO" "validation" "Control loop check" \
                "{\"status\": \"running\", \"profile\": \"$PROFILE\", \"target_coverage\": $TARGET_COVERAGE, \"cost_reduction\": $COST_REDUCTION}"
            
            # Check for recent control loop activity
            if [ -f /var/log/nrdot-plus/control-loop.out.log ]; then
                local last_activity=$(tail -1 /var/log/nrdot-plus/control-loop.out.log | grep -oP '\d{4}-\d{2}-\d{2}' || echo "unknown")
                log_event "INFO" "validation" "Control loop last activity" "{\"date\": \"$last_activity\"}"
            fi
            
            return 0
        else
            log_event "ERROR" "validation" "Control loop config missing" "{\"status\": \"misconfigured\"}"
            return 1
        fi
    else
        log_event "ERROR" "validation" "Control loop not running" "{\"status\": \"down\"}"
        return 1
    fi
}

# Generate comprehensive validation report
generate_validation_report() {
    log_event "INFO" "validation" "Generating validation report" "{}"
    
    local report_file="$REPORT_DIR/validation-report-$(date +%Y%m%d-%H%M%S).json"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    # Collect all check results
    local checks=()
    
    # Service health checks
    for service in otel-collector api-server nginx; do
        local health_state="unknown"
        if [ -f "$STATE_DIR/${service}-health.state" ]; then
            health_state=$(cat "$STATE_DIR/${service}-health.state")
        fi
        checks+=("{\"name\": \"${service}-health\", \"status\": \"$health_state\"}")
    done
    
    # Data ingestion check
    local ingestion_state="unknown"
    if [ -f "$STATE_DIR/data-ingestion.state" ]; then
        ingestion_state=$(cat "$STATE_DIR/data-ingestion.state")
    fi
    checks+=("{\"name\": \"data-ingestion\", \"status\": \"$ingestion_state\"}")
    
    # Known issues
    local issues=()
    if [ -f "$STATE_DIR/known-issues.list" ]; then
        while IFS= read -r issue; do
            [ -n "$issue" ] && issues+=("\"$issue\"")
        done < "$STATE_DIR/known-issues.list"
    fi
    
    # Create report
    cat > "$report_file" << EOF
{
    "timestamp": "$timestamp",
    "version": "2.0",
    "status": "$([ ${#issues[@]} -eq 0 ] && echo "healthy" || echo "degraded")",
    "checks": [$(IFS=,; echo "${checks[*]}")],
    "known_issues": [$(IFS=,; echo "${issues[*]}")],
    "metrics": $([ -f "$STATE_DIR/otel-metrics.json" ] && cat "$STATE_DIR/otel-metrics.json" || echo "{}"),
    "uptime_seconds": $(cat /proc/uptime | cut -d' ' -f1),
    "container_id": "$HOSTNAME"
}
EOF
    
    # Create latest symlink
    ln -sf "$report_file" "$REPORT_DIR/latest-report.json"
    
    log_event "INFO" "validation" "Validation report generated" "{\"report_file\": \"$report_file\"}"
    
    # Also create HTML report for dashboard
    generate_html_report "$report_file"
}

# Generate HTML report
generate_html_report() {
    local json_report=$1
    local html_file="$REPORT_DIR/validation-report.html"
    
    cat > "$html_file" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>NRDOT Validation Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
        .header { background: #008c99; color: white; padding: 20px; margin: -20px -20px 20px; border-radius: 8px 8px 0 0; }
        .status { padding: 5px 10px; border-radius: 4px; display: inline-block; }
        .status.healthy { background: #4caf50; color: white; }
        .status.degraded { background: #ff9800; color: white; }
        .status.unhealthy { background: #f44336; color: white; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f0f0f0; }
        .issue { background: #fff3e0; padding: 10px; margin: 5px 0; border-radius: 4px; border-left: 4px solid #ff9800; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>NRDOT v2 Validation Report</h1>
            <p>Generated: <span id="timestamp"></span></p>
        </div>
        <div id="report-content"></div>
    </div>
    <script>
        fetch('/reports/latest-report.json')
            .then(r => r.json())
            .then(data => {
                document.getElementById('timestamp').textContent = new Date(data.timestamp).toLocaleString();
                
                let html = '<h2>Overall Status: <span class="status ' + data.status + '">' + data.status.toUpperCase() + '</span></h2>';
                
                html += '<h3>System Checks</h3><table><tr><th>Check</th><th>Status</th></tr>';
                data.checks.forEach(check => {
                    html += '<tr><td>' + check.name + '</td><td><span class="status ' + 
                            (check.status === 'true' || check.status === 'healthy' ? 'healthy' : 'unhealthy') + '">' + 
                            check.status + '</span></td></tr>';
                });
                html += '</table>';
                
                if (data.known_issues && data.known_issues.length > 0) {
                    html += '<h3>Known Issues</h3>';
                    data.known_issues.forEach(issue => {
                        html += '<div class="issue">' + issue.replace(/_/g, ' ').toUpperCase() + '</div>';
                    });
                }
                
                document.getElementById('report-content').innerHTML = html;
            });
    </script>
</body>
</html>
EOF
}

# Run all automated checks
run_all_checks() {
    log_event "INFO" "validation" "Starting automated validation cycle" "{\"interval\": $CHECK_INTERVAL}"
    
    local all_passed=true
    
    # Basic health checks
    check_service_health "otel-collector" "http://localhost:8888/metrics" || all_passed=false
    check_service_health "api-server" "http://localhost:3000/health" || all_passed=false
    check_service_health "nginx" "http://localhost/health" || all_passed=false
    
    # Data flow checks
    check_data_ingestion || all_passed=false
    check_otel_pipeline || all_passed=false
    
    # Issue detection
    check_known_issues || all_passed=false
    
    # Functionality checks
    check_control_loop || all_passed=false
    check_dashboards || all_passed=false
    
    # Generate report
    generate_validation_report
    
    if [ "$all_passed" = true ]; then
        log_event "INFO" "validation" "All automated checks passed" "{\"status\": \"success\"}"
    else
        log_event "WARN" "validation" "Some automated checks failed" "{\"status\": \"partial_failure\"}"
    fi
    
    return $([ "$all_passed" = true ] && echo 0 || echo 1)
}

# Alert on critical issues
send_alert() {
    local severity=$1
    local message=$2
    local details=$3
    
    log_event "$severity" "alerts" "$message" "$details"
    
    # Create alert file for UI
    local alert_file="$STATE_DIR/active-alerts.json"
    local alert_entry=$(jq -n \
        --arg sev "$severity" \
        --arg msg "$message" \
        --argjson details "$details" \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        '{severity: $sev, message: $msg, details: $details, timestamp: $ts}')
    
    if [ -f "$alert_file" ]; then
        jq ". += [$alert_entry]" "$alert_file" > "$alert_file.tmp" && mv "$alert_file.tmp" "$alert_file"
    else
        echo "[$alert_entry]" > "$alert_file"
    fi
    
    # For critical alerts, also write to console
    if [ "$severity" = "CRITICAL" ]; then
        echo "CRITICAL ALERT: $message" >&2
    fi
}

# Continuous monitoring loop
continuous_monitoring() {
    log_event "INFO" "validation" "Starting continuous monitoring" "{\"pid\": $$}"
    
    local cycle=0
    
    while true; do
        ((cycle++))
        
        log_event "DEBUG" "validation" "Starting validation cycle" "{\"cycle\": $cycle}"
        
        # Run all checks
        if run_all_checks; then
            log_event "INFO" "validation" "Validation cycle completed successfully" "{\"cycle\": $cycle}"
        else
            log_event "WARN" "validation" "Validation cycle completed with issues" "{\"cycle\": $cycle}"
            
            # Check if we need to send alerts
            if [ -f "$STATE_DIR/known-issues.list" ]; then
                local issue_count=$(wc -l < "$STATE_DIR/known-issues.list")
                if [ "$issue_count" -gt 3 ]; then
                    send_alert "CRITICAL" "Multiple issues detected" "{\"issue_count\": $issue_count}"
                fi
            fi
        fi
        
        # Run detailed checks every N cycles
        if [ $((cycle % ($DETAILED_CHECK_INTERVAL / $CHECK_INTERVAL))) -eq 0 ]; then
            log_event "INFO" "validation" "Running detailed validation" "{\"cycle\": $cycle}"
            
            # Additional detailed checks can be added here
            # For example: checking all process metrics, analyzing trends, etc.
        fi
        
        # Log rotation check
        if [ $((cycle % 60)) -eq 0 ]; then
            rotate_logs
        fi
        
        # Wait for next cycle
        sleep "$CHECK_INTERVAL"
    done
}

# Log rotation
rotate_logs() {
    log_event "INFO" "validation" "Rotating logs" "{}"
    
    for log_file in "$LOG_DIR"/*.log; do
        if [ -f "$log_file" ]; then
            local size=$(stat -f%z "$log_file" 2>/dev/null || stat -c%s "$log_file" 2>/dev/null || echo "0")
            if [ "$size" -gt 104857600 ]; then  # 100MB
                mv "$log_file" "$log_file.$(date +%Y%m%d-%H%M%S)"
                touch "$log_file"
                log_event "INFO" "validation" "Rotated log file" "{\"file\": \"$log_file\", \"size\": $size}"
            fi
        fi
    done
    
    # Clean up old logs
    find "$LOG_DIR" -name "*.log.*" -mtime +7 -delete
}

# Signal handlers
trap 'log_event "INFO" "validation" "Validation system shutting down" "{}"; exit 0' SIGTERM SIGINT

# Main execution
main() {
    # Initialize logging
    init_logging
    
    log_event "INFO" "validation" "Automated validation system starting" \
        "{\"version\": \"2.0\", \"check_interval\": $CHECK_INTERVAL, \"detailed_interval\": $DETAILED_CHECK_INTERVAL}"
    
    # Run initial checks
    run_all_checks
    
    # Start continuous monitoring
    continuous_monitoring
}

# Execute
main "$@"