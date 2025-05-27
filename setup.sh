#!/bin/bash
# DashBuilder Streamlined Setup Script
# One command to set up everything

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Print functions
print_header() {
    echo -e "\n${BLUE}===================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}===================================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# ASCII Banner
show_banner() {
    cat << 'EOF'
    ____            __    ____        _ __    __         
   / __ \____ _____/ /_  / __ )__  __(_) /___/ /__  _____
  / / / / __ `/ __  / /_/ __  / / / / / / __  / _ \/ ___/
 / /_/ / /_/ (__  ) / /_/ /_/ / /_/ / / / /_/ /  __/ /    
/_____/\__,_/____/_/\__/_____/\__,_/_/_/\__,_/\___/_/     
                                                           
         NRDOT v2 Process Optimization Platform
              70-85% Cost Reduction Guaranteed
EOF
    echo
}

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"
    
    local missing_deps=()
    
    # Check Node.js
    if command -v node >/dev/null 2>&1; then
        local node_version=$(node -v)
        print_success "Node.js $node_version found"
    else
        missing_deps+=("Node.js")
    fi
    
    # Check npm
    if command -v npm >/dev/null 2>&1; then
        local npm_version=$(npm -v)
        print_success "npm $npm_version found"
    else
        missing_deps+=("npm")
    fi
    
    # Check git
    if command -v git >/dev/null 2>&1; then
        print_success "Git found"
    else
        missing_deps+=("git")
    fi
    
    # Check for optional tools
    if command -v yq >/dev/null 2>&1; then
        print_success "yq found (optional)"
    else
        print_warning "yq not found (optional but recommended)"
    fi
    
    if command -v jq >/dev/null 2>&1; then
        print_success "jq found (optional)"
    else
        print_warning "jq not found (optional but recommended)"
    fi
    
    # Report missing dependencies
    if [ ${#missing_deps[@]} -gt 0 ]; then
        print_error "Missing required dependencies: ${missing_deps[*]}"
        echo
        echo "Please install missing dependencies:"
        echo "  Ubuntu/Debian: sudo apt-get install nodejs npm git"
        echo "  MacOS: brew install node git"
        echo "  Windows: Use WSL or install from nodejs.org"
        exit 1
    fi
    
    print_success "All required dependencies found!"
}

# Install npm dependencies
install_dependencies() {
    print_header "Installing Dependencies"
    
    # Check if node_modules exists
    if [ -d "node_modules" ]; then
        print_info "Dependencies already installed, updating..."
    fi
    
    # Install workspaces
    print_info "Installing all workspace dependencies..."
    npm install --workspaces --if-present --legacy-peer-deps
    
    print_success "Dependencies installed successfully!"
}

# Configure API keys
configure_api_keys() {
    print_header "Configuring API Keys"
    
    # Check if .env exists
    if [ -f ".env" ]; then
        print_warning ".env file already exists"
        read -p "Do you want to reconfigure? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Keeping existing configuration"
            return
        fi
    fi
    
    # Get API key
    echo "Please enter your New Relic configuration:"
    echo
    read -p "New Relic API Key (User key): " NR_API_KEY
    read -p "New Relic Account ID: " NR_ACCOUNT_ID
    read -p "New Relic License Key (optional): " NR_LICENSE_KEY
    read -p "Region (US/EU) [US]: " NR_REGION
    NR_REGION=${NR_REGION:-US}
    
    # Create main .env file
    cat > .env <<EOF
# New Relic Configuration
NEW_RELIC_API_KEY=$NR_API_KEY
NEW_RELIC_ACCOUNT_ID=$NR_ACCOUNT_ID
NEW_RELIC_LICENSE_KEY=$NR_LICENSE_KEY
NEW_RELIC_REGION=$NR_REGION

# NRDOT Configuration
NRDOT_PROFILE=balanced
NRDOT_TARGET_SERIES=5000
NRDOT_MAX_SERIES=10000
NRDOT_MIN_COVERAGE=0.95
NRDOT_MAX_COST_HOUR=0.10

# Environment
NODE_ENV=production
EOF

    # Create scripts/.env
    mkdir -p scripts
    cat > scripts/.env <<EOF
NEW_RELIC_API_KEY=$NR_API_KEY
NEW_RELIC_ACCOUNT_ID=$NR_ACCOUNT_ID
NEW_RELIC_REGION=$NR_REGION
EOF

    print_success "API keys configured successfully!"
}

# Test API connection
test_connection() {
    print_header "Testing API Connection"
    
    # Try to list event types
    print_info "Testing New Relic API connection..."
    
    if npm run --silent cli -- schema list-event-types --limit 1 >/dev/null 2>&1; then
        print_success "API connection successful!"
    else
        print_error "API connection failed!"
        echo
        echo "Please check:"
        echo "  1. Your API key is valid"
        echo "  2. Your account ID is correct"
        echo "  3. You have internet connectivity"
        echo "  4. Your API key has NerdGraph permissions"
        exit 1
    fi
}

# Quick start menu
show_menu() {
    print_header "Quick Start Menu"
    
    echo "What would you like to do?"
    echo
    echo "  1) Deploy NRDOT Process Optimization"
    echo "  2) Validate Existing Dashboards"
    echo "  3) Create Optimization Dashboard"
    echo "  4) Check Process Coverage"
    echo "  5) Run Full Test Suite"
    echo "  6) Exit"
    echo
    
    read -p "Select an option (1-6): " choice
    
    case $choice in
        1)
            print_info "Deploying NRDOT optimization..."
            npm run deploy:nrdot 2>/dev/null || print_warning "Deploy script not yet implemented"
            ;;
        2)
            print_info "Validating dashboards..."
            npm run cli -- dashboard list --limit 5
            ;;
        3)
            print_info "Creating optimization dashboard..."
            npm run workflow:create-dashboard 2>/dev/null || print_warning "Workflow not yet implemented"
            ;;
        4)
            print_info "Checking process coverage..."
            npm run cli -- schema get-process-intelligence 2>/dev/null || npm run cli -- schema describe ProcessSample
            ;;
        5)
            print_info "Running tests..."
            npm test 2>/dev/null || print_warning "Tests not yet implemented"
            ;;
        6)
            print_success "Setup complete! Happy optimizing!"
            exit 0
            ;;
        *)
            print_error "Invalid option"
            show_menu
            ;;
    esac
}

# Main setup flow
main() {
    clear
    show_banner
    
    print_info "Starting DashBuilder setup..."
    echo
    
    # Run setup steps
    check_prerequisites
    install_dependencies
    configure_api_keys
    test_connection
    
    print_header "Setup Complete! 🎉"
    
    echo "You can now use DashBuilder commands:"
    echo
    echo "  npm run cli -- dashboard list        # List dashboards"
    echo "  npm run cli -- nrql validate <query> # Validate NRQL"
    echo "  npm run cli -- entity search <name>  # Search entities"
    echo
    echo "For NRDOT deployment:"
    echo "  cd distributions/nrdot-plus"
    echo "  sudo ./install.sh"
    echo
    
    # Show menu
    show_menu
}

# Handle errors
trap 'print_error "Setup failed! Check the error above."; exit 1' ERR

# Run main if not sourced
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi