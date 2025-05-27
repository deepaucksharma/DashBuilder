# NRDOT v2 Framework Documentation

<div align="center">

**Nginx Reverse-proxy Dashboard Orchestration Tool**  
*Version 2.0 - Enterprise Edition*

[![Framework Version](https://img.shields.io/badge/NRDOT-v2.0-blue)]()
[![Status](https://img.shields.io/badge/Status-Production_Ready-green)]()
[![License](https://img.shields.io/badge/License-MIT-yellow)]()

</div>

---

## 📚 Table of Contents

### Core Documentation

| Document | Description | Status |
|----------|-------------|--------|
| [**Overview**](01-overview.md) | Executive summary and framework introduction | ✅ Complete |
| [**Configuration Architecture**](02-configuration.md) | Comprehensive configuration guide and patterns | ✅ Complete |
| [**Control Loop**](03-control-loop.md) | Implementation details and event handling | ✅ Complete |
| [**Cross-Platform Patterns**](04-cross-platform.md) | Multi-platform support and best practices | ✅ Complete |
| [**Monitoring & Observability**](05-monitoring.md) | Metrics, logging, and dashboard setup | ✅ Complete |
| [**Deployment Playbook**](06-deployment.md) | Production deployment strategies | ✅ Complete |
| [**Validation & Success**](07-validation.md) | Testing and success criteria | ✅ Complete |
| [**Quick Start Guide**](README.md) | Get up and running in 5 minutes | ✅ Complete |

---

## 🚀 Quick Navigation

<table>
<tr>
<td width="33%">

### 🎯 Getting Started
- [Installation](README.md#installation)
- [Basic Configuration](02-configuration.md#basic-setup)
- [First Dashboard](README.md#first-dashboard)

</td>
<td width="33%">

### 🔧 Advanced Topics
- [Custom Backends](02-configuration.md#backend-definitions)
- [Control Patterns](03-control-loop.md#patterns)
- [Platform Support](04-cross-platform.md)

</td>
<td width="33%">

### 📊 Operations
- [Monitoring Setup](05-monitoring.md#setup)
- [Production Deploy](06-deployment.md)
- [Troubleshooting](05-monitoring.md#troubleshooting)

</td>
</tr>
</table>

---

## 🏗️ Framework Overview

NRDOT v2 is a modern, enterprise-grade framework for managing Nginx reverse proxy configurations through intuitive dashboards. Built with scalability, reliability, and ease of use in mind.

### Key Features

<table>
<tr>
<td width="50%">

#### 🎨 **Dashboard-Driven Management**
- Visual configuration editor
- Real-time status monitoring
- Drag-and-drop backend management
- Integrated health checks

</td>
<td width="50%">

#### 🔄 **Control Loop Architecture**
- Event-driven updates
- Automatic failover
- Self-healing capabilities
- Zero-downtime reloads

</td>
</tr>
<tr>
<td width="50%">

#### 🌍 **Cross-Platform Support**
- Linux (Ubuntu, RHEL, Alpine)
- Windows Server 2019+
- Docker & Kubernetes
- Cloud-native ready

</td>
<td width="50%">

#### 📊 **Enterprise Monitoring**
- Prometheus metrics
- Grafana dashboards
- ELK stack integration
- Real-time alerting

</td>
</tr>
</table>

---

## 📋 Documentation Standards

> **Note:** All documentation follows these standards for consistency:

- **Code Examples**: All code blocks include syntax highlighting and are tested
- **Cross-References**: Documents link to related topics for easy navigation
- **Visual Aids**: Diagrams and tables are used to clarify complex concepts
- **Version Info**: Each document includes version compatibility information

---

## 🔍 Search by Topic

<details>
<summary><strong>Configuration Topics</strong></summary>

- [YAML Configuration Structure](02-configuration.md#yaml-structure)
- [Backend Pool Management](02-configuration.md#backend-definitions)
- [Health Check Configuration](02-configuration.md#health-checks)
- [SSL/TLS Settings](02-configuration.md#ssl-configuration)
- [Load Balancing Methods](02-configuration.md#load-balancing)

</details>

<details>
<summary><strong>Operational Topics</strong></summary>

- [Deployment Strategies](06-deployment.md#strategies)
- [Monitoring Setup](05-monitoring.md#setup)
- [Log Management](05-monitoring.md#logging)
- [Performance Tuning](06-deployment.md#performance)
- [Backup & Recovery](06-deployment.md#backup-recovery)

</details>

<details>
<summary><strong>Development Topics</strong></summary>

- [API Reference](03-control-loop.md#api-reference)
- [Event System](03-control-loop.md#event-system)
- [Plugin Development](03-control-loop.md#plugins)
- [Testing Framework](07-validation.md#testing)
- [Contributing Guide](README.md#contributing)

</details>

---

## 🎯 Learning Paths

### Path 1: System Administrator
1. Start with [Quick Start Guide](README.md)
2. Master [Configuration](02-configuration.md)
3. Learn [Deployment](06-deployment.md)
4. Setup [Monitoring](05-monitoring.md)

### Path 2: Developer
1. Understand [Overview](01-overview.md)
2. Study [Control Loop](03-control-loop.md)
3. Explore [Cross-Platform](04-cross-platform.md)
4. Review [Validation](07-validation.md)

### Path 3: DevOps Engineer
1. Review [Overview](01-overview.md)
2. Setup [Monitoring](05-monitoring.md)
3. Plan [Deployment](06-deployment.md)
4. Validate [Success](07-validation.md)

---

## 📞 Support & Resources

<table>
<tr>
<td width="33%" align="center">

### 💬 Community
[Discord](https://discord.gg/nrdot) | [Forum](https://forum.nrdot.io)

</td>
<td width="33%" align="center">

### 🐛 Issues
[GitHub Issues](https://github.com/nrdot/v2/issues)

</td>
<td width="33%" align="center">

### 📖 Updates
[Blog](https://blog.nrdot.io) | [Changelog](CHANGELOG.md)

</td>
</tr>
</table>

---

<div align="center">

**Ready to get started?** Head to the [Quick Start Guide](README.md) →

*Last Updated: January 2024 | NRDOT v2.0*

</div>