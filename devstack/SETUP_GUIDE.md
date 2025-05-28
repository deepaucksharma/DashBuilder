# DevStack on MacBook Setup Guide

## Quick Start

### Option 1: Using the start script (Recommended)
```bash
./start-devstack-container.sh
```

This will:
1. Build and start the Docker container
2. Drop you into the container shell
3. From there, run: `cd /opt/stack/devstack && ./stack.sh`

### Option 2: Using Docker Compose
```bash
# Start the container
docker-compose -f docker-compose-simple.yml up -d

# Enter the container
docker exec -it devstack-container /bin/bash

# Inside container, run DevStack
cd /opt/stack/devstack
./stack.sh
```

## Installation Process

Once inside the container:

1. Navigate to DevStack directory:
   ```bash
   cd /opt/stack/devstack
   ```

2. Run the installation (takes 20-30 minutes):
   ```bash
   ./stack.sh
   ```

3. Wait for completion. You'll see:
   ```
   =========================
   DevStack Component Timing
   =========================
   ...
   This is your host IP address: xxx.xxx.xxx.xxx
   Horizon is now available at http://xxx.xxx.xxx.xxx/dashboard
   ```

## Access OpenStack

After installation completes:

- **Dashboard**: http://localhost/dashboard
- **Username**: admin  
- **Password**: secret

## Common Commands

```bash
# Stop DevStack services
cd /opt/stack/devstack && ./unstack.sh

# Start DevStack services
cd /opt/stack/devstack && ./stack.sh

# Clean everything
cd /opt/stack/devstack && ./clean.sh
```

## Troubleshooting

1. If ports are already in use:
   ```bash
   docker ps  # Check running containers
   docker stop <container_name>
   ```

2. To restart from scratch:
   ```bash
   docker rm -f devstack-container
   docker volume rm devstack_devstack-data
   ```

3. To check logs inside container:
   ```bash
   tail -f /opt/stack/logs/stack.sh.log
   ```