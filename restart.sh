#!/bin/bash
# Restart all DashBuilder + NRDOT services

echo "Restarting all services..."
docker-compose restart

echo "Waiting for services to be ready..."
sleep 10

# Quick health check
echo
echo "Service Status:"
docker-compose ps

echo
echo "Running validation..."
./validate-integration.sh