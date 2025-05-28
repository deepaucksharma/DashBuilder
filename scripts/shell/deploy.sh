#\!/bin/bash
# DashBuilder Deployment Script

set -e

echo "🚀 Deploying DashBuilder with NRDOT v2..."

# Check if .env file exists
if [ \! -f .env ]; then
    echo "❌ Error: .env file not found\!"
    echo "Please copy .env.example to .env and configure your New Relic credentials"
    exit 1
fi

# Source environment variables
export $(grep -v '^#' .env | xargs)

# Validate required variables
if [ -z "$NEW_RELIC_LICENSE_KEY" ] || [ -z "$NEW_RELIC_API_KEY" ] || [ -z "$NEW_RELIC_ACCOUNT_ID" ]; then
    echo "❌ Error: Missing required New Relic credentials in .env"
    exit 1
fi

echo "✅ Environment configured"

# Build containers if needed
echo "🔨 Building containers..."
docker-compose build

# Start services
echo "🚀 Starting services..."
docker-compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check service health
docker-compose ps

echo "✅ Services deployed successfully\!"
echo ""
echo "📊 Access Points:"
echo "  - Dashboard UI: http://localhost:3000"
echo "  - API: http://localhost:8081"
echo "  - OTEL Metrics: http://localhost:8888/metrics"
echo "  - Health Check: http://localhost:13133/health"
echo ""
echo "Run 'docker-compose logs -f' to view logs"
