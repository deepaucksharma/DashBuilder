#!/bin/bash
# /usr/local/bin/nrdot-nr1-control-loop.sh
# Enhanced control loop with NerdStorage integration

set -euo pipefail

# Configuration
readonly NERDSTORAGE_URL="${NERDSTORAGE_URL:-https://api.newrelic.com/graphql}"
readonly API_KEY="${NEW_RELIC_API_KEY}"
readonly ACCOUNT_ID="${NEW_RELIC_ACCOUNT_ID}"
readonly OPTIMIZATION_FILE="/etc/nrdot-collector-host/optimization.yaml"
readonly POLL_INTERVAL=15
readonly LOG_FILE="/var/log/nrdot/nr1-control-loop.log"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date -u '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# Function to fetch control state from NerdStorage
fetch_control_state() {
    local query='
    query GetControlState($accountId: Int!) {
      actor {
        account(id: $accountId) {
          nerdStorage {
            collection(collection: "nrdot-control") {
              document(documentId: "active")
            }
          }
        }
      }
    }'
    
    local response
    response=$(curl -s -X POST "$NERDSTORAGE_URL" \
        -H "Content-Type: application/json" \
        -H "API-Key: $API_KEY" \
        -d @- <<EOF
{
    "query": $(echo "$query" | jq -Rs .),
    "variables": {
        "accountId": $ACCOUNT_ID
    }
}
EOF
    )
    
    echo "$response" | jq -r '.data.actor.account.nerdStorage.collection.document // "{}"'
}

# Function to apply profile change
apply_profile() {
    local profile=$1
    local timestamp=$2
    
    log "Applying profile change: $profile (timestamp: $timestamp)"
    
    # Update optimization.yaml
    yq eval -i ".state.active_profile = \"$profile\"" "$OPTIMIZATION_FILE"
    yq eval -i ".state.last_updated = \"$(date -u '+%Y-%m-%dT%H:%M:%SZ')\"" "$OPTIMIZATION_FILE"
    yq eval -i ".state.updated_by = \"nr1-control-loop\"" "$OPTIMIZATION_FILE"
    yq eval -i ".state.update_source = \"nerdstorage\"" "$OPTIMIZATION_FILE"
    yq eval -i ".state.update_timestamp = $timestamp" "$OPTIMIZATION_FILE"
    
    # Trigger collector reload by touching the file
    touch "$OPTIMIZATION_FILE"
    
    log "Profile applied successfully"
}

# Function to handle bulk operations
handle_bulk_operation() {
    local operation=$1
    local targets=$2
    local profile=$3
    
    log "Handling bulk operation: $operation for $(echo "$targets" | jq -r '. | length') hosts"
    
    # Check if this host is in the target list
    local hostname=$(hostname)
    local is_target=$(echo "$targets" | jq -r --arg h "$hostname" '. | map(select(. == $h)) | length > 0')
    
    if [[ "$is_target" == "true" ]]; then
        apply_profile "$profile" "$(date +%s)000"
    fi
}

# Main control loop
main() {
    log "NR1 Control Loop starting (PID: $$)"
    
    local last_timestamp=0
    
    while true; do
        # Fetch current control state
        local control_state
        control_state=$(fetch_control_state)
        
        if [[ -z "$control_state" || "$control_state" == "{}" ]]; then
            log "No control state found, skipping..."
            sleep "$POLL_INTERVAL"
            continue
        fi
        
        # Parse control state
        local action=$(echo "$control_state" | jq -r '.action // ""')
        local value=$(echo "$control_state" | jq -r '.value // ""')
        local timestamp=$(echo "$control_state" | jq -r '.timestamp // 0')
        
        # Check if this is a new command
        if [[ $timestamp -gt $last_timestamp ]]; then
            case "$action" in
                "setProfile")
                    if [[ -n "$value" ]]; then
                        apply_profile "$value" "$timestamp"
                        last_timestamp=$timestamp
                    fi
                    ;;
                    
                "bulkSetProfile")
                    local targets=$(echo "$control_state" | jq -r '.targets // []')
                    local profile=$(echo "$control_state" | jq -r '.profile // ""')
                    if [[ -n "$profile" ]]; then
                        handle_bulk_operation "$action" "$targets" "$profile"
                        last_timestamp=$timestamp
                    fi
                    ;;
                    
                *)
                    log "Unknown action: $action"
                    ;;
            esac
        fi
        
        sleep "$POLL_INTERVAL"
    done
}

# Signal handling
trap 'log "Shutting down..."; exit 0' TERM INT

# Start the control loop
main "$@"