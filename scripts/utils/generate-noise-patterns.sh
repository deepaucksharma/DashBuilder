#!/bin/bash
# Generate noise patterns file for OTel collector receiver configuration
# This script extracts OS-specific noise patterns from optimization.yaml
# and creates a flat YAML list for the hostmetrics receiver exclude filter

set -euo pipefail

# Configuration
OPTIMIZATION_FILE="${OPTIMIZATION_FILE:-/etc/nrdot-collector-host/optimization.yaml}"
OUTPUT_FILE="${OUTPUT_FILE:-/var/lib/nrdot/noise_patterns.yaml}"
OS_TYPE="${OS_TYPE:-$(uname -s | tr '[:upper:]' '[:lower:]')}"

# Ensure required tools are available
for tool in yq; do
    if ! command -v "$tool" &> /dev/null; then
        echo "Error: $tool is required but not installed" >&2
        exit 1
    fi
done

# Create output directory if it doesn't exist
mkdir -p "$(dirname "$OUTPUT_FILE")"

# Validate optimization file exists
if [[ ! -f "$OPTIMIZATION_FILE" ]]; then
    echo "Error: Optimization file not found: $OPTIMIZATION_FILE" >&2
    exit 1
fi

# Map OS type to optimization.yaml key
case "$OS_TYPE" in
    linux)
        OS_KEY="linux"
        ;;
    darwin)
        OS_KEY="darwin"
        ;;
    windows*)
        OS_KEY="windows"
        ;;
    *)
        echo "Warning: Unknown OS type '$OS_TYPE', defaulting to linux patterns" >&2
        OS_KEY="linux"
        ;;
esac

echo "Generating noise patterns for OS: $OS_KEY"

# Check if we have the new flattened noise_patterns list first
FLAT_PATTERNS=$(yq eval '.noise_patterns[]' "$OPTIMIZATION_FILE" 2>/dev/null || echo "")

if [[ -n "$FLAT_PATTERNS" ]]; then
    # Use the flattened list if available
    echo "Using flattened noise patterns from optimization.yaml"
    COMMON_PATTERNS=""
    OS_PATTERNS="$FLAT_PATTERNS"
else
    # Fall back to hierarchical structure
    echo "Using hierarchical noise patterns (legacy mode)"
    # Extract common noise patterns
    COMMON_PATTERNS=$(yq eval '.process_classification.noise.patterns.common[]' "$OPTIMIZATION_FILE" 2>/dev/null || echo "")
    
    # Extract OS-specific noise patterns
    OS_PATTERNS=$(yq eval ".process_classification.noise.patterns.${OS_KEY}[]" "$OPTIMIZATION_FILE" 2>/dev/null || echo "")
fi

# Combine patterns and write to output file
{
    echo "# Auto-generated noise patterns for hostmetrics receiver"
    echo "# Generated at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo "# Source: $OPTIMIZATION_FILE"
    echo "# OS: $OS_KEY"
    echo ""
    
    # Write common patterns
    if [[ -n "$COMMON_PATTERNS" ]]; then
        echo "# Common patterns"
        echo "$COMMON_PATTERNS" | while IFS= read -r pattern; do
            [[ -n "$pattern" ]] && echo "- \"$pattern\""
        done
    fi
    
    # Write OS-specific patterns
    if [[ -n "$OS_PATTERNS" ]]; then
        echo ""
        echo "# OS-specific patterns ($OS_KEY)"
        echo "$OS_PATTERNS" | while IFS= read -r pattern; do
            [[ -n "$pattern" ]] && echo "- \"$pattern\""
        done
    fi
} > "$OUTPUT_FILE"

# Validate the output file was created and has content
if [[ ! -s "$OUTPUT_FILE" ]]; then
    echo "Warning: Generated file is empty. Using default patterns." >&2
    cat > "$OUTPUT_FILE" <<EOF
# Default noise patterns (fallback)
- "^ps$"
- "^ls$"
- "^cat$"
- "^grep$"
- "^awk$"
- "^sed$"
- "^find$"
- "^sleep$"
EOF
fi

echo "Noise patterns generated successfully: $OUTPUT_FILE"

# Display the generated patterns for verification
echo "Generated patterns:"
cat "$OUTPUT_FILE"

# Ensure proper permissions for collector to read
if [[ -w "$OUTPUT_FILE" ]]; then
    chmod 644 "$OUTPUT_FILE"
fi

# Optionally validate the YAML syntax
if command -v yamllint &> /dev/null; then
    if yamllint -d relaxed "$OUTPUT_FILE" &> /dev/null; then
        echo "YAML validation: PASSED"
    else
        echo "Warning: YAML validation failed, but continuing" >&2
    fi
fi

exit 0