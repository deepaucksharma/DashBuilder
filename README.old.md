# DashBuilder with NRDOT v2

A comprehensive platform for New Relic dashboard management integrated with NRDOT v2 (New Relic Dot) process optimization. Achieve **70-85% telemetry cost reduction** while maintaining **95%+ critical process coverage**.

## 🚀 Quick Start

```bash
# Clone and setup
git clone https://github.com/yourusername/dashbuilder.git
cd dashbuilder
./setup.sh

# Run with Docker
docker-compose up

# Or run specific services
docker-compose up dashbuilder nrdot-collector control-loop
```

## 📋 Features

- **Cost Optimization**: 70-85% reduction in telemetry costs
- **Smart Filtering**: Dynamic process filtering based on resource usage
- **Real-time Control Loop**: Continuous optimization with configurable profiles
- **Dashboard Management**: Create, deploy, and manage New Relic dashboards
- **Multi-Profile Support**: Baseline, Conservative, Balanced, and Aggressive modes
- **Docker & Kubernetes Ready**: Production-grade containerization

## 🏗️ Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   DashBuilder   │────▶│ NRDOT Collector  │────▶│   New Relic     │
│   Orchestrator  │     │   (OTEL)         │     │   Platform      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       ▲
         │                       │
         └──────────────┐        │
                        ▼        │
                 ┌─────────────────┐
                 │  Control Loop    │
                 │  (Optimization)  │
                 └─────────────────┘
```

## 📦 Installation

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- New Relic License Key
- New Relic API Key

### Environment Setup
```bash
cp .env.example .env
# Edit .env with your New Relic credentials
```

### Install Dependencies
```bash
npm run install:all
```

## 🔧 Configuration

### Optimization Profiles

| Profile | Coverage | Cost Reduction | Use Case |
|---------|----------|----------------|----------|
| Baseline | 100% | 0% | Full visibility |
| Conservative | 95% | 30% | Production systems |
| Balanced | 90% | 50% | Most workloads |
| Aggressive | 80% | 70% | Cost-sensitive |

### Docker Compose Options
```bash
# Run with specific profile
OPTIMIZATION_MODE=aggressive docker-compose up

# Adjust control loop interval (seconds)
CONTROL_LOOP_INTERVAL=600 docker-compose up

# Set resource thresholds
TARGET_CPU_THRESHOLD=80 TARGET_MEMORY_THRESHOLD=85 docker-compose up
```

## 📊 Dashboard Management

### Create Dashboard
```bash
npm run cli -- dashboard create ./examples/sample-dashboard.json
```

### List Dashboards
```bash
npm run cli -- dashboard list
```

### Deploy NRDOT Dashboard
```bash
npm run deploy:nrdot
```

## 🐳 Docker Usage

### Build Images
```bash
npm run docker:build
```

### Development Mode
```bash
npm run docker:dev
```

### Production Deployment
```bash
npm run docker:up
```

## 📈 Monitoring

Access metrics and monitoring:
- Prometheus metrics: http://localhost:8888/metrics
- OTLP gRPC: localhost:4317
- OTLP HTTP: localhost:4318

## 🧪 Testing

```bash
# Test New Relic connection
npm run test:connection

# Run all tests
npm test

# Validate setup
npm run validate:all
```

## 📁 Project Structure

See [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) for detailed directory layout.

## 📚 Documentation

See the [docs/](./docs/) directory for detailed documentation:
- [Configuration Guide](./docs/02-configuration.md)
- [Control Loop Details](./docs/03-control-loop.md)
- [Deployment Guide](./docs/06-deployment.md)
- [Troubleshooting](./docs/troubleshooting-guide.md)

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- OpenTelemetry Community
- New Relic Platform Team
- All contributors to this project