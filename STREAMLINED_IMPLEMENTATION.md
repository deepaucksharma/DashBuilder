# DashBuilder Streamlined Implementation Plan

## 🎯 Project Vision
A unified platform for New Relic dashboard management with NRDOT v2 process optimization, reducing telemetry costs by 70-85% while maintaining 95%+ critical process coverage.

---

## 📋 Current State Analysis

### ✅ What's Working
1. **NRDOT Distribution** - Complete, production-ready
2. **CLI Tool (nr-guardian)** - Functional with comprehensive commands
3. **Documentation** - Extensive guides and API references
4. **Configuration Templates** - Ready for deployment

### 🚧 What Needs Work
1. **Orchestrator** - Missing workflow implementations
2. **Browser Automation** - Chrome dependencies on WSL
3. **NR1 App** - Missing UUID and deployment config
4. **Integration Testing** - Minimal test coverage
5. **Monitoring Setup** - Not connected to actual systems

### ❌ What to Remove/Consolidate
1. Multiple configuration systems
2. Duplicate API client implementations
3. Redundant documentation
4. Unused monitoring configurations

---

## 🚀 Streamlined Implementation Path

### Phase 1: Core Foundation (Week 1)
**Goal**: Get basic functionality working end-to-end

#### 1.1 Centralize Configuration
```javascript
// orchestrator/lib/unified-config.js
export class UnifiedConfig {
  constructor() {
    this.sources = {
      env: process.env,
      files: {
        main: '.env',
        scripts: 'scripts/.env',
        automation: 'automation/.env'
      }
    };
  }
  
  async load() {
    // Single source of truth for all configs
    // Priority: ENV > .env > component-specific
  }
}
```

#### 1.2 Simplified Setup Script
```bash
#!/bin/bash
# setup.sh - One command to rule them all

echo "🚀 DashBuilder Quick Setup"

# 1. Check prerequisites
check_requirements() {
  command -v node >/dev/null 2>&1 || { echo "Node.js required"; exit 1; }
  command -v npm >/dev/null 2>&1 || { echo "npm required"; exit 1; }
}

# 2. Install dependencies
install_deps() {
  npm install --workspaces --if-present
}

# 3. Configure API keys
configure_keys() {
  read -p "New Relic API Key: " NR_API_KEY
  read -p "Account ID: " NR_ACCOUNT_ID
  
  cat > .env <<EOF
NEW_RELIC_API_KEY=$NR_API_KEY
NEW_RELIC_ACCOUNT_ID=$NR_ACCOUNT_ID
NEW_RELIC_REGION=US
EOF
}

# 4. Validate setup
validate() {
  npm run test:connection
}

# Run all
check_requirements && install_deps && configure_keys && validate
```

#### 1.3 Essential Commands Only
Focus on the most valuable operations:

```javascript
// Simplified CLI commands
const essentialCommands = {
  'validate-dashboard': 'Check dashboard health',
  'optimize-queries': 'Reduce query costs',
  'deploy-nrdot': 'Install NRDOT optimization',
  'check-coverage': 'Verify 95% process coverage'
};
```

### Phase 2: NRDOT Integration (Week 2)
**Goal**: Deploy and validate NRDOT optimization

#### 2.1 Automated NRDOT Deployment
```javascript
// orchestrator/workflows/deploy-nrdot.js
export async function deployNRDOT(options) {
  const steps = [
    'createOptimizationDashboard',
    'deployCollectorConfig',
    'validateProcessCoverage',
    'enableControlLoop'
  ];
  
  for (const step of steps) {
    await executeStep(step, options);
  }
}
```

#### 2.2 NRDOT Dashboard Template
```json
{
  "name": "NRDOT Process Optimization",
  "widgets": [
    {
      "title": "Cost Reduction",
      "query": "SELECT latest(nrdot_process_series_kept) / latest(nrdot_process_series_total) * 100 as 'Reduction %' FROM Metric"
    },
    {
      "title": "Process Coverage",
      "query": "SELECT latest(nrdot_process_coverage_critical) * 100 as 'Coverage %' FROM Metric"
    }
  ]
}
```

### Phase 3: Automation & Monitoring (Week 3)
**Goal**: Automate routine tasks and establish monitoring

#### 3.1 Daily Optimization Workflow
```javascript
// orchestrator/workflows/daily-optimization.js
export async function dailyOptimization() {
  // 1. Check current metrics
  const metrics = await getOptimizationMetrics();
  
  // 2. Adjust profiles if needed
  if (metrics.costPerHour > threshold) {
    await adjustProfile('aggressive');
  }
  
  // 3. Generate report
  await generateDailyReport(metrics);
  
  // 4. Send notifications
  await notifyStakeholders(metrics);
}
```

