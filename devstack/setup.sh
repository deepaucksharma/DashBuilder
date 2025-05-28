#!/bin/bash
#
# Master setup script for NRDOT and OpenStack environment
# Consolidates configuration, license key management, and environment setup

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Function: show_help
show_help() {
    echo -e "${BLUE}=== NRDOT & OpenStack Setup Tool ===${NC}"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  env              Load environment variables"
    echo "  license [KEY]    Update New Relic license key"
    echo "  verify           Verify setup and connectivity"
    echo "  openstack        Configure OpenStack environment"
    echo "  full             Run complete setup process"
    echo "  help             Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 env           # Load environment variables"
    echo "  $0 license NRAL-xxxx  # Update license key"
    echo "  $0 full          # Run complete setup"
}

# Function: load_environment
load_environment() {
    echo -e "${BLUE}Loading environment variables...${NC}"
    
    # Check if .env exists
    if [ ! -f .env ]; then
        echo -e "${YELLOW}No .env file found. Creating one...${NC}"
        cat > .env << EOF
NEW_RELIC_LICENSE_KEY=your_new_relic_license_key_here
ENVIRONMENT=development
EOF
    fi
    
    # Source the file
    source .env
    
    # Export variables
    export NEW_RELIC_LICENSE_KEY
    export ENVIRONMENT
    
    echo -e "${GREEN}Environment loaded successfully.${NC}"
    
    # Validate license key
    if [ "$NEW_RELIC_LICENSE_KEY" == "your_new_relic_license_key_here" ]; then
        echo -e "${YELLOW}Warning: Using default license key placeholder.${NC}"
        echo "Please update your license key with: $0 license YOUR_LICENSE_KEY"
    fi
}

# Function: update_license
update_license() {
    local license_key=$1
    
    if [ -z "$license_key" ]; then
        echo -e "${BLUE}=== New Relic License Key Update ===${NC}"
        echo ""
        echo "To get your license key:"
        echo "1. Log into New Relic: https://one.newrelic.com"
        echo "2. Go to: Administration > API Keys"
        echo "3. Find 'INGEST - LICENSE' key"
        echo "4. Copy the 40-character key ending in 'NRAL'"
        echo ""
        read -p "Enter your New Relic License Key: " license_key
    fi
    
    if [ -z "$license_key" ]; then
        echo -e "${RED}Error: No license key provided.${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}Updating license key...${NC}"
    
    # Validate key format
    if [[ $license_key == NRAK-* ]]; then
        echo -e "${RED}Error: You're using a User API Key (NRAK-).${NC}"
        echo -e "${RED}NRDOT requires a License Key that ends with 'NRAL'${NC}"
        exit 1
    elif [[ $license_key == *NRAL ]]; then
        echo -e "${GREEN}✓ License Key format is correct (ends with NRAL)${NC}"
    else
        echo -e "${RED}Error: Invalid key format. License Keys should end with 'NRAL'${NC}"
        exit 1
    fi
    
    # Update .env file
    if [ -f .env ]; then
        sed -i.bak "s/NEW_RELIC_LICENSE_KEY=.*/NEW_RELIC_LICENSE_KEY=${license_key}/" .env
        rm -f .env.bak
    else
        echo "NEW_RELIC_LICENSE_KEY=${license_key}" > .env
    fi
    
    # Test connectivity
    echo -e "${BLUE}Testing New Relic connectivity...${NC}"
    response=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Api-Key: $license_key" \
        -H "Content-Type: application/json" \
        https://otlp.nr-data.net/v1/traces \
        -d '{"resourceSpans":[]}' 2>&1)
        
    HTTP_CODE=$(echo "$response" | tail -1)
    if [ "$HTTP_CODE" = "400" ]; then
        echo -e "${GREEN}✓ Successfully connected to New Relic!${NC}"
    elif [ "$HTTP_CODE" = "403" ]; then
        echo -e "${RED}✗ Authentication failed - license key may be invalid${NC}"
        exit 1
    else
        echo -e "${YELLOW}⚠ Unexpected response: $HTTP_CODE${NC}"
    fi
    
    echo -e "${GREEN}License key updated successfully.${NC}"
}

