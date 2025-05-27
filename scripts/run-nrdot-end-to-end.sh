#!/bin/bash
# NRDOT v2 End-to-End Implementation Guide
# Complete setup and operational lifecycle

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

echo -e "${PURPLE}================================${NC}"
echo -e "${PURPLE}NRDOT v2 End-to-End Implementation${NC}"
echo -e "${PURPLE}================================${NC}"
echo

# Function to print section headers
section() {
    echo
    echo -e "${BLUE}━━━ $1 ━━━${NC}"
    echo
}

# Function to print steps
step() {
    echo -e "${GREEN}→${NC} $1"
}

# Function to print commands
cmd() {
    echo -e "${YELLOW}\$ $1${NC}"
}

# Function to print important notes
note() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Function to print success
success() {
    echo -e "${GREEN}✓ $1${NC}"
}

section "PRE-FLIGHT CHECKS"

step "1. Verify you have root/sudo access"
cmd "sudo -v"

step "2. Set your New Relic credentials"
cmd "export NEW_RELIC_API_KEY='YOUR_API_KEY_HERE'"
cmd "export NEW_RELIC_ACCOUNT_ID='YOUR_ACCOUNT_ID'"
cmd "export NEW_RELIC_OTLP_ENDPOINT='https://otlp.nr-data.net:4317'"

step "3. Clone/navigate to the DashBuilder repository"
cmd "cd /home/deepak/DashBuilder"

section "DAY 0: INITIAL SETUP"

step "1. Run the comprehensive setup script"
cmd "sudo ./scripts/setup-nrdot-v2.sh setup"
note "This will install dependencies, create directories, and deploy configurations"

step "2. Apply the audit fixes to optimization.yaml"
cmd "sudo bash ./scripts/patches/optimization-yaml-fixes.patch"

step "3. Deploy the fixed collector configuration"
cmd "sudo cp ./scripts/otel-configs/fixed-collector-config.yaml /etc/nrdot-collector-host/config.yaml"

step "4. Generate noise patterns"
cmd "sudo /usr/local/bin/generate-noise-patterns.sh"

step "5. Initialize collector environment"
cmd "sudo /usr/local/bin/manage-collector-env.sh init"

step "6. Install OpenTelemetry Collector"
note "Download the appropriate collector for your platform"
cmd "# For Linux x86_64:"
cmd "curl -L https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.91.0/otelcol_0.91.0_linux_amd64.tar.gz -o otelcol.tar.gz"
cmd "sudo tar -xzf otelcol.tar.gz -C /usr/local/bin/"
cmd "sudo mv /usr/local/bin/otelcol /usr/local/bin/nrdot-collector-host"

step "7. Create systemd service for collector"
cat << 'EOF'
sudo tee /etc/systemd/system/nrdot-collector-host.service << 'SERVICE'
[Unit]
Description=NRDOT OpenTelemetry Collector
After=network.target

[Service]
Type=simple
User=nrdot
Group=nrdot
EnvironmentFile=/var/lib/nrdot/collector.env
ExecStart=/usr/local/bin/nrdot-collector-host --config=/etc/nrdot-collector-host/config.yaml
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE
EOF

step "8. Start the collector"
cmd "sudo systemctl daemon-reload"
cmd "sudo systemctl enable nrdot-collector-host.service"
cmd "sudo systemctl start nrdot-collector-host.service"

step "9. Verify collector is running"
cmd "sudo systemctl status nrdot-collector-host.service"
cmd "curl -s http://localhost:8887/metrics | grep nrdot_"

section "DAY 0: DEPLOY NR1 APP"

step "1. Configure NR1 app deployment"
cmd "cd nrdot-nr1-app"
cmd "npm install"

step "2. Update package.json with your account ID"
note "Edit nr1.json and update the account ID"

step "3. Deploy the app"
cmd "nr1 app:publish"
cmd "nr1 app:subscribe --account-id=$NEW_RELIC_ACCOUNT_ID"

step "4. Create profile change log stream"
cat << 'EOF'
# Create a log ingestion rule in New Relic to capture profile changes
# This enables the UI to show profile change history
EOF

section "DAY 0: VALIDATION"

step "1. Run the validation script"
cmd "sudo ./scripts/validate-nrdot-deployment.sh"

step "2. Check metrics in New Relic"
echo "Run this NRQL query in New Relic:"
cmd "FROM Metric SELECT latest(nrdot_process_series_total) FACET host.name"

