# Control Loop Implementation

[← Configuration](02-configuration.md) | [Index](index.md) | [Cross-Platform →](04-cross-platform.md)

---

## Table of Contents

- [Control Loop Architecture](#control-loop-architecture)
- [Event System](#event-system)
- [State Management](#state-management)
- [Configuration Reconciliation](#configuration-reconciliation)
- [Error Handling & Recovery](#error-handling--recovery)
- [API Reference](#api-reference)
- [Plugins & Extensions](#plugins--extensions)
- [Performance Optimization](#performance-optimization)
- [Debugging & Troubleshooting](#debugging--troubleshooting)

---

## Control Loop Architecture

The NRDOT v2 control loop implements a modern, event-driven architecture that ensures configuration consistency and system reliability. It operates on a continuous reconciliation model, constantly comparing desired state with actual state.

```
┌─────────────────────────────────────────────────────────┐
│                   Control Loop Core                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────┐     ┌─────────────┐     ┌──────────┐ │
│  │   Watcher   │────▶│   Event     │────▶│ Handler  │ │
│  │   Service   │     │   Queue     │     │  Chain   │ │
│  └─────────────┘     └─────────────┘     └──────────┘ │
│         ▲                                       │       │
│         │                                       ▼       │
│  ┌─────────────┐     ┌─────────────┐     ┌──────────┐ │
│  │    State    │◀────│ Reconciler  │◀────│ Applier  │ │
│  │    Store    │     │   Engine    │     │ Service  │ │
│  └─────────────┘     └─────────────┘     └──────────┘ │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Core Components

```python
# control_loop/core.py
from typing import Dict, List, Optional
from dataclasses import dataclass
import asyncio

@dataclass
class ControlLoopConfig:
    """Control loop configuration"""
    reconcile_interval: int = 30  # seconds
    max_retry_attempts: int = 3
    event_buffer_size: int = 1000
    worker_pool_size: int = 10
    
class ControlLoop:
    """Main control loop implementation"""
    
    def __init__(self, config: ControlLoopConfig):
        self.config = config
        self.event_queue = asyncio.Queue(maxsize=config.event_buffer_size)
        self.state_store = StateStore()
        self.reconciler = Reconciler()
        self.running = False
        
    async def start(self):
        """Start the control loop"""
        self.running = True
        
        # Start all components
        tasks = [
            self._watch_loop(),
            self._event_processor(),
            self._reconciliation_loop(),
            self._health_monitor()
        ]
        
        await asyncio.gather(*tasks)
        
    async def _watch_loop(self):
        """Watch for configuration changes"""
        watcher = ConfigWatcher()
        
        async for event in watcher.watch():
            await self.event_queue.put(event)
            
    async def _event_processor(self):
        """Process events from the queue"""
        while self.running:
            event = await self.event_queue.get()
            
            try:
                await self._handle_event(event)
            except Exception as e:
                logger.error(f"Event processing error: {e}")
                await self._handle_error(event, e)
```

---

## Event System

### Event Types

```python
# events/types.py
from enum import Enum
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict

class EventType(Enum):
    """Supported event types"""
    CONFIG_CREATED = "config.created"
    CONFIG_UPDATED = "config.updated"
    CONFIG_DELETED = "config.deleted"
    BACKEND_HEALTH_CHANGED = "backend.health.changed"
    CERTIFICATE_EXPIRING = "certificate.expiring"
    RATE_LIMIT_EXCEEDED = "rate_limit.exceeded"
    SYSTEM_ERROR = "system.error"

@dataclass
class Event:
    """Base event structure"""
    id: str
    type: EventType
    timestamp: datetime
    source: str
    data: Dict[str, Any]
    metadata: Dict[str, Any] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert event to dictionary"""
        return {
            "id": self.id,
            "type": self.type.value,
            "timestamp": self.timestamp.isoformat(),
            "source": self.source,
            "data": self.data,
            "metadata": self.metadata or {}
        }
```

### Event Handlers

```python
# events/handlers.py
from abc import ABC, abstractmethod
from typing import List

class EventHandler(ABC):
    """Abstract event handler"""
    
    @abstractmethod
    async def handle(self, event: Event) -> None:
        """Handle the event"""
        pass
        
    @abstractmethod
    def can_handle(self, event: Event) -> bool:
        """Check if handler can process this event"""
        pass

class ConfigUpdateHandler(EventHandler):
    """Handle configuration update events"""
    
    def __init__(self, nginx_manager: NginxManager):
        self.nginx_manager = nginx_manager
        
    def can_handle(self, event: Event) -> bool:
        return event.type == EventType.CONFIG_UPDATED
        
    async def handle(self, event: Event) -> None:
        """Apply configuration update"""
        config = event.data.get("configuration")
        
        # Validate configuration
        if not await self._validate_config(config):
            raise ValidationError("Invalid configuration")
            
        # Apply to Nginx
        await self.nginx_manager.apply_config(config)
        
        # Verify application
        if not await self.nginx_manager.verify_config():
            await self.nginx_manager.rollback()
            raise ApplicationError("Configuration verification failed")
```

### Event Pipeline

```yaml
# Event processing pipeline configuration
event_pipeline:
  stages:
    - name: validation
      handlers:
        - SchemaValidator
        - SecurityValidator
        
    - name: enrichment
      handlers:
        - MetadataEnricher
        - ContextBuilder
        
    - name: processing
      handlers:
        - ConfigUpdateHandler
        - HealthCheckHandler
        - AlertingHandler
        
    - name: persistence
      handlers:
        - EventLogger
        - MetricsCollector
```

---

## State Management

### State Store Implementation

```python
# state/store.py
from typing import Optional, Dict, Any
import asyncio
import json

class StateStore:
    """Distributed state store for control loop"""
    
    def __init__(self, backend: str = "redis"):
        self.backend = self._init_backend(backend)
        self.cache = {}
        self.lock = asyncio.Lock()
        
    async def get(self, key: str) -> Optional[Dict[str, Any]]:
        """Get state by key"""
        # Check cache first
        if key in self.cache:
            return self.cache[key]
            
        # Fetch from backend
        async with self.lock:
            value = await self.backend.get(key)
            if value:
                self.cache[key] = json.loads(value)
                return self.cache[key]
                
        return None
        
    async def set(self, key: str, value: Dict[str, Any], ttl: int = None):
        """Set state with optional TTL"""
        async with self.lock:
            # Update cache
            self.cache[key] = value
            
            # Persist to backend
            await self.backend.set(
                key, 
                json.dumps(value),
                expire=ttl
            )
            
    async def watch(self, pattern: str):
        """Watch for state changes"""
        async for key, value in self.backend.subscribe(pattern):
            yield key, json.loads(value)
```

### State Synchronization

```python
# state/sync.py
class StateSynchronizer:
    """Synchronize state across multiple instances"""
    
    def __init__(self, state_store: StateStore):
        self.state_store = state_store
        self.peers = []
        self.sync_interval = 10  # seconds
        
    async def sync_loop(self):
        """Main synchronization loop"""
        while True:
            try:
                await self._sync_with_peers()
                await asyncio.sleep(self.sync_interval)
            except Exception as e:
                logger.error(f"Sync error: {e}")
                
    async def _sync_with_peers(self):
        """Synchronize state with peer instances"""
        local_state = await self._get_local_state()
        
        for peer in self.peers:
            try:
                peer_state = await peer.get_state()
                merged_state = self._merge_states(local_state, peer_state)
                await self._apply_merged_state(merged_state)
            except Exception as e:
                logger.warning(f"Failed to sync with {peer}: {e}")
```

---

## Configuration Reconciliation

### Reconciliation Engine

```python
# reconciler/engine.py
class ReconciliationEngine:
    """Core reconciliation engine"""
    
    def __init__(self):
        self.desired_state = {}
        self.actual_state = {}
        self.reconcilers = []
        
    async def reconcile(self) -> ReconciliationResult:
        """Reconcile desired vs actual state"""
        differences = self._compute_diff()
        
        if not differences:
            return ReconciliationResult(success=True, changes=[])
            
        # Plan changes
        plan = self._create_plan(differences)
        
        # Execute plan
        results = []
        for action in plan.actions:
            try:
                result = await self._execute_action(action)
                results.append(result)
            except Exception as e:
                logger.error(f"Action failed: {e}")
                if action.critical:
                    await self._rollback(results)
                    raise
                    
        return ReconciliationResult(
            success=True,
            changes=results
        )
```

### Reconciliation Strategies

```yaml
# Reconciliation strategies configuration
reconciliation:
  strategies:
    - name: immediate
      description: "Apply changes immediately"
      conditions:
        - priority: critical
        - type: security_update
        
    - name: batched
      description: "Batch changes for efficiency"
      batch_size: 10
      batch_timeout: 30s
      conditions:
        - priority: normal
        - type: configuration_update
        
    - name: scheduled
      description: "Apply during maintenance window"
      schedule: "0 2 * * *"  # 2 AM daily
      conditions:
        - priority: low
        - type: optimization
```

---

## Error Handling & Recovery

### Error Recovery Patterns

```python
# recovery/patterns.py
class RecoveryStrategy(ABC):
    """Base recovery strategy"""
    
    @abstractmethod
    async def recover(self, error: Exception, context: Dict) -> bool:
        """Attempt recovery from error"""
        pass

class ExponentialBackoffRecovery(RecoveryStrategy):
    """Exponential backoff recovery strategy"""
    
    def __init__(self, max_retries: int = 5, base_delay: float = 1.0):
        self.max_retries = max_retries
        self.base_delay = base_delay
        
    async def recover(self, error: Exception, context: Dict) -> bool:
        """Recover with exponential backoff"""
        attempt = context.get("attempt", 0)
        
        if attempt >= self.max_retries:
            return False
            
        delay = self.base_delay * (2 ** attempt)
        await asyncio.sleep(delay)
        
        # Update context
        context["attempt"] = attempt + 1
        
        return True

class CircuitBreakerRecovery(RecoveryStrategy):
    """Circuit breaker pattern for recovery"""
    
    def __init__(self, failure_threshold: int = 5, timeout: int = 60):
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.failures = 0
        self.last_failure = None
        self.state = "closed"  # closed, open, half-open
```

### Health Monitoring

```python
# health/monitor.py
class HealthMonitor:
    """System health monitoring"""
    
    def __init__(self):
        self.checks = []
        self.status = HealthStatus.HEALTHY
        
    async def run_checks(self) -> HealthReport:
        """Run all health checks"""
        results = []
        
        for check in self.checks:
            try:
                result = await check.execute()
                results.append(result)
            except Exception as e:
                results.append(HealthCheckResult(
                    name=check.name,
                    status=HealthStatus.UNHEALTHY,
                    error=str(e)
                ))
                
        # Determine overall status
        self.status = self._calculate_status(results)
        
        return HealthReport(
            status=self.status,
            checks=results,
            timestamp=datetime.utcnow()
        )
```

---

## API Reference

### REST API Endpoints

```yaml
# API endpoint definitions
api:
  version: v2
  base_path: /api/v2
  
  endpoints:
    # Configuration management
    - path: /config
      methods: [GET, POST, PUT, DELETE]
      description: "Manage configurations"
      
    - path: /config/{id}
      methods: [GET, PUT, DELETE]
      description: "Manage specific configuration"
      
    # Backend management
    - path: /backends
      methods: [GET, POST]
      description: "List and create backends"
      
    - path: /backends/{id}/health
      methods: [GET]
      description: "Get backend health status"
      
    # Control loop operations
    - path: /control/status
      methods: [GET]
      description: "Get control loop status"
      
    - path: /control/reconcile
      methods: [POST]
      description: "Trigger manual reconciliation"
```

### WebSocket API

```javascript
// WebSocket connection for real-time updates
const ws = new WebSocket('wss://nrdot.example.com/ws');

// Subscribe to events
ws.send(JSON.stringify({
    action: 'subscribe',
    topics: ['config.changes', 'health.updates']
}));

// Handle incoming events
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    switch(data.type) {
        case 'config.updated':
            handleConfigUpdate(data.payload);
            break;
            
        case 'backend.health.changed':
            handleHealthChange(data.payload);
            break;
    }
};
```

---

## Plugins & Extensions

### Plugin Architecture

```python
# plugins/base.py
class Plugin(ABC):
    """Base plugin interface"""
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Plugin name"""
        pass
        
    @property
    @abstractmethod
    def version(self) -> str:
        """Plugin version"""
        pass
        
    @abstractmethod
    async def initialize(self, context: PluginContext) -> None:
        """Initialize plugin"""
        pass
        
    @abstractmethod
    async def execute(self, event: Event) -> Optional[Event]:
        """Execute plugin logic"""
        pass

# Example custom plugin
class CustomHealthChecker(Plugin):
    """Custom health check plugin"""
    
    @property
    def name(self) -> str:
        return "custom-health-checker"
        
    @property
    def version(self) -> str:
        return "1.0.0"
        
    async def initialize(self, context: PluginContext) -> None:
        self.config = context.config
        self.http_client = context.http_client
        
    async def execute(self, event: Event) -> Optional[Event]:
        if event.type != EventType.HEALTH_CHECK_REQUESTED:
            return None
            
        # Perform custom health check
        result = await self._check_custom_endpoint()
        
        return Event(
            type=EventType.HEALTH_CHECK_COMPLETED,
            data={"result": result}
        )
```

### Plugin Configuration

```yaml
# Plugin configuration
plugins:
  enabled: true
  directory: /etc/nrdot/plugins
  
  # Installed plugins
  installed:
    - name: custom-health-checker
      enabled: true
      config:
        endpoint: "https://api.example.com/health"
        timeout: 5s
        
    - name: slack-notifier
      enabled: true
      config:
        webhook_url: "${SLACK_WEBHOOK_URL}"
        channels:
          - "#nrdot-alerts"
          - "#ops"
```

---

## Performance Optimization

### Optimization Strategies

```python
# performance/optimizer.py
class PerformanceOptimizer:
    """Control loop performance optimization"""
    
    def __init__(self):
        self.metrics = MetricsCollector()
        self.cache = LRUCache(maxsize=1000)
        
    async def optimize_event_processing(self):
        """Optimize event processing pipeline"""
        # Batch similar events
        events = await self._batch_events()
        
        # Process in parallel
        tasks = [
            self._process_event_batch(batch)
            for batch in events
        ]
        
        await asyncio.gather(*tasks)
        
    def enable_caching(self):
        """Enable aggressive caching"""
        @cache.memoize(ttl=300)
        async def get_backend_status(backend_id: str):
            return await self._fetch_backend_status(backend_id)
```

### Performance Metrics

```yaml
# Performance monitoring configuration
performance:
  metrics:
    - name: event_processing_time
      type: histogram
      buckets: [0.01, 0.05, 0.1, 0.5, 1.0, 5.0]
      
    - name: reconciliation_duration
      type: histogram
      buckets: [1, 5, 10, 30, 60, 300]
      
    - name: memory_usage
      type: gauge
      
    - name: event_queue_size
      type: gauge
      
  thresholds:
    event_processing_time:
      p99: 500ms
      alert: true
      
    memory_usage:
      max: 1GB
      alert: true
```

---

## Debugging & Troubleshooting

### Debug Configuration

```yaml
# Debug configuration
debug:
  enabled: true
  level: DEBUG
  
  # Component-specific debugging
  components:
    control_loop:
      enabled: true
      trace_events: true
      
    reconciler:
      enabled: true
      log_diffs: true
      
    state_store:
      enabled: true
      log_operations: true
      
  # Debug endpoints
  endpoints:
    - path: /debug/events
      description: "View event stream"
      
    - path: /debug/state
      description: "Inspect state store"
      
    - path: /debug/metrics
      description: "View internal metrics"
```

### Troubleshooting Guide

| Issue | Symptoms | Solution |
|-------|----------|----------|
| **Event Processing Delays** | High event queue size | Scale worker pool, optimize handlers |
| **Reconciliation Loops** | Continuous reconciliation | Check for configuration conflicts |
| **State Inconsistency** | Mismatched desired/actual state | Force full reconciliation |
| **Memory Leaks** | Increasing memory usage | Enable profiling, check for circular references |

### Debug Tools

```bash
# Control loop debugging commands
nrdot debug events --tail           # Stream events
nrdot debug state --key backend/*   # Inspect state
nrdot debug trace --component reconciler  # Trace execution
nrdot debug profile --duration 60   # Profile for 60 seconds
```

---

<div align="center">

[← Configuration](02-configuration.md) | [Index](index.md) | [Cross-Platform →](04-cross-platform.md)

*NRDOT v2.0 Documentation - Control Loop Implementation*

</div>