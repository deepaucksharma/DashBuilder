#!/bin/bash

# NRDOT Experiment Runner
# Easy-to-use script for running NRDOT configuration experiments

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
EXPERIMENT_PROFILE="cost-optimization-basic"
DURATION=""
SKIP_SETUP=false
SKIP_CLEANUP=false

# Function to print colored output
print_color() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to check prerequisites
check_prerequisites() {
    print_color $BLUE "🔍 Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_color $RED "❌ Docker is not installed"
        exit 1
    fi
    
    # Check Docker daemon
    if ! docker info &> /dev/null; then
        print_color $RED "❌ Docker daemon is not running"
        exit 1
    fi
    
    # Check environment variables
    if [ -z "$NEW_RELIC_API_KEY" ] || [ -z "$NEW_RELIC_ACCOUNT_ID" ]; then
        print_color $RED "❌ Missing required environment variables:"
        print_color $RED "   - NEW_RELIC_API_KEY"
        print_color $RED "   - NEW_RELIC_ACCOUNT_ID"
        echo ""
        print_color $YELLOW "💡 Set them in .env file or export them:"
        echo "   export NEW_RELIC_API_KEY=your_key_here"
        echo "   export NEW_RELIC_ACCOUNT_ID=your_account_id"
        exit 1
    fi
    
    # Check if npm packages are installed
    if [ ! -d "node_modules" ]; then
        print_color $YELLOW "📦 Installing dependencies..."
        npm run install:all
    fi
    
    print_color $GREEN "✅ Prerequisites check passed"
    echo ""
}

# Function to build Docker images
build_images() {
    if [ "$SKIP_SETUP" = true ]; then
        return
    fi
    
    print_color $BLUE "🔨 Building Docker images..."
    
    # Build base NRDOT image
    docker build -t dashbuilder-nrdot:latest . || {
        print_color $RED "❌ Failed to build NRDOT image"
        exit 1
    }
    
    # Build NRDOT Plus image if needed
    if [ -d "distributions/nrdot-plus" ]; then
        docker build -t dashbuilder-nrdot-plus:latest -f distributions/nrdot-plus/Dockerfile.otel distributions/nrdot-plus || {
            print_color $YELLOW "⚠️  Failed to build NRDOT Plus image (continuing anyway)"
        }
    fi
    
    print_color $GREEN "✅ Docker images built successfully"
    echo ""
}

# Function to show experiment menu
show_menu() {
    print_color $BLUE "📋 Available Experiment Profiles:"
    echo ""
    
    # List available profiles
    local profiles=(experiments/profiles/*.yaml)
    local i=1
    
    for profile in "${profiles[@]}"; do
        local name=$(basename "$profile" .yaml)
        local desc=$(grep "description:" "$profile" | head -1 | cut -d'"' -f2)
        echo "  $i) $name"
        echo "     $desc"
        echo ""
        ((i++))
    done
    
    echo "  q) Quit"
    echo ""
    
    read -p "Select experiment profile (1-$((i-1)) or profile name): " choice
    
    if [ "$choice" = "q" ]; then
        exit 0
    elif [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -lt "$i" ]; then
        EXPERIMENT_PROFILE=$(basename "${profiles[$((choice-1))]}" .yaml)
    else
        EXPERIMENT_PROFILE="$choice"
    fi
}

# Function to run the experiment
run_experiment() {
    print_color $BLUE "🧪 Running Experiment: $EXPERIMENT_PROFILE"
    echo ""
    
    # Build command
    local cmd="npm run experiment:run $EXPERIMENT_PROFILE"
    
    if [ -n "$DURATION" ]; then
        cmd="$cmd -- --duration $DURATION"
    fi
    
    # Run experiment
    $cmd || {
        print_color $RED "❌ Experiment failed"
        cleanup_on_error
        exit 1
    }
}

# Function to show results
show_results() {
    print_color $BLUE "📊 Experiment Results"
    echo ""
    
    # Get latest experiment ID
    local latest_exp=$(ls -t experiment-results/ 2>/dev/null | head -1)
    
    if [ -z "$latest_exp" ]; then
        print_color $YELLOW "No results found"
        return
    fi
    
    # Show summary
    npm run experiment:results "$latest_exp"
    
    echo ""
    print_color $GREEN "✅ Full results saved to: experiment-results/$latest_exp/"
    
    # Ask if user wants to open report
    read -p "Open detailed report in browser? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        local report_file="experiment-results/$latest_exp/report.md"
        if [ -f "$report_file" ]; then
            # Convert markdown to HTML and open
            if command -v pandoc &> /dev/null; then
                pandoc "$report_file" -o "/tmp/nrdot-report.html"
                open "/tmp/nrdot-report.html" 2>/dev/null || xdg-open "/tmp/nrdot-report.html" 2>/dev/null
            else
                # Just open markdown file
                open "$report_file" 2>/dev/null || xdg-open "$report_file" 2>/dev/null
            fi
        fi
    fi
}

# Function to cleanup on error
cleanup_on_error() {
    if [ "$SKIP_CLEANUP" = true ]; then
        return
    fi
    
    print_color $YELLOW "🧹 Cleaning up..."
    docker stop $(docker ps -q --filter "name=exp-") 2>/dev/null || true
    docker rm $(docker ps -aq --filter "name=exp-") 2>/dev/null || true
}

# Function to show usage
usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  -p, --profile <name>    Experiment profile to run (default: cost-optimization-basic)"
    echo "  -d, --duration <min>    Override test duration in minutes"
    echo "  -s, --skip-setup        Skip Docker image building"
    echo "  -c, --skip-cleanup      Skip cleanup on error"
    echo "  -h, --help             Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                     # Interactive mode"
    echo "  $0 -p scale-test       # Run scale test profile"
    echo "  $0 -p basic -d 5       # Run basic profile for 5 minutes"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--profile)
            EXPERIMENT_PROFILE="$2"
            shift 2
            ;;
        -d|--duration)
            DURATION="$2"
            shift 2
            ;;
        -s|--skip-setup)
            SKIP_SETUP=true
            shift
            ;;
        -c|--skip-cleanup)
            SKIP_CLEANUP=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            print_color $RED "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Main execution
main() {
    clear
    print_color $BLUE "======================================"
    print_color $BLUE "     NRDOT Experiment Runner"
    print_color $BLUE "======================================"
    echo ""
    
    # Check prerequisites
    check_prerequisites
    
    # Build images if needed
    build_images
    
    # Show menu if no profile specified
    if [ "$EXPERIMENT_PROFILE" = "cost-optimization-basic" ] && [ -t 0 ]; then
        show_menu
    fi
    
    # Validate profile exists
    if [ ! -f "experiments/profiles/$EXPERIMENT_PROFILE.yaml" ]; then
        print_color $RED "❌ Profile not found: $EXPERIMENT_PROFILE"
        exit 1
    fi
    
    # Run experiment
    run_experiment
    
    # Show results
    show_results
    
    echo ""
    print_color $GREEN "🎉 Experiment completed successfully!"
    
    # Ask about next steps
    echo ""
    print_color $BLUE "What would you like to do next?"
    echo "  1) Run another experiment"
    echo "  2) Compare with other experiments"
    echo "  3) Exit"
    echo ""
    read -p "Choice (1-3): " next_choice
    
    case $next_choice in
        1)
            exec "$0"
            ;;
        2)
            npm run experiment:compare
            ;;
        *)
            exit 0
            ;;
    esac
}

# Trap errors
trap cleanup_on_error ERR

# Run main function
main