# Troubleshooting Guide: DevStack + NRDOT Integration

## Quick Diagnostics

Run this first:
```bash
./check-nrdot-status.sh
```

## Common Issues and Solutions

### 1. DevStack Container Issues

#### Container Keeps Exiting
**Symptom**: Container exits immediately or with status 126

**Solution**:
```bash
# Clean up and rebuild
docker rm -f devstack-container
docker rmi devstack-ubuntu:vm-enabled

# Rebuild with proper base image
cd /Users/deepaksharma/devstack
docker build -t devstack-ubuntu:vm-enabled .

# Start with docker-compose instead
docker-compose -f docker-compose-devstack.yml up -d
```

#### Cannot Access DevStack Services
**Symptom**: Connection refused on ports 5000, 8774, etc.

**Check**:
```bash
# Check if services are running
docker exec devstack-container systemctl status devstack@*

# Check port bindings
docker port devstack-container

# Check firewall
sudo pfctl -s rules 2>/dev/null | grep -E "(5000|8774|9292)"
```

### 2. OpenStack Issues

#### Authentication Failed
**Symptom**: "The request you have made requires authentication"

**Solution**:
```bash
# Re-source credentials
source ./openrc

# Verify environment
env | grep OS_

# Test connection
openstack token issue
```

#### No Valid Host Found
**Symptom**: "No valid host was found" when creating VMs

**Check**:
```bash
# Check compute service
openstack compute service list

# Check hypervisor
openstack hypervisor list

# Check resources
openstack hypervisor show <hypervisor-name>
```

### 3. NRDOT Collector Issues

#### NRDOT Not Installing on VMs
**Symptom**: NRDOT service not found on VMs

**Common Causes**:
1. **Image doesn't support cloud-init** (e.g., CirrOS)
   ```bash
   # Use Ubuntu instead
   IMAGE_NAME="ubuntu-20.04" ./deploy-web-stack.sh test
   ```

2. **License key not set**
   ```bash
   # Check .env file
   grep NEW_RELIC_LICENSE_KEY .env
   
   # Ensure it's loaded
   source ./load-env.sh
   echo $NEW_RELIC_LICENSE_KEY
   ```

3. **Network issues**
   ```bash
   # Test from VM (if accessible)
   curl -I https://github.com
   curl -I https://otlp.nr-data.net
   ```

#### No Data in New Relic
**Symptom**: Hosts not appearing in New Relic after 5+ minutes

**Debugging Steps**:

1. **Check NRDOT logs on VM**:
   ```bash
   ssh -i <key>.pem ubuntu@<floating-ip>
   sudo journalctl -u nrdot-collector-host -n 100
   ```

2. **Common log errors**:
   - `401 Unauthorized` - Invalid license key
   - `connection refused` - Network/firewall issue
   - `empty host.id` - Missing host.id attribute

3. **Verify configuration**:
   ```bash
   sudo cat /etc/nrdot-collector-host/nrdot-collector-host.env
   ```

4. **Test locally first**:
   ```bash
   ./test-nrdot-locally.sh
   ```

### 4. Network Issues

#### VMs Cannot Reach Internet
**Symptom**: VMs can't download NRDOT or reach New Relic

**Check**:
```bash
# Check router
openstack router list
openstack router show <router-name>

# Check external network
openstack network list --external

# Check security groups
openstack security group rule list <security-group>
```

**Fix**:
```bash
# Ensure egress rules exist
openstack security group rule create \
    --egress \
    --protocol any \
    --remote-ip 0.0.0.0/0 \
    <security-group>
```

### 5. Terraform Issues

#### Variable Not Set
**Symptom**: "variable new_relic_license_key is not set"

**Solution**:
```bash
# Option 1: Use environment variable
export TF_VAR_new_relic_license_key=$NEW_RELIC_LICENSE_KEY

# Option 2: Create terraform.tfvars
echo 'new_relic_license_key = "'$NEW_RELIC_LICENSE_KEY'"' > terraform.tfvars

# Option 3: Pass directly
terraform apply -var="new_relic_license_key=$NEW_RELIC_LICENSE_KEY"
```

### 6. Ansible Issues

#### Cannot Find Hosts
**Symptom**: "Could not match supplied host pattern"

**Solution**:
```bash
# Generate inventory
cd automation/ansible
ansible-playbook deploy-vms.yml

# Check inventory
cat inventory.ini

# Test connectivity
ansible all -i inventory.ini -m ping
```

## Verification Checklist

### 1. Local Verification
```bash
# Check environment
[ ! -z "$NEW_RELIC_LICENSE_KEY" ] && echo "✓ License key set" || echo "✗ License key missing"

# Check Docker
docker ps | grep -q devstack && echo "✓ DevStack running" || echo "✗ DevStack not running"

# Check OpenStack
openstack token issue >/dev/null 2>&1 && echo "✓ OpenStack accessible" || echo "✗ OpenStack not accessible"
```

### 2. VM Verification
```bash
# List VMs
openstack server list

# Check floating IPs
openstack floating ip list

# SSH test (Ubuntu images)
ssh -o ConnectTimeout=5 -i <key>.pem ubuntu@<floating-ip> "sudo systemctl status nrdot-collector-host"
```

### 3. New Relic Verification

**NRQL Queries**:
```sql
-- Find all OpenStack hosts
FROM SystemSample 
SELECT uniqueCount(host.id) 
WHERE cloud.provider = 'openstack' 
SINCE 30 minutes ago

-- Check specific host
FROM SystemSample 
SELECT * 
WHERE host.id = 'your-host-id' 
SINCE 10 minutes ago

-- View logs from OpenStack VMs
FROM Log 
SELECT message 
WHERE cloud.provider = 'openstack' 
SINCE 30 minutes ago
```

## Debug Mode

### Enable Debug Logging

1. **NRDOT Debug**:
   ```yaml
   # Add to config.yaml
   service:
     telemetry:
       logs:
         level: debug
   ```

2. **OpenStack Debug**:
   ```bash
   export OS_DEBUG=1
   openstack --debug server list
   ```

3. **Terraform Debug**:
   ```bash
   export TF_LOG=DEBUG
   terraform apply
   ```

## Clean Up

### Remove Test Resources
```bash
# List all test resources
openstack server list --name '*test*'
openstack network list --name '*test*'

# Clean up specific project
cd automation/scripts
./cleanup-stack.sh <project-name>

# Nuclear option - remove all
for server in $(openstack server list -f value -c ID); do
    openstack server delete $server
done
```

### Reset Environment
```bash
# Stop containers
docker-compose down
docker stop devstack-container nrdot-test 2>/dev/null

# Clean Docker
docker system prune -a

# Remove temp files
rm -f *.pem openrc terraform.tfstate*
```

## Getting Help

1. **Check logs**:
   - DevStack: `docker logs devstack-container`
   - NRDOT: `journalctl -u nrdot-collector-host`
   - OpenStack: `openstack --debug`

2. **Enable verbose mode**:
   - Add `-v` or `-vvv` to commands
   - Set `OS_DEBUG=1`
   - Use `--debug` flag

3. **Community resources**:
   - DevStack: https://docs.openstack.org/devstack/latest/
   - NRDOT: https://github.com/newrelic/nrdot-collector-releases
   - New Relic: https://docs.newrelic.com/