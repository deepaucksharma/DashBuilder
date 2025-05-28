#!/usr/bin/env python3
"""
OpenStack Automation using Python SDK
Provides classes and functions for VM lifecycle management
"""

import os
import time
import logging
from typing import List, Dict, Optional
import openstack
from openstack.connection import Connection

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class OpenStackAutomation:
    """Main class for OpenStack automation operations"""
    
    def __init__(self, cloud_name: str = None):
        """Initialize OpenStack connection"""
        # Load .env file if it exists
        env_file = os.path.join(os.path.dirname(__file__), '../../.env')
        if os.path.exists(env_file):
            from dotenv import load_dotenv
            load_dotenv(env_file)
            logger.info("Loaded configuration from .env file")
        
        if cloud_name:
            self.conn = openstack.connect(cloud=cloud_name)
        else:
            # Use environment variables or local config
            self.conn = openstack.connect(
                auth_url=os.getenv('OS_AUTH_URL', 'http://localhost:5000/v3'),
                project_name=os.getenv('OS_PROJECT_NAME', 'admin'),
                username=os.getenv('OS_USERNAME', 'admin'),
                password=os.getenv('OS_PASSWORD', 'secret'),
                user_domain_name=os.getenv('OS_USER_DOMAIN_NAME', 'default'),
                project_domain_name=os.getenv('OS_PROJECT_DOMAIN_NAME', 'default')
            )
        logger.info("Connected to OpenStack")
    
    def create_network_infrastructure(self, 
                                    network_name: str = "auto-network",
                                    subnet_cidr: str = "10.0.100.0/24") -> Dict:
        """Create network, subnet, and router"""
        
        # Create network
        network = self.conn.network.create_network(
            name=network_name,
            admin_state_up=True
        )
        logger.info(f"Created network: {network.name}")
        
        # Create subnet
        subnet = self.conn.network.create_subnet(
            name=f"{network_name}-subnet",
            network_id=network.id,
            cidr=subnet_cidr,
            ip_version=4,
            enable_dhcp=True,
            dns_nameservers=['8.8.8.8', '8.8.4.4']
        )
        logger.info(f"Created subnet: {subnet.name}")
        
        # Get external network
        external_net = None
        for net in self.conn.network.networks():
            if net.is_router_external:
                external_net = net
                break
        
        if external_net:
            # Create router
            router = self.conn.network.create_router(
                name=f"{network_name}-router",
                external_gateway_info={'network_id': external_net.id}
            )
            logger.info(f"Created router: {router.name}")
            
            # Add interface to router
            self.conn.network.add_interface_to_router(
                router.id,
                subnet_id=subnet.id
            )
            logger.info("Connected subnet to router")
        else:
            router = None
            logger.warning("No external network found, skipping router creation")
        
        return {
            'network': network,
            'subnet': subnet,
            'router': router
        }
    
    def create_security_group(self, name: str = "auto-security-group") -> object:
        """Create security group with common rules"""
        
        # Create security group
        sg = self.conn.network.create_security_group(
            name=name,
            description="Automated security group"
        )
        logger.info(f"Created security group: {sg.name}")
        
        # Add rules
        rules = [
            {'port_range_min': 22, 'port_range_max': 22, 'protocol': 'tcp'},
            {'port_range_min': 80, 'port_range_max': 80, 'protocol': 'tcp'},
            {'port_range_min': 443, 'port_range_max': 443, 'protocol': 'tcp'},
            {'port_range_min': None, 'port_range_max': None, 'protocol': 'icmp'}
        ]
        
        for rule in rules:
            self.conn.network.create_security_group_rule(
                security_group_id=sg.id,
                direction='ingress',
                ether_type='IPv4',
                protocol=rule['protocol'],
                port_range_min=rule['port_range_min'],
                port_range_max=rule['port_range_max'],
                remote_ip_prefix='0.0.0.0/0'
            )
        
        logger.info("Added security group rules")
        return sg
    
    def launch_instance(self,
                       name: str,
                       image_name: str = "cirros-0.5.2-x86_64-disk",
                       flavor_name: str = "m1.small",
                       network_name: str = None,
                       security_group_name: str = None,
                       key_name: str = None,
                       user_data: str = None,
                       enable_nrdot: bool = True) -> object:
        """Launch a new instance"""
        
        # Get image
        image = self.conn.compute.find_image(image_name)
        if not image:
            raise ValueError(f"Image {image_name} not found")
        
        # Get flavor
        flavor = self.conn.compute.find_flavor(flavor_name)
        if not flavor:
            raise ValueError(f"Flavor {flavor_name} not found")
        
        # Get network
        networks = []
        if network_name:
            network = self.conn.network.find_network(network_name)
            if network:
                networks = [{'uuid': network.id}]
        
        # Get security groups
        security_groups = []
        if security_group_name:
            sg = self.conn.network.find_security_group(security_group_name)
            if sg:
                security_groups = [{'name': sg.name}]
        
        # Add NRDOT collector user data if enabled
        if enable_nrdot and not user_data:
            new_relic_key = os.getenv('NEW_RELIC_LICENSE_KEY', '')
            if new_relic_key:
                user_data = self._generate_nrdot_userdata(name, new_relic_key)
        
        # Create instance
        server = self.conn.compute.create_server(
            name=name,
            image_id=image.id,
            flavor_id=flavor.id,
            networks=networks,
            security_groups=security_groups,
            key_name=key_name,
            user_data=user_data
        )
        
        # Wait for server to be active
        server = self.conn.compute.wait_for_server(server)
        logger.info(f"Instance {server.name} is active")
        
        return server
    
    def assign_floating_ip(self, server_name: str) -> str:
        """Assign floating IP to server"""
        
        server = self.conn.compute.find_server(server_name)
        if not server:
            raise ValueError(f"Server {server_name} not found")
        
        # Create floating IP
        external_net = None
        for net in self.conn.network.networks():
            if net.is_router_external:
                external_net = net
                break
        
        if not external_net:
            raise ValueError("No external network found")
        
        floating_ip = self.conn.network.create_ip(
            floating_network_id=external_net.id
        )
        logger.info(f"Created floating IP: {floating_ip.floating_ip_address}")
        
        # Assign to server
        self.conn.compute.add_floating_ip_to_server(
            server,
            floating_ip.floating_ip_address
        )
        logger.info(f"Assigned floating IP to {server.name}")
        
        return floating_ip.floating_ip_address
    
    def create_volume(self, name: str, size: int = 10) -> object:
        """Create a volume"""
        
        volume = self.conn.volume.create_volume(
            name=name,
            size=size,
            description=f"Volume for {name}"
        )
        
        # Wait for volume to be available
        volume = self.conn.volume.wait_for_status(
            volume,
            status='available',
            failures=['error']
        )
        logger.info(f"Created volume: {volume.name}")
        
        return volume
    
    def attach_volume(self, server_name: str, volume_name: str) -> None:
        """Attach volume to server"""
        
        server = self.conn.compute.find_server(server_name)
        volume = self.conn.volume.find_volume(volume_name)
        
        if not server or not volume:
            raise ValueError("Server or volume not found")
        
        self.conn.compute.create_volume_attachment(
            server,
            volume_id=volume.id
        )
        logger.info(f"Attached volume {volume_name} to {server_name}")
    
    def _generate_nrdot_userdata(self, hostname: str, license_key: str) -> str:
        """Generate cloud-init userdata for NRDOT collector installation"""
        
        return f"""#!/bin/bash
# Install NRDOT Collector
export NRDOT_VERSION="1.1.0"
export NEW_RELIC_LICENSE_KEY="{license_key}"

# Update system
apt-get update || yum update -y

# Install dependencies
apt-get install -y wget ca-certificates || yum install -y wget ca-certificates

# Detect architecture
ARCH=$(uname -m)
case $ARCH in
    x86_64) ARCH="amd64" ;;
    aarch64) ARCH="arm64" ;;
esac

# Download and install NRDOT
if command -v apt-get >/dev/null; then
    DEB_FILE="nrdot-collector-host_${{NRDOT_VERSION}}_linux_${{ARCH}}.deb"
    wget -q -O "/tmp/${{DEB_FILE}}" "https://github.com/newrelic/nrdot-collector-releases/releases/download/v${{NRDOT_VERSION}}/${{DEB_FILE}}"
    dpkg -i "/tmp/${{DEB_FILE}}" || apt-get install -f -y
else
    RPM_FILE="nrdot-collector-host_${{NRDOT_VERSION}}_linux_${{ARCH}}.rpm"
    wget -q -O "/tmp/${{RPM_FILE}}" "https://github.com/newrelic/nrdot-collector-releases/releases/download/v${{NRDOT_VERSION}}/${{RPM_FILE}}"
    rpm -i "/tmp/${{RPM_FILE}}" || yum install -y "/tmp/${{RPM_FILE}}"
fi

# Configure NRDOT
mkdir -p /etc/nrdot-collector-host
cat > /etc/nrdot-collector-host/nrdot-collector-host.env << EOF
NEW_RELIC_LICENSE_KEY=${{NEW_RELIC_LICENSE_KEY}}
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.nr-data.net
OTEL_RESOURCE_ATTRIBUTES="service.name=openstack-vm,environment=production,host.id={hostname},cloud.provider=openstack"
NEW_RELIC_MEMORY_LIMIT_MIB=100
EOF

# Update systemd service
sed -i '/\\[Service\\]/a EnvironmentFile=/etc/nrdot-collector-host/nrdot-collector-host.env' \\
    /lib/systemd/system/nrdot-collector-host.service

# Start service
systemctl daemon-reload
systemctl enable nrdot-collector-host
systemctl start nrdot-collector-host

echo "NRDOT Collector installed and started on {hostname}"
"""
    
    def cleanup_resources(self, prefix: str = "auto-") -> None:
        """Cleanup resources with given prefix"""
        
        # Delete servers
        for server in self.conn.compute.servers():
            if server.name.startswith(prefix):
                self.conn.compute.delete_server(server)
                logger.info(f"Deleted server: {server.name}")
        
        # Delete volumes
        for volume in self.conn.volume.volumes():
            if volume.name and volume.name.startswith(prefix):
                self.conn.volume.delete_volume(volume)
                logger.info(f"Deleted volume: {volume.name}")
        
        # Delete floating IPs
        for fip in self.conn.network.ips():
            if not fip.fixed_ip_address:
                self.conn.network.delete_ip(fip)
                logger.info(f"Deleted floating IP: {fip.floating_ip_address}")
        
        # Delete routers (remove interfaces first)
        for router in self.conn.network.routers():
            if router.name and router.name.startswith(prefix):
                # Remove interfaces
                for port in self.conn.network.ports(device_id=router.id):
                    if port.device_owner == 'network:router_interface':
                        self.conn.network.remove_interface_from_router(
                            router,
                            port_id=port.id
                        )
                self.conn.network.delete_router(router)
                logger.info(f"Deleted router: {router.name}")
        
        # Delete networks
        for network in self.conn.network.networks():
            if network.name and network.name.startswith(prefix):
                self.conn.network.delete_network(network)
                logger.info(f"Deleted network: {network.name}")
        
        # Delete security groups
        for sg in self.conn.network.security_groups():
            if sg.name and sg.name.startswith(prefix):
                self.conn.network.delete_security_group(sg)
                logger.info(f"Deleted security group: {sg.name}")