# Function: verify_setup
verify_setup() {
    echo -e "${BLUE}Verifying setup...${NC}"
    
    # Check license key
    load_environment
    if [ -z "$NEW_RELIC_LICENSE_KEY" ] || [ "$NEW_RELIC_LICENSE_KEY" == "your_new_relic_license_key_here" ]; then
        echo -e "${RED}✗ License key not set properly${NC}"
        return 1
    else
        echo -e "${GREEN}✓ License key configured${NC}"
    fi
    
    # Check Docker
    if command -v docker >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Docker installed${NC}"
    else
        echo -e "${RED}✗ Docker not found${NC}"
        return 1
    fi
    
    # Check OpenStack CLI if available
    if command -v openstack >/dev/null 2>&1; then
        echo -e "${GREEN}✓ OpenStack CLI installed${NC}"
        
        # Try OpenStack authentication
        if openstack token issue >/dev/null 2>&1; then
            echo -e "${GREEN}✓ OpenStack authentication successful${NC}"
        else
            echo -e "${YELLOW}⚠ OpenStack authentication failed (credentials may not be sourced)${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ OpenStack CLI not found (optional)${NC}"
    fi
    
    # Check New Relic connectivity
    echo -e "${BLUE}Testing New Relic connectivity...${NC}"
    response=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Api-Key: $NEW_RELIC_LICENSE_KEY" \
        -H "Content-Type: application/json" \
        https://otlp.nr-data.net/v1/traces \
        -d '{"resourceSpans":[]}' 2>&1)
        
    HTTP_CODE=$(echo "$response" | tail -1)
    if [ "$HTTP_CODE" = "400" ]; then
        echo -e "${GREEN}✓ New Relic connectivity verified${NC}"
    elif [ "$HTTP_CODE" = "403" ]; then
        echo -e "${RED}✗ New Relic authentication failed${NC}"
        return 1
    else
        echo -e "${YELLOW}⚠ Unexpected response from New Relic: $HTTP_CODE${NC}"
    fi
    
    echo -e "${GREEN}Setup verification complete!${NC}"
    return 0
}

# Function: configure_openstack
configure_openstack() {
    echo -e "${BLUE}Configuring OpenStack environment...${NC}"
    
    # Get credentials
    read -p "Enter OpenStack auth URL [http://localhost:5000/v3]: " OS_AUTH_URL
    OS_AUTH_URL=${OS_AUTH_URL:-http://localhost:5000/v3}
    
    read -p "Enter username [admin]: " OS_USERNAME
    OS_USERNAME=${OS_USERNAME:-admin}
    
    read -p "Enter password [secret]: " OS_PASSWORD
    OS_PASSWORD=${OS_PASSWORD:-secret}
    
    read -p "Enter project name [admin]: " OS_PROJECT_NAME
    OS_PROJECT_NAME=${OS_PROJECT_NAME:-admin}
    
    read -p "Enter user domain [default]: " OS_USER_DOMAIN_NAME
    OS_USER_DOMAIN_NAME=${OS_USER_DOMAIN_NAME:-default}
    
    read -p "Enter project domain [default]: " OS_PROJECT_DOMAIN_NAME
    OS_PROJECT_DOMAIN_NAME=${OS_PROJECT_DOMAIN_NAME:-default}
    
    # Create openrc file
    cat > ./openrc << EOF
export OS_AUTH_URL=$OS_AUTH_URL
export OS_USERNAME=$OS_USERNAME
export OS_PASSWORD=$OS_PASSWORD
export OS_PROJECT_NAME=$OS_PROJECT_NAME
export OS_USER_DOMAIN_NAME=$OS_USER_DOMAIN_NAME
export OS_PROJECT_DOMAIN_NAME=$OS_PROJECT_DOMAIN_NAME
EOF
    
    echo -e "${GREEN}Created OpenStack RC file: ./openrc${NC}"
    echo "Source this file with: source ./openrc"
    
    # Test configuration
    source ./openrc
    if openstack token issue >/dev/null 2>&1; then
        echo -e "${GREEN}✓ OpenStack authentication successful${NC}"
    else
        echo -e "${RED}✗ OpenStack authentication failed${NC}"
    fi
}

# Function: run_full_setup
run_full_setup() {
    echo -e "${BLUE}=== Running Complete Setup ===${NC}"
    
    # Step 1: Load environment
    load_environment
    
    # Step 2: Verify or update license key if needed
    if [ "$NEW_RELIC_LICENSE_KEY" == "your_new_relic_license_key_here" ]; then
        read -p "Enter your New Relic License Key: " license_key
        update_license "$license_key"
    fi
    
    # Step 3: Configure OpenStack if needed
    if [ ! -f ./openrc ]; then
        configure_openstack
    else
        echo -e "${GREEN}✓ OpenStack configuration found${NC}"
        source ./openrc
    fi
    
    # Step 4: Final verification
    verify_setup
}

# Main execution
if [[ $# -eq 0 ]]; then
    show_help
    exit 0
fi

# Process commands
case "$1" in
    env)
        load_environment
        ;;
    license)
        update_license "$2"
        ;;
    verify)
        verify_setup
        ;;
    openstack)
        configure_openstack
        ;;
    full)
        run_full_setup
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        show_help
        exit 1
        ;;
esac
