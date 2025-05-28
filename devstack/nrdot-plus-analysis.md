# NRDOT PLUS Override Analysis

## Potential Override Points

### 1. Configuration Structure
- **Config Location**: Different paths (`/etc/nrdot-plus/config.yaml`)
- **Config Format**: YAML extensions, additional sections
- **Config Merging**: Multiple config files, overlays
- **Dynamic Config**: Runtime configuration updates

### 2. Receivers
- **Additional Receivers**: Custom metrics sources
- **Enhanced Receivers**: Extended hostmetrics with more scrapers
- **Protocol Support**: Additional protocols (Prometheus, StatsD, etc.)
- **Discovery**: Service discovery mechanisms

### 3. Processors
- **Custom Processors**: Business logic processors
- **Enhanced Filtering**: Advanced metric filtering
- **Enrichment**: Additional attribute injection
- **Transformation**: Complex data transformations

### 4. Exporters
- **Multi-destination**: Send to multiple endpoints
- **Failover**: Primary/secondary endpoints
- **Custom Headers**: Additional authentication
- **Buffering**: Enhanced retry/queue mechanisms

### 5. Extensions
- **Authentication**: OAuth, mTLS, custom auth
- **Health Checks**: Enhanced monitoring endpoints
- **Feature Flags**: Runtime feature toggles
- **Service Registry**: Integration with service mesh

### 6. Environment Variables
```
# Standard NRDOT
OTEL_EXPORTER_OTLP_ENDPOINT
OTEL_EXPORTER_OTLP_HEADERS

# NRDOT PLUS might add
NRDOT_PLUS_FEATURES
NRDOT_PLUS_CLOUD_PROVIDER
NRDOT_PLUS_CLUSTER_NAME
NRDOT_PLUS_TENANT_ID
NRDOT_PLUS_CUSTOM_ENDPOINT
NRDOT_PLUS_SAMPLING_RATE
NRDOT_PLUS_BUFFER_SIZE
NRDOT_PLUS_PLUGIN_DIR
```

### 7. Command Line Arguments
```
# Standard
--config /path/to/config.yaml

# NRDOT PLUS might add
--feature-gates=feature1,feature2
--plugin-dir=/opt/nrdot-plus/plugins
--cloud-provider=aws
--enable-profiling
--custom-receivers=receiver1,receiver2
--override-config=/path/to/override.yaml
```

### 8. Volume Requirements
- Plugin directories
- Certificate stores
- Cache directories
- Custom config directories
- Cloud provider credentials

### 9. Network Requirements
- Additional ports for custom receivers
- Service mesh integration
- Cloud provider metadata endpoints
- Internal service communication

### 10. Security/Permissions
- Additional capabilities (CAP_NET_RAW, etc.)
- Security contexts
- File permissions
- Secret management integration