#### 3.2 Health Check System
```javascript
// monitoring/health-checks.js
const healthChecks = [
  {
    name: 'API Connectivity',
    check: async () => await testAPIConnection(),
    critical: true
  },
  {
    name: 'Process Coverage',
    check: async () => await checkProcessCoverage() > 0.95,
    critical: true
  },
  {
    name: 'Cost Targets',
    check: async () => await checkCostReduction() > 0.70,
    critical: false
  }
];
```

### Phase 4: Production Deployment (Week 4)
**Goal**: Deploy to production with confidence

#### 4.1 Deployment Checklist
```yaml
production_checklist:
  pre_deployment:
    - [ ] All tests passing
    - [ ] Documentation updated
    - [ ] Rollback plan ready
    - [ ] Stakeholders notified
  
  deployment:
    - [ ] Deploy to 10% of hosts
    - [ ] Monitor for 24 hours
    - [ ] Check error rates
    - [ ] Validate cost reduction
  
  post_deployment:
    - [ ] Full rollout
    - [ ] Enable automation
    - [ ] Schedule reviews
    - [ ] Document lessons learned
```

---

## 🔧 Simplified Architecture

```
┌─────────────────────────────────────────┐
│          DashBuilder Core               │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────┐    ┌─────────────┐   │
│  │   Setup     │───▶│   Deploy    │   │
│  │  (1 click)  │    │   (NRDOT)   │   │
│  └─────────────┘    └─────────────┘   │
│          │                   │         │
│          ▼                   ▼         │
│  ┌─────────────┐    ┌─────────────┐   │
│  │  Validate   │───▶│  Optimize   │   │
│  │ (Dashboard) │    │  (Queries)  │   │
│  └─────────────┘    └─────────────┘   │
│                                         │
└─────────────────────────────────────────┘
                    │
                    ▼
         ┌───────────────────┐
         │   New Relic API   │
         └───────────────────┘
```

---

## 📝 Implementation Priorities

### Must Have (P0)
1. **Working NRDOT deployment** - Core value proposition
2. **Dashboard validation** - Ensure quality
3. **Cost tracking** - Prove ROI
4. **Basic monitoring** - Know it's working

### Should Have (P1)
1. **Automated optimization** - Reduce manual work
2. **Slack notifications** - Stay informed
3. **Multi-account support** - Scale across org
4. **Performance analytics** - Continuous improvement

### Nice to Have (P2)
1. **Browser automation** - Full automation
2. **NR1 app deployment** - Native experience
3. **ML predictions** - Advanced optimization
4. **Custom visualizations** - Better insights

---

## 🎬 Quick Start Commands

```bash
# 1. Clone and setup
git clone https://github.com/deepaucksharma/DashBuilder.git
cd DashBuilder
./setup.sh

# 2. Deploy NRDOT
npm run deploy:nrdot

# 3. Validate setup
npm run validate:all

# 4. Start monitoring
npm run monitor:start
```

---

## 📊 Success Metrics

### Week 1
- ✅ Setup completed in <5 minutes
- ✅ First dashboard validated
- ✅ API connection verified

### Week 2
- ✅ NRDOT deployed to test environment
- ✅ 70%+ cost reduction achieved
- ✅ 95%+ process coverage maintained

### Week 3
- ✅ Automation running daily
- ✅ Alerts configured
- ✅ Reports generated

### Week 4
- ✅ Production deployment complete
- ✅ ROI demonstrated
- ✅ Team trained

---

## 🚨 Common Issues & Solutions

### Issue 1: API Key Permissions
```bash
# Test with minimal query
npm run cli -- nrql execute "SELECT count(*) FROM Transaction LIMIT 1"
# If fails: Check key has NerdGraph access
```

### Issue 2: WSL Chrome Issues
```bash
# Skip browser automation, use API-only mode
export DASHBUILDER_MODE=api-only
npm run setup
```

### Issue 3: High Memory Usage
```bash
# Limit concurrent operations
export MAX_CONCURRENT_OPERATIONS=5
npm run deploy:nrdot
```

---

## 🎯 Next Steps

1. **Immediate**: Run setup.sh and configure API keys
2. **Today**: Deploy NRDOT to one test host
3. **This Week**: Validate cost reduction
4. **Next Week**: Roll out to 20% of infrastructure
5. **Month**: Full production deployment

---

## 📞 Support

- **Documentation**: `/docs` folder
- **Examples**: `/examples` folder  
- **Issues**: GitHub Issues
- **Community**: Slack channel (coming soon)

---

*Streamlined for success - focusing on what matters most: reducing costs while maintaining visibility.*