step "3. Access the NR1 app"
echo "Navigate to: Apps > NRDOT Host Process Optimization"

section "DAY 1: ENABLE OPTIMIZATION"

step "1. Configure control loop API keys"
cmd "sudo cp ./scripts/systemd/nrdot-nr1-control-loop.env /etc/nrdot/nr1-control-loop.env"
cmd "sudo vim /etc/nrdot/nr1-control-loop.env  # Add your API keys"

step "2. Apply control loop fixes"
cmd "sudo bash ./scripts/patches/control-loop-fixes.sh"

step "3. Enable the UI-driven control loop"
cmd "sudo systemctl enable nrdot-nr1-control-loop.service"
cmd "sudo systemctl start nrdot-nr1-control-loop.service"

step "4. Switch to balanced profile"
cmd "sudo /usr/local/bin/manage-collector-env.sh set NRDOT_PROFILE balanced"
cmd "sudo yq eval -i '.state.active_profile = \"balanced\"' /etc/nrdot-collector-host/optimization.yaml"
cmd "sudo /usr/local/bin/manage-collector-env.sh sync"

step "5. Monitor the changes"
echo "In New Relic, run:"
cmd "FROM Metric SELECT latest(nrdot_process_series_total), latest(nrdot_process_series_kept) FACET host.name"

section "DAY 2: STABILIZATION & TUNING"

step "1. Review KPI metrics"
echo "Key metrics to monitor:"
echo "  - nrdot_process_series_total vs nrdot_process_series_kept"
echo "  - nrdot_process_coverage_critical (should be >95%)"
echo "  - nrdot_cost_estimated_hr (should show reduction)"
echo "  - nrdot_anomaly_detected (if anomaly detection enabled)"

step "2. Fine-tune process classification"
note "Review processes that might be misclassified"
cmd "# Check unknown processes"
cmd "FROM Metric SELECT count(*) WHERE process.classification = 'unknown' FACET process.executable.name"

step "3. Adjust thresholds if needed"
cmd "sudo vim /etc/nrdot-collector-host/optimization.yaml"
cmd "# Adjust cpu_threshold_seconds, memory_threshold_mb, etc."
cmd "sudo /usr/local/bin/manage-collector-env.sh sync"

step "4. Enable experiments (optional)"
echo "To enable EWMA anomaly detection on rings 2-3:"
cmd "sudo yq eval -i '.experiments[0].enabled = true' /etc/nrdot-collector-host/optimization.yaml"

section "MONITORING & TROUBLESHOOTING"

step "Common issues and solutions:"

echo -e "\n${YELLOW}Issue:${NC} Collector not starting"
echo "  Check: sudo journalctl -u nrdot-collector-host -n 50"
echo "  Fix: Verify config syntax, check permissions"

echo -e "\n${YELLOW}Issue:${NC} No metrics in New Relic"
echo "  Check: curl http://localhost:8887/metrics"
echo "  Fix: Verify NEW_RELIC_API_KEY is set correctly"

echo -e "\n${YELLOW}Issue:${NC} Profile changes not taking effect"
echo "  Check: sudo journalctl -u nrdot-nr1-control-loop -n 20"
echo "  Fix: Ensure control loop can write to optimization.yaml"

echo -e "\n${YELLOW}Issue:${NC} High memory usage"
echo "  Check: sudo systemctl show -p MemoryCurrent nrdot-collector-host"
echo "  Fix: Lower memory_limiter values in config.yaml"

section "EXPECTED OUTCOMES"

success "After Day 0:"
echo "  • Basic metrics flowing to New Relic"
echo "  • ~5000-10000 series per host (unfiltered)"
echo "  • NR1 app showing connectivity"

success "After Day 1:"
echo "  • Series reduced by 50-70%"
echo "  • Critical process coverage maintained at 95%+"
echo "  • Cost estimates showing reduction"

success "After Day 2:"
echo "  • Stable optimization with <1.5% CPU overhead"
echo "  • ~72% series reduction achieved"
echo "  • Anomaly detection (if enabled) identifying outliers"

section "NEXT STEPS"

echo "1. Monitor the system for 24-48 hours"
echo "2. Review process classifications and adjust as needed"
echo "3. Consider enabling aggressive profile for maximum savings"
echo "4. Set up alerts for critical coverage drops"
echo "5. Plan rollout to additional hosts"

echo
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}NRDOT v2 implementation guide complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"