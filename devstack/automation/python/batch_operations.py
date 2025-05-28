#!/usr/bin/env python3
"""
Batch operations for OpenStack - useful for bulk VM management
"""

import concurrent.futures
import time
from typing import List, Dict
import logging
from openstack_automation import OpenStackAutomation

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class BatchOperations(OpenStackAutomation):
    """Extended class for batch operations"""
    
    def __init__(self, cloud_name: str = None, max_workers: int = 5):
        super().__init__(cloud_name)
        self.max_workers = max_workers
    
    def batch_launch_instances(self, 
                             instance_configs: List[Dict],
                             parallel: bool = True) -> List:
        """Launch multiple instances in parallel or serial"""
        
        if parallel:
            with concurrent.futures.ThreadPoolExecutor(max_workers=self.max_workers) as executor:
                futures = []
                for config in instance_configs:
                    future = executor.submit(self.launch_instance, **config)
                    futures.append(future)
                
                servers = []
                for future in concurrent.futures.as_completed(futures):
                    try:
                        server = future.result()
                        servers.append(server)
                    except Exception as e:
                        logger.error(f"Failed to launch instance: {e}")
                
                return servers
        else:
            servers = []
            for config in instance_configs:
                try:
                    server = self.launch_instance(**config)
                    servers.append(server)
                except Exception as e:
                    logger.error(f"Failed to launch instance: {e}")
            return servers
    
    def batch_snapshot_instances(self, server_names: List[str]) -> List:
        """Create snapshots of multiple instances"""
        
        snapshots = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            futures = {}
            
            for server_name in server_names:
                server = self.conn.compute.find_server(server_name)
                if server:
                    snapshot_name = f"{server_name}-snapshot-{int(time.time())}"
                    future = executor.submit(
                        self.conn.compute.create_server_image,
                        server,
                        snapshot_name
                    )
                    futures[future] = snapshot_name
            
            for future in concurrent.futures.as_completed(futures):
                snapshot_name = futures[future]
                try:
                    image_id = future.result()
                    logger.info(f"Created snapshot: {snapshot_name}")
                    snapshots.append({'name': snapshot_name, 'id': image_id})
                except Exception as e:
                    logger.error(f"Failed to create snapshot {snapshot_name}: {e}")
        
        return snapshots
    
    def batch_resize_instances(self, 
                             server_names: List[str], 
                             new_flavor: str) -> Dict:
        """Resize multiple instances"""
        
        results = {'success': [], 'failed': []}
        flavor = self.conn.compute.find_flavor(new_flavor)
        
        if not flavor:
            raise ValueError(f"Flavor {new_flavor} not found")
        
        for server_name in server_names:
            try:
                server = self.conn.compute.find_server(server_name)
                if server:
                    self.conn.compute.resize_server(server, flavor)
                    logger.info(f"Resizing {server_name} to {new_flavor}")
                    
                    # Wait for resize to complete
                    server = self.conn.compute.wait_for_server(
                        server,
                        status='VERIFY_RESIZE',
                        wait=300
                    )
                    
                    # Confirm resize
                    self.conn.compute.confirm_resize_server(server)
                    results['success'].append(server_name)
                else:
                    results['failed'].append(server_name)
            except Exception as e:
                logger.error(f"Failed to resize {server_name}: {e}")
                results['failed'].append(server_name)
        
        return results
    
    def rolling_update(self,
                      server_prefix: str,
                      new_image: str,
                      batch_size: int = 2) -> None:
        """Perform rolling update of instances"""
        
        # Get all servers matching prefix
        servers = [s for s in self.conn.compute.servers() 
                  if s.name.startswith(server_prefix)]
        
        if not servers:
            logger.warning(f"No servers found with prefix: {server_prefix}")
            return
        
        # Process in batches
        for i in range(0, len(servers), batch_size):
            batch = servers[i:i + batch_size]
            logger.info(f"Processing batch: {[s.name for s in batch]}")
            
            for server in batch:
                try:
                    # Create snapshot before update
                    snapshot_name = f"{server.name}-pre-update-{int(time.time())}"
                    self.conn.compute.create_server_image(server, snapshot_name)
                    logger.info(f"Created pre-update snapshot: {snapshot_name}")
                    
                    # Get server details
                    networks = [{'uuid': net['uuid']} for net in server.networks]
                    
                    # Delete old instance
                    self.conn.compute.delete_server(server)
                    self.conn.compute.wait_for_delete(server)
                    logger.info(f"Deleted old instance: {server.name}")
                    
                    # Create new instance with same name
                    new_server = self.launch_instance(
                        name=server.name,
                        image_name=new_image,
                        flavor_name=server.flavor['original_name'],
                        networks=networks
                    )
                    logger.info(f"Created new instance: {new_server.name}")
                    
                except Exception as e:
                    logger.error(f"Failed to update {server.name}: {e}")
            
            # Wait before next batch
            if i + batch_size < len(servers):
                logger.info(f"Waiting 30 seconds before next batch...")
                time.sleep(30)
    
    def health_check_instances(self, server_names: List[str]) -> Dict:
        """Check health of multiple instances"""
        
        health_status = {'healthy': [], 'unhealthy': [], 'unknown': []}
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            futures = {}
            
            for server_name in server_names:
                future = executor.submit(self._check_instance_health, server_name)
                futures[future] = server_name
            
            for future in concurrent.futures.as_completed(futures):
                server_name = futures[future]
                try:
                    status = future.result()
                    health_status[status].append(server_name)
                except Exception as e:
                    logger.error(f"Failed to check health of {server_name}: {e}")
                    health_status['unknown'].append(server_name)
        
        return health_status
    
    def _check_instance_health(self, server_name: str) -> str:
        """Check health of a single instance"""
        
        server = self.conn.compute.find_server(server_name)
        if not server:
            return 'unknown'
        
        # Check server status
        if server.status != 'ACTIVE':
            return 'unhealthy'
        
        # Check if server has IP
        if not server.addresses:
            return 'unhealthy'
        
        # Could add more checks here (ping, SSH, etc.)
        return 'healthy'


def example_batch_operations():
    """Example usage of batch operations"""
    
    batch_ops = BatchOperations(max_workers=3)
    
    # Example 1: Launch multiple instances
    instance_configs = [
        {
            'name': f'batch-server-{i}',
            'image_name': 'cirros-0.5.2-x86_64-disk',
            'flavor_name': 'm1.small',
            'network_name': 'auto-app-network'
        }
        for i in range(1, 6)
    ]
    
    servers = batch_ops.batch_launch_instances(instance_configs, parallel=True)
    print(f"Launched {len(servers)} instances")
    
    # Example 2: Health check
    server_names = [f'batch-server-{i}' for i in range(1, 6)]
    health = batch_ops.health_check_instances(server_names)
    print(f"Health check results: {health}")
    
    # Example 3: Create snapshots
    snapshots = batch_ops.batch_snapshot_instances(server_names[:2])
    print(f"Created {len(snapshots)} snapshots")
    
    # Example 4: Rolling update (commented out to prevent accidental execution)
    # batch_ops.rolling_update('batch-server', 'ubuntu-20.04', batch_size=2)


if __name__ == "__main__":
    example_batch_operations()