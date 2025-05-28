#!/bin/bash
set -euo pipefail

# Setup Docker secrets for secure credential management

echo "Setting up Docker secrets for DashBuilder..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "ERROR: .env file not found. Please create one from .env.example"
    exit 1
fi

# Source the .env file
source .env

# Check required variables
REQUIRED_VARS=(
    "NEW_RELIC_LICENSE_KEY"
    "NEW_RELIC_API_KEY"
    "NEW_RELIC_ACCOUNT_ID"
)

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var:-}" ]; then
        echo "ERROR: $var is not set in .env file"
        exit 1
    fi
done

# Create secrets directory
SECRETS_DIR="./secrets"
mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

# Create individual secret files
echo -n "$NEW_RELIC_LICENSE_KEY" > "$SECRETS_DIR/nr_license_key"
echo -n "$NEW_RELIC_API_KEY" > "$SECRETS_DIR/nr_api_key"
echo -n "$NEW_RELIC_ACCOUNT_ID" > "$SECRETS_DIR/nr_account_id"

# Set appropriate permissions
chmod 600 "$SECRETS_DIR"/*

# Create Docker secrets (if using Docker Swarm)
if docker info 2>/dev/null | grep -q "Swarm: active"; then
    echo "Docker Swarm detected. Creating Docker secrets..."
    
    # Remove existing secrets if they exist
    docker secret rm nr_license_key 2>/dev/null || true
    docker secret rm nr_api_key 2>/dev/null || true
    docker secret rm nr_account_id 2>/dev/null || true
    
    # Create new secrets
    docker secret create nr_license_key "$SECRETS_DIR/nr_license_key"
    docker secret create nr_api_key "$SECRETS_DIR/nr_api_key"
    docker secret create nr_account_id "$SECRETS_DIR/nr_account_id"
    
    echo "Docker secrets created successfully"
else
    echo "Docker Swarm not active. Secrets stored in $SECRETS_DIR for local use"
fi

# Create docker-compose override for using secrets
cat > docker-compose.secrets.yml << 'EOF'
version: '3.8'

# Docker Compose configuration for using secrets
# Use with: docker-compose -f docker-compose.yml -f docker-compose.secrets.yml up

secrets:
  nr_license_key:
    file: ./secrets/nr_license_key
  nr_api_key:
    file: ./secrets/nr_api_key
  nr_account_id:
    file: ./secrets/nr_account_id

services:
  dashbuilder:
    secrets:
      - nr_license_key
      - nr_api_key
      - nr_account_id
    environment:
      - NEW_RELIC_LICENSE_KEY_FILE=/run/secrets/nr_license_key
      - NEW_RELIC_API_KEY_FILE=/run/secrets/nr_api_key
      - NEW_RELIC_ACCOUNT_ID_FILE=/run/secrets/nr_account_id

  nrdot-collector:
    secrets:
      - nr_license_key
      - nr_api_key
      - nr_account_id
    environment:
      - NEW_RELIC_LICENSE_KEY_FILE=/run/secrets/nr_license_key
      - NEW_RELIC_API_KEY_FILE=/run/secrets/nr_api_key
      - NEW_RELIC_ACCOUNT_ID_FILE=/run/secrets/nr_account_id

  control-loop:
    secrets:
      - nr_license_key
      - nr_api_key
      - nr_account_id
    environment:
      - NEW_RELIC_LICENSE_KEY_FILE=/run/secrets/nr_license_key
      - NEW_RELIC_API_KEY_FILE=/run/secrets/nr_api_key
      - NEW_RELIC_ACCOUNT_ID_FILE=/run/secrets/nr_account_id
EOF

echo "Docker secrets setup complete!"
echo ""
echo "To use secrets with Docker Compose:"
echo "  docker-compose -f docker-compose.yml -f docker-compose.secrets.yml up"
echo ""
echo "Secrets stored in: $SECRETS_DIR"
echo "Remember to add $SECRETS_DIR to .gitignore!"

# Add secrets directory to .gitignore if not already present
if ! grep -q "^secrets/" .gitignore 2>/dev/null; then
    echo "secrets/" >> .gitignore
    echo "Added secrets/ to .gitignore"
fi