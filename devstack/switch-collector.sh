#!/bin/bash

# Script to easily switch between different collector distributions

echo "=== Collector Distribution Switcher ==="
echo ""
echo "Available collector profiles:"
echo "1) NRDOT Host Collector"
echo "2) NRDOT K8s Collector"
echo "3) OpenTelemetry Contrib"
echo "4) Custom (edit collector-config.env)"
echo ""

read -p "Select collector profile (1-4): " choice

case $choice in
    1)
        echo "Switching to NRDOT Host Collector..."
        cp collector-profiles/nrdot-host.env collector-config.env
        echo "✓ Configured for NRDOT Host Collector"
        ;;
    2)
        echo "Switching to NRDOT K8s Collector..."
        cp collector-profiles/nrdot-k8s.env collector-config.env
        echo "✓ Configured for NRDOT K8s Collector"
        ;;
    3)
        echo "Switching to OpenTelemetry Contrib..."
        cp collector-profiles/otel-contrib.env collector-config.env
        echo "✓ Configured for OpenTelemetry Contrib"
        ;;
    4)
        echo "Edit collector-config.env to configure your custom collector"
        exit 0
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
read -p "Deploy collectors now? (y/n): " deploy

if [ "$deploy" = "y" ] || [ "$deploy" = "Y" ]; then
    echo "Deploying collectors..."
    ./deploy-configurable-collectors.sh
else
    echo "Configuration saved. Run ./deploy-configurable-collectors.sh when ready."
fi