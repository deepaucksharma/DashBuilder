# Launching VMs in DevStack

## Prerequisites

1. Complete DevStack installation using the setup guide
2. Ensure all services are running

## Step-by-Step VM Launch Guide

### 1. Source the OpenStack credentials
```bash
cd /opt/stack/devstack
source openrc admin admin
```

### 2. Create a network for VMs
```bash
# Create private network
openstack network create private

# Create subnet
openstack subnet create private-subnet \
  --network private \
  --subnet-range 10.0.0.0/24 \
  --gateway 10.0.0.1 \
  --dns-nameserver 8.8.8.8

# Create router
openstack router create router1

# Create external network (admin only)
openstack network create public \
  --external \
  --provider-network-type flat \
  --provider-physical-network public

# Create external subnet
openstack subnet create public-subnet \
  --network public \
  --subnet-range 172.24.4.0/24 \
  --gateway 172.24.4.1 \
  --no-dhcp

# Connect router
openstack router set router1 --external-gateway public
openstack router add subnet router1 private-subnet
```

### 3. Configure security groups
```bash
# Allow SSH
openstack security group rule create default \
  --protocol tcp \
  --dst-port 22:22 \
  --remote-ip 0.0.0.0/0

# Allow ICMP (ping)
openstack security group rule create default \
  --protocol icmp \
  --remote-ip 0.0.0.0/0
```

### 4. Create SSH keypair
```bash
# Generate keypair
ssh-keygen -t rsa -f ~/.ssh/devstack_key -N ""

# Add to OpenStack
openstack keypair create --public-key ~/.ssh/devstack_key.pub devstack-key
```

### 5. Launch a VM
```bash
# List available images
openstack image list

# List available flavors
openstack flavor list

# Create VM
openstack server create \
  --image cirros-0.5.2-x86_64-disk \
  --flavor m1.tiny \
  --network private \
  --key-name devstack-key \
  --security-group default \
  test-vm

# Check VM status
openstack server list
openstack server show test-vm
```

### 6. Assign floating IP
```bash
# Create floating IP
openstack floating ip create public

# Assign to VM
openstack server add floating ip test-vm <FLOATING_IP>
```

### 7. Access the VM
```bash
# SSH into VM (default cirros password: gocubsgo)
ssh -i ~/.ssh/devstack_key cirros@<FLOATING_IP>
```

## Using Horizon Dashboard

1. Open http://localhost/dashboard
2. Login: admin / secret
3. Navigate to Project > Compute > Instances
4. Click "Launch Instance"
5. Follow the wizard to create VMs

## Useful Commands

```bash
# List all VMs
openstack server list

# Show VM details
openstack server show <VM_NAME>

# Console access
openstack console url show <VM_NAME>

# Delete VM
openstack server delete <VM_NAME>

# List networks
openstack network list

# List security groups
openstack security group list
```

## Troubleshooting

1. **VM stuck in BUILD state**:
   ```bash
   # Check nova-compute logs
   sudo journalctl -u devstack@n-cpu -f
   ```

2. **Network connectivity issues**:
   ```bash
   # Check neutron agent
   openstack network agent list
   ```

3. **Cannot SSH to VM**:
   - Verify security group rules
   - Check floating IP assignment
   - Ensure VM is ACTIVE state

## Performance Tips

- Use m1.small or larger flavors for better performance
- QEMU is used in container (slower than KVM)
- Consider using lightweight images like CirrOS for testing