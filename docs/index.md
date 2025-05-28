# DashBuilder Documentation Index

<div align="center">

**DashBuilder with NRDOT v2 Process Optimization**  
*70-85% telemetry cost reduction while maintaining 95%+ critical process coverage*

[![Version](https://img.shields.io/badge/Version-2.0-blue)]()
[![Status](https://img.shields.io/badge/Status-Production_Ready-green)]()
[![License](https://img.shields.io/badge/License-MIT-yellow)]()

</div>

---

## 📚 Documentation Hub

### Core Documentation

| Document | Description | Quick Access |
|----------|-------------|--------------|
| [**Architecture**](architecture.md) | System design and components | [View →](architecture.md) |
| [**API Reference**](api-reference.md) | Complete API documentation | [View →](api-reference.md) |
| [**Deployment Guide**](deployment-guide.md) | All deployment methods | [View →](deployment-guide.md) |
| [**Troubleshooting**](TROUBLESHOOTING_RUNBOOK.md) | Common issues and solutions | [View →](TROUBLESHOOTING_RUNBOOK.md) |

### Guides & Tutorials

| Guide | Purpose | Audience |
|-------|---------|----------|
| [**Quick Start**](../QUICKSTART.md) | Get running in 5 minutes | Everyone |
| [**Experiment Tracking**](EXPERIMENT_TRACKING_GUIDE.md) | Run optimization experiments | DevOps/SRE |
| [**Docker Monitoring**](DOCKER-MONITORING-GUIDE.md) | Container metrics setup | DevOps |
| [**Production Setup**](production-setup.md) | Production best practices | SysAdmin |

### Advanced Topics

| Topic | Description | Link |
|-------|-------------|------|
| [**Advanced Scenarios**](ADVANCED_SCENARIOS.md) | Complex configurations | [View →](ADVANCED_SCENARIOS.md) |
| [**Migration Guide**](migration-from-v1.md) | Upgrade from v1 | [View →](migration-from-v1.md) |
| [**NRDOT v2 Update Plan**](nrdot-v2-production-update-plan.md) | Rollout strategy | [View →](nrdot-v2-production-update-plan.md) |

---

## 🚀 Quick Navigation

<table>
<tr>
<td width="33%">

### 🎯 Getting Started
- [Environment Setup](../QUICKSTART.md#environment-setup)
- [First Experiment](EXPERIMENT_TRACKING_GUIDE.md#quick-start)
- [View Metrics](../README.md#essential-commands)

</td>
<td width="33%">

### 🔧 Configuration
- [Optimization Profiles](../README.md#optimization-profiles)
- [Environment Variables](deployment-guide.md#environment-variables)
- [Docker Setup](DOCKER-MONITORING-GUIDE.md)

</td>
<td width="33%">

### 📊 Operations
- [Health Checks](deployment-guide.md#health-checks)
- [Monitoring](production-setup.md#monitoring)
- [Troubleshooting](TROUBLESHOOTING_RUNBOOK.md)

</td>
</tr>
</table>

---

## 🏗️ System Overview

DashBuilder is a comprehensive platform that combines:

### NRDOT v2 Process Optimization
- **Smart Filtering**: OS-aware process classification
- **Dynamic Profiles**: Automatic optimization based on cost/coverage
- **Real-time Monitoring**: Track savings and coverage metrics
- **Anomaly Detection**: EWMA-based unusual behavior identification

### Dashboard Management
- **Automated Creation**: Generate dashboards from templates
- **Schema Validation**: Ensure dashboard compatibility
- **Version Control**: Track dashboard changes
- **Bulk Operations**: Manage multiple dashboards

### Experiment Framework
- **A/B Testing**: Compare optimization profiles
- **Metric Collection**: Automated performance tracking
- **Results Analysis**: Visualize optimization impact
- **Reproducible**: Consistent experiment execution

---

## 📋 By Role

### For DevOps Engineers
1. Start with [Deployment Guide](deployment-guide.md)
2. Set up [Docker Monitoring](DOCKER-MONITORING-GUIDE.md)
3. Configure [Production Setup](production-setup.md)
4. Review [Troubleshooting](TROUBLESHOOTING_RUNBOOK.md)

### For Developers
1. Read [Architecture](architecture.md)
2. Explore [API Reference](api-reference.md)
3. Check [Dashboard Generator](../dashboard-generator/README.md)
4. Review [CLI Tools](../scripts/README.md)

### For Data Analysts
1. Learn [Experiment Tracking](EXPERIMENT_TRACKING_GUIDE.md)
2. Understand [Optimization Profiles](../README.md#optimization-profiles)
3. Analyze [Metrics](api-reference.md#metrics)
4. Create [Dashboards](../dashboard-generator/README.md)

---

## 🔍 Search by Topic

<details>
<summary><strong>NRDOT Optimization</strong></summary>

- [Process Filtering](architecture.md#optimization-profiles)
- [Control Loop](architecture.md#4-nrdot-control-loop)
- [Cost Reduction](../README.md#optimization-profiles)
- [Coverage Metrics](EXPERIMENT_TRACKING_GUIDE.md#key-metrics)

</details>

<details>
<summary><strong>Dashboard Management</strong></summary>

- [Dashboard Generator](architecture.md#1-dashboard-generator)
- [Template Engine](../dashboard-generator/README.md)
- [Schema Validation](api-reference.md#schema-validation)
- [Bulk Operations](api-reference.md#bulk-operations)

</details>

<details>
<summary><strong>Experiments</strong></summary>

- [Running Experiments](EXPERIMENT_TRACKING_GUIDE.md#running-experiments)
- [Profile Comparison](EXPERIMENT_TRACKING_GUIDE.md#profile-configuration)
- [Results Analysis](EXPERIMENT_TRACKING_GUIDE.md#analyzing-results)
- [Best Practices](EXPERIMENT_TRACKING_GUIDE.md#best-practices)

</details>

---

## 🎯 Learning Paths

### Path 1: Quick Implementation
1. [Quick Start](../QUICKSTART.md) - Get running fast
2. [Run Experiment](EXPERIMENT_TRACKING_GUIDE.md#quick-experiment) - Test optimization
3. [View Results](../README.md#essential-commands) - Check metrics

### Path 2: Production Deployment
1. [Architecture](architecture.md) - Understand the system
2. [Deployment Guide](deployment-guide.md) - Deploy properly
3. [Production Setup](production-setup.md) - Best practices
4. [Monitoring](DOCKER-MONITORING-GUIDE.md) - Observe performance

### Path 3: Advanced Optimization
1. [Advanced Scenarios](ADVANCED_SCENARIOS.md) - Complex setups
2. [Experiment Design](EXPERIMENT_TRACKING_GUIDE.md) - Thorough testing
3. [Custom Profiles](architecture.md#optimization-profiles) - Fine-tuning

---

## 📞 Support & Resources

### Internal Resources
- [Project README](../README.md)
- [Project Status](../PROJECT-STATUS.md)
- [Project Structure](../PROJECT-STRUCTURE.md)

### Component Documentation
- [Dashboard Generator](../dashboard-generator/README.md)
- [Experiment Framework](../experiments/README.md)
- [CLI Documentation](../scripts/README.md)
- [DevStack Guide](../devstack/README.md)

### Getting Help
- Check [Troubleshooting](TROUBLESHOOTING_RUNBOOK.md)
- Review [Advanced Scenarios](ADVANCED_SCENARIOS.md)
- Search codebase for examples

---

<div align="center">

**Ready to reduce telemetry costs?** Start with the [Quick Start Guide](../QUICKSTART.md) →

*Last Updated: November 2024 | DashBuilder v2.0*

</div>