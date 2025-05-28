# Security Guidelines for NRDOT Deployment

## API Key Management

### DO NOT:
- ❌ Hardcode API keys in scripts
- ❌ Commit API keys to version control
- ❌ Use real API keys in examples
- ❌ Share API keys in logs or output

### DO:
- ✅ Use environment variables
- ✅ Use `.env` files (git-ignored)
- ✅ Use secret management systems
- ✅ Rotate keys regularly

## Example .env.template
```bash
# Copy this to .env and fill with your values
# NEVER commit .env to git

# New Relic Configuration
NEW_RELIC_LICENSE_KEY=your-license-key-ending-in-NRAL
NEW_RELIC_USER_API_KEY=your-user-api-key-starting-with-NRAK
NEW_RELIC_QUERY_KEY=your-query-key-starting-with-NRIQ
NEW_RELIC_ACCOUNT_ID=your-account-id

# Optional: NRDOT PLUS Configuration
NRDOT_PLUS_IMAGE=your-registry/nrdot-plus:tag
NRDOT_PLUS_AUTH_TOKEN=your-auth-token
```

## Secure Configuration Pattern

### 1. Environment Variable Loading
```bash
# Load from .env if exists
if [ -f .env ]; then
    source .env
fi

# Validate required variables
if [ -z "$NEW_RELIC_LICENSE_KEY" ]; then
    echo "ERROR: NEW_RELIC_LICENSE_KEY not set"
    exit 1
fi
```

### 2. Secret Provider Integration
```yaml
# For Kubernetes Secrets
apiVersion: v1
kind: Secret
metadata:
  name: nrdot-secrets
type: Opaque
data:
  license-key: <base64-encoded-key>
```

### 3. Vault Integration
```bash
# Example: HashiCorp Vault
export NEW_RELIC_LICENSE_KEY=$(vault kv get -field=license_key secret/newrelic)
```

## Docker Security

### Secure Volume Mounts
```bash
# Read-only mounts for sensitive paths
-v /etc/ssl/certs:/certs:ro
-v /proc:/host/proc:ro
```

### Non-root User
```bash
# Run as non-privileged user
--user 10001:10001
```

### Capability Restrictions
```bash
# Only add required capabilities
--cap-drop=ALL
--cap-add=SYS_PTRACE
```

## Network Security

### TLS Configuration
```yaml
exporters:
  otlphttp:
    endpoint: https://otlp.nr-data.net
    tls:
      insecure: false
      ca_file: /certs/ca.crt
      cert_file: /certs/client.crt
      key_file: /certs/client.key
```

### Firewall Rules
```bash
# Only allow required ports
-p 127.0.0.1:4317:4317  # Bind to localhost only
```

## Logging Security

### Sanitize Logs
```bash
# Remove sensitive data from logs
docker logs collector 2>&1 | sed 's/api-key=[^ ]*/api-key=REDACTED/g'
```

### Log Rotation
```bash
# Configure log rotation
--log-opt max-size=10m
--log-opt max-file=3
```

## Audit and Compliance

### Track Configuration Changes
```bash
# Version control configuration (without secrets)
git add collector-config.yaml
git commit -m "Update collector configuration"
```

### Regular Security Scans
```bash
# Scan for exposed secrets
grep -r "NRAK-\|NRIQ-\|NRAL" . --exclude-dir=.git
```

## Secret Rotation Process

1. Generate new API key in New Relic
2. Update .env file locally
3. Test with one collector
4. Roll out to all collectors
5. Revoke old API key

## Emergency Response

### If Keys Are Exposed:
1. Immediately revoke exposed keys
2. Generate new keys
3. Update all collectors
4. Audit access logs
5. Review security practices

## Best Practices Summary

1. **Least Privilege**: Only grant necessary permissions
2. **Defense in Depth**: Multiple security layers
3. **Regular Updates**: Keep collectors and dependencies updated
4. **Monitoring**: Watch for unauthorized access
5. **Documentation**: Keep security procedures documented