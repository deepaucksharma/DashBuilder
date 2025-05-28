#!/bin/bash

echo "Starting DevStack container in interactive mode..."

# Check if container already exists
if docker ps -a | grep -q devstack-container; then
    echo "Removing existing container..."
    docker rm -f devstack-container
fi

echo "Starting new DevStack container..."
docker run -d --privileged \
    --name devstack-container \
    --hostname devstack \
    -v $(pwd)/devstack:/opt/stack/devstack \
    -v /lib/modules:/lib/modules:ro \
    -p 80:80 \
    -p 6080:6080 \
    -p 5000:5000 \
    -p 8774:8774 \
    -p 8776:8776 \
    -p 9292:9292 \
    -p 9696:9696 \
    devstack-ubuntu:vm-enabled \
    tail -f /dev/null

echo "Container started. Now entering the container..."
echo "To install DevStack, run: cd /opt/stack/devstack && ./stack.sh"
echo ""

docker exec -it devstack-container /bin/bash