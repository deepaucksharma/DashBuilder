# DevStack VM Launch Quick Start

## Status
✅ Docker container is running with VM support
✅ DevStack configuration optimized for VM launching
✅ All necessary ports exposed

## Next Steps

### 1. Enter the container
Open a new terminal and run:
```bash
docker exec -it devstack-container /bin/bash
```

### 2. Switch to stack user and install DevStack
Inside the container:
```bash
sudo su - stack
cd /opt/stack/devstack
./stack.sh
```

### 3. Wait for installation (20-30 minutes)
The installation will download and configure:
- Nova (compute service)
- Neutron (networking) 
- Glance (image service)
- Cinder (block storage)
- Horizon (dashboard)
- Keystone (identity)

### 4. Access OpenStack
Once complete, access at:
- **Dashboard**: http://localhost/dashboard
- **API**: http://localhost:5000
- **VNC Console**: http://localhost:6080

### 5. Launch your first VM
See VM_LAUNCH_GUIDE.md for detailed instructions

## Quick Commands

**Check container status**:
```bash
docker ps | grep devstack
```

**View installation logs**:
```bash
docker exec -it devstack-container tail -f /opt/stack/logs/stack.sh.log
```

**Stop DevStack**:
```bash
docker exec -it devstack-container /bin/bash -c "cd /opt/stack/devstack && ./unstack.sh"
```

**Restart DevStack**:
```bash
docker restart devstack-container
docker exec -it devstack-container /bin/bash -c "cd /opt/stack/devstack && ./stack.sh"
```