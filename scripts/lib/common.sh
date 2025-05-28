#!/bin/bash
# Common shell script functions for DashBuilder/NRDOT
# Source this file in other scripts to maintain consistency

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_test() { echo -e "${BLUE}[TEST]${NC} $1"; }
log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; }
log_fix() { echo -e "${YELLOW}[FIX]${NC} $1"; }
log_check() { echo -e "${BLUE}[CHECK]${NC} $1"; }

# Environment validation
validate_env() {
  # Check if required environment variables are set
  for var in "$@"; do
    if [ -z "${!var+x}" ]; then
      log_error "Required environment variable $var is not set"
      return 1
    fi
  done
  return 0
}

# Math operations (replacing bc dependency)
math_calc() {
  awk "BEGIN { print $1 }"
}

# Parse key-value pairs from .env file
load_env() {
  local env_file="$1"
  if [ -f "$env_file" ]; then
    set -a
    source "$env_file"
    set +a
    return 0
  else
    log_warning "Environment file $env_file not found"
    return 1
  fi
}

# Check if a command is available
check_command() {
  command -v "$1" >/dev/null 2>&1
}

# Check if a process is running
check_process() {
  pgrep -f "$1" >/dev/null 2>&1
}

# Check if a port is open
check_port() {
  local host="$1"
  local port="$2"
  
  (echo > "/dev/tcp/$host/$port") >/dev/null 2>&1
  return $?
}

# Get current timestamp
get_timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# Get formatted date for filenames
get_date_for_filename() {
  date +"%Y%m%d-%H%M%S"
}

# Execute a command with timeout
execute_with_timeout() {
  local timeout="$1"
  local cmd="$2"
  
  (
    eval "$cmd" &
    local pid=$!
    
    (
      sleep "$timeout"
      kill -TERM $pid 2>/dev/null
    ) &
    local watcher=$!
    
    wait $pid 2>/dev/null
    local exit_code=$?
    
    kill -TERM $watcher 2>/dev/null
    wait $watcher 2>/dev/null
    
    return $exit_code
  )
}

# Check if we're running in Docker
is_docker() {
  [ -f /.dockerenv ] || grep -q 'docker\|lxc' /proc/1/cgroup 2>/dev/null
}

# Create directory if it doesn't exist
ensure_dir() {
  if [ ! -d "$1" ]; then
    mkdir -p "$1"
  fi
}

# URL encode a string
url_encode() {
  local string="$1"
  local strlen=${#string}
  local encoded=""
  local pos c o
  
  for (( pos=0 ; pos<strlen ; pos++ )); do
    c=${string:$pos:1}
    case "$c" in
      [-_.~a-zA-Z0-9] ) o="${c}" ;;
      * )               printf -v o '%%%02x' "'$c"
    esac
    encoded+="${o}"
  done
  echo "${encoded}"
}

# JSON escape a string
json_escape() {
  local json="$1"
  json="${json//\\/\\\\}"
  json="${json//\"/\\\"}"
  json="${json//	/\\t}"
  json="${json//
/\\n}"
  json="${json//\r/\\r}"
  echo "$json"
}