def main():
    """Example usage of OpenStackAutomation class"""
    
    # Initialize
    automation = OpenStackAutomation()
    
    try:
        # Create infrastructure
        infra = automation.create_network_infrastructure(
            network_name="auto-app-network",
            subnet_cidr="10.0.200.0/24"
        )
        
        # Create security group
        sg = automation.create_security_group("auto-app-sg")
        
        # Launch instances
        servers = []
        for i in range(1, 4):
            server = automation.launch_instance(
                name=f"auto-app-server-{i}",
                network_name="auto-app-network",
                security_group_name="auto-app-sg",
                user_data="""#!/bin/bash
echo "Hello from automated instance" > /tmp/hello.txt
"""
            )
            servers.append(server)
            
            # Assign floating IP to first server
            if i == 1:
                fip = automation.assign_floating_ip(server.name)
                print(f"Access server at: {fip}")
        
        # Create and attach volume to first server
        volume = automation.create_volume("auto-data-volume", size=5)
        automation.attach_volume(servers[0].name, volume.name)
        
        print("\nResources created successfully!")
        print("To cleanup, uncomment the cleanup line below")
        
        # Cleanup (uncomment when needed)
        # automation.cleanup_resources(prefix="auto-")
        
    except Exception as e:
        logger.error(f"Error: {e}")
        # Cleanup on error
        automation.cleanup_resources(prefix="auto-")


if __name__ == "__main__":
    main()