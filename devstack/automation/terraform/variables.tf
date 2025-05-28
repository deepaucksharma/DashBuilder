variable "instance_count" {
  description = "Number of instances to create"
  type        = number
  default     = 2
}

variable "image_name" {
  description = "Name of the image to use"
  type        = string
  default     = "cirros-0.5.2-x86_64-disk"
}

variable "flavor_name" {
  description = "Name of the flavor to use"
  type        = string
  default     = "m1.small"
}

variable "external_network" {
  description = "Name of the external network"
  type        = string
  default     = "public"
}

variable "new_relic_license_key" {
  description = "New Relic license key for NRDOT collector"
  type        = string
  sensitive   = true
}

variable "environment" {
  description = "Environment name (dev, staging, production)"
  type        = string
  default     = "production"
}