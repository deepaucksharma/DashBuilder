#!/bin/bash

echo "Installing DevStack inside container..."
echo "This will take approximately 20-30 minutes..."
echo ""

# Execute the installation inside the container
docker exec -it devstack-container bash -c "cd /opt/stack/devstack && sudo -u stack ./stack.sh"

echo ""
echo "DevStack installation complete!"
echo "Access OpenStack Dashboard at: http://localhost/dashboard"
echo "Username: admin"
echo "Password: secret"