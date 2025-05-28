#!/bin/bash
#
# Monitor OpenStack instances and display status

# Configuration
REFRESH_INTERVAL="${REFRESH_INTERVAL:-5}"
PROJECT_FILTER="${1:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Source credentials
if [ -f ~/openrc ]; then
    source ~/openrc
elif [ -f ./openrc ]; then
    source ./openrc
fi

clear

while true; do
    # Move cursor to top
    tput cup 0 0
    
    echo -e "${BLUE}=== OpenStack Instance Monitor ===${NC}"
    echo -e "Time: $(date)"
    echo -e "Filter: ${PROJECT_FILTER:-All instances}"
    echo ""
    
    # Get instances
    if [ -z "$PROJECT_FILTER" ]; then
        INSTANCES=$(openstack server list --all-projects -f json)
    else
        INSTANCES=$(openstack server list --name "*${PROJECT_FILTER}*" -f json)
    fi
    
    # Display header
    printf "%-30s %-10s %-15s %-40s %-10s\n" "Name" "Status" "Power State" "Networks" "Flavor"
    printf "%s\n" "$(printf '%.0s-' {1..110})"
    
    # Parse and display instances
    echo "$INSTANCES" | jq -r '.[] | [.Name, .Status, ."Power State", .Networks, .Flavor] | @tsv' | while IFS=$'\t' read -r name status power networks flavor; do
        # Color code based on status
        case "$status" in
            "ACTIVE")
                status_color=$GREEN
                ;;
            "ERROR")
                status_color=$RED
                ;;
            "BUILD"|"REBOOT"|"RESIZE")
                status_color=$YELLOW
                ;;
            *)
                status_color=$NC
                ;;
        esac
        
        # Truncate long values
        name=$(echo "$name" | cut -c1-30)
        networks=$(echo "$networks" | sed 's/=/: /g' | cut -c1-40)
        flavor=$(echo "$flavor" | cut -c1-10)
        
        printf "%-30s ${status_color}%-10s${NC} %-15s %-40s %-10s\n" "$name" "$status" "$power" "$networks" "$flavor"
    done
    
    echo ""
    echo -e "${BLUE}=== Resource Usage ===${NC}"
    
    # Show quota usage
    COMPUTE_QUOTA=$(openstack quota show -f json)
    INSTANCES_USED=$(echo "$COMPUTE_QUOTA" | jq -r '.instances // 0')
    CORES_USED=$(echo "$COMPUTE_QUOTA" | jq -r '.cores // 0')
    RAM_USED=$(echo "$COMPUTE_QUOTA" | jq -r '.ram // 0')
    
    echo "Instances: ${INSTANCES_USED}"
    echo "Cores: ${CORES_USED}"
    echo "RAM: ${RAM_USED} MB"
    
    echo ""
    echo -e "Press ${RED}Ctrl+C${NC} to exit | Refreshing every ${REFRESH_INTERVAL}s"
    
    sleep $REFRESH_INTERVAL
done