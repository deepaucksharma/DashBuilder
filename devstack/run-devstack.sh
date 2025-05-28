#!/bin/bash

echo "Setting up DevStack in Docker container..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Docker is not installed. Please install Docker Desktop for Mac first."
    echo "Visit: https://docs.docker.com/desktop/install/mac-install/"
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo "Docker is not running. Please start Docker Desktop."
    exit 1
fi

echo "Building Docker image..."
docker build -t devstack-ubuntu .

echo "Starting DevStack container..."
docker run -it --privileged \
    --name devstack \
    --hostname devstack \
    -v $(pwd)/devstack:/opt/stack/devstack \
    -p 80:80 \
    -p 6080:6080 \
    -p 5000:5000 \
    -p 8774:8774 \
    -p 8776:8776 \
    -p 9292:9292 \
    -p 9696:9696 \
    devstack-ubuntu \
    /bin/bash -c "cd /opt/stack/devstack && ./stack.sh"

echo "DevStack installation complete!"
echo "Access OpenStack at: http://localhost/dashboard"
echo "Username: admin"
echo "Password: secret"