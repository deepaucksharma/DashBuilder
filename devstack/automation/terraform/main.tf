terraform {
  required_providers {
    openstack = {
      source  = "terraform-provider-openstack/openstack"
      version = "~> 1.53.0"
    }
  }
}

# Configure the OpenStack Provider
provider "openstack" {
  user_name   = "admin"
  password    = "secret"
  auth_url    = "http://localhost:5000/v3"
  region      = "RegionOne"
  tenant_name = "admin"
  domain_name = "default"
}

# Data source for existing network
data "openstack_networking_network_v2" "public" {
  name = "public"
}

# Create a private network
resource "openstack_networking_network_v2" "app_network" {
  name           = "app-network"
  admin_state_up = true
}

# Create a subnet
resource "openstack_networking_subnet_v2" "app_subnet" {
  name       = "app-subnet"
  network_id = openstack_networking_network_v2.app_network.id
  cidr       = "192.168.100.0/24"
  ip_version = 4
  dns_nameservers = ["8.8.8.8", "8.8.4.4"]
}

# Create a router
resource "openstack_networking_router_v2" "app_router" {
  name                = "app-router"
  admin_state_up      = true
  external_network_id = data.openstack_networking_network_v2.public.id
}

# Connect subnet to router
resource "openstack_networking_router_interface_v2" "app_router_interface" {
  router_id = openstack_networking_router_v2.app_router.id
  subnet_id = openstack_networking_subnet_v2.app_subnet.id
}

# Create security group
resource "openstack_compute_secgroup_v2" "app_secgroup" {
  name        = "app-security-group"
  description = "Security group for application"

  rule {
    from_port   = 22
    to_port     = 22
    ip_protocol = "tcp"
    cidr        = "0.0.0.0/0"
  }

  rule {
    from_port   = 80
    to_port     = 80
    ip_protocol = "tcp"
    cidr        = "0.0.0.0/0"
  }

  rule {
    from_port   = 443
    to_port     = 443
    ip_protocol = "tcp"
    cidr        = "0.0.0.0/0"
  }

  rule {
    from_port   = -1
    to_port     = -1
    ip_protocol = "icmp"
    cidr        = "0.0.0.0/0"
  }
}

# Create SSH keypair
resource "openstack_compute_keypair_v2" "app_keypair" {
  name       = "app-keypair"
  public_key = file("~/.ssh/id_rsa.pub")
}

# Create instances
resource "openstack_compute_instance_v2" "app_instance" {
  count           = var.instance_count
  name            = "app-server-${count.index + 1}"
  image_name      = var.image_name
  flavor_name     = var.flavor_name
  key_pair        = openstack_compute_keypair_v2.app_keypair.name
  security_groups = [openstack_compute_secgroup_v2.app_secgroup.name]

  network {
    uuid = openstack_networking_network_v2.app_network.id
  }

  user_data = templatefile("${path.module}/cloud-init-nrdot.yaml", {
    hostname               = "app-server-${count.index + 1}"
    new_relic_license_key = var.new_relic_license_key
    environment           = var.environment
  })
}

# Create floating IPs
resource "openstack_networking_floatingip_v2" "app_fip" {
  count = var.instance_count
  pool  = "public"
}

# Associate floating IPs
resource "openstack_compute_floatingip_associate_v2" "app_fip_associate" {
  count       = var.instance_count
  floating_ip = openstack_networking_floatingip_v2.app_fip[count.index].address
  instance_id = openstack_compute_instance_v2.app_instance[count.index].id
}

# Create load balancer
resource "openstack_lb_loadbalancer_v2" "app_lb" {
  name          = "app-loadbalancer"
  vip_subnet_id = openstack_networking_subnet_v2.app_subnet.id
}

# Create listener
resource "openstack_lb_listener_v2" "app_listener" {
  name            = "app-listener"
  protocol        = "HTTP"
  protocol_port   = 80
  loadbalancer_id = openstack_lb_loadbalancer_v2.app_lb.id
}

# Create pool
resource "openstack_lb_pool_v2" "app_pool" {
  name        = "app-pool"
  protocol    = "HTTP"
  lb_method   = "ROUND_ROBIN"
  listener_id = openstack_lb_listener_v2.app_listener.id
}

# Add members to pool
resource "openstack_lb_member_v2" "app_member" {
  count         = var.instance_count
  pool_id       = openstack_lb_pool_v2.app_pool.id
  address       = openstack_compute_instance_v2.app_instance[count.index].access_ip_v4
  protocol_port = 80
}