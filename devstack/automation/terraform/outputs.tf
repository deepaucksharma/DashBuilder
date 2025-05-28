output "instance_ips" {
  description = "Private IP addresses of instances"
  value       = openstack_compute_instance_v2.app_instance[*].access_ip_v4
}

output "floating_ips" {
  description = "Floating IP addresses assigned to instances"
  value       = openstack_networking_floatingip_v2.app_fip[*].address
}

output "load_balancer_vip" {
  description = "Load balancer VIP address"
  value       = openstack_lb_loadbalancer_v2.app_lb.vip_address
}