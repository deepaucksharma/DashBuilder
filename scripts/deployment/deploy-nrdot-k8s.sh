#!/bin/bash
# NRDOT v2 Kubernetes Deployment Script
# Handles complete deployment with validation

set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
NAMESPACE="nrdot-system"
K8S_DIR="distributions/nrdot-plus/k8s"
CONFIG_DIR="distributions/nrdot-plus/config"

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl not found. Please install kubectl."
        exit 1
    fi
    
    # Check cluster connection
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster. Please check your kubeconfig."
        exit 1
    fi
    
    # Check for license key
    if [[ -z "${NEW_RELIC_LICENSE_KEY:-}" ]]; then
        log_error "NEW_RELIC_LICENSE_KEY environment variable not set."
        echo "Please export NEW_RELIC_LICENSE_KEY=your-license-key"
        exit 1
    fi
    
    log_info "Prerequisites check passed."
}

create_namespace() {
    log_info "Creating namespace..."
    kubectl apply -f "$K8S_DIR/namespace.yaml"
}

create_secret() {
    log_info "Creating license key secret..."
    kubectl create secret generic nrdot-license \
        -n "$NAMESPACE" \
        --from-literal=license-key="$NEW_RELIC_LICENSE_KEY" \
        --dry-run=client -o yaml | kubectl apply -f -
}

deploy_nrdot() {
    log_info "Deploying NRDOT v2..."
    
    # Check if using kustomize
    if command -v kustomize &> /dev/null; then
        log_info "Using kustomize for deployment..."
        kustomize build "$K8S_DIR" | kubectl apply -f -
    else
        log_info "Applying manifests directly..."
        kubectl apply -f "$K8S_DIR/rbac.yaml"
        kubectl apply -f "$K8S_DIR/configmap.yaml"
        kubectl apply -f "$K8S_DIR/daemonset.yaml"
        kubectl apply -f "$K8S_DIR/service.yaml"
        
        # Optional: monitoring
        if kubectl api-resources | grep -q "servicemonitors.monitoring.coreos.com"; then
            log_info "Prometheus Operator detected, applying monitoring..."
            kubectl apply -f "$K8S_DIR/monitoring.yaml"
        else
            log_warn "Prometheus Operator not detected, skipping monitoring setup."
        fi
    fi
}

wait_for_rollout() {
    log_info "Waiting for rollout to complete..."
    kubectl rollout status -n "$NAMESPACE" daemonset/nrdot-collector --timeout=300s
}

validate_deployment() {
    log_info "Validating deployment..."
    
    # Check pods
    local pod_count=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=nrdot --no-headers | wc -l)
    local running_count=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=nrdot --field-selector=status.phase=Running --no-headers | wc -l)
    
    if [[ $pod_count -eq 0 ]]; then
        log_error "No NRDOT pods found!"
        return 1
    fi
    
    if [[ $running_count -ne $pod_count ]]; then
        log_warn "Not all pods are running. Expected: $pod_count, Running: $running_count"
        kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=nrdot
        return 1
    fi
    
    log_info "All $pod_count pods are running."
    
    # Check metrics endpoint
    log_info "Checking metrics endpoint..."
    local pod_name=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=nrdot -o jsonpath='{.items[0].metadata.name}')
    
    if kubectl exec -n "$NAMESPACE" "$pod_name" -- wget -O- -q http://localhost:8889/metrics | grep -q "otelcol_process_uptime"; then
        log_info "Metrics endpoint is responding correctly."
    else
        log_warn "Metrics endpoint check failed."
    fi
    
    # Check logs for errors
    log_info "Checking logs for errors..."
    local error_count=$(kubectl logs -n "$NAMESPACE" -l app.kubernetes.io/name=nrdot --tail=100 | grep -i "error" | wc -l || true)
    if [[ $error_count -gt 0 ]]; then
        log_warn "Found $error_count error messages in logs. Please review:"
        kubectl logs -n "$NAMESPACE" -l app.kubernetes.io/name=nrdot --tail=20
    else
        log_info "No errors found in recent logs."
    fi
}

show_status() {
    log_info "Deployment Status:"
    echo
    kubectl get all -n "$NAMESPACE" -l app.kubernetes.io/name=nrdot
    echo
    log_info "To view logs: kubectl logs -n $NAMESPACE -l app.kubernetes.io/name=nrdot -f"
    log_info "To port-forward metrics: kubectl port-forward -n $NAMESPACE daemonset/nrdot-collector 8889:8889"
}

cleanup() {
    log_warn "Cleaning up NRDOT deployment..."
    kubectl delete -k "$K8S_DIR" 2>/dev/null || true
    kubectl delete namespace "$NAMESPACE" 2>/dev/null || true
}

# Main execution
main() {
    case "${1:-deploy}" in
        deploy)
            check_prerequisites
            create_namespace
            create_secret
            deploy_nrdot
            wait_for_rollout
            validate_deployment
            show_status
            ;;
        validate)
            validate_deployment
            show_status
            ;;
        cleanup)
            cleanup
            ;;
        status)
            show_status
            ;;
        *)
            echo "Usage: $0 [deploy|validate|cleanup|status]"
            exit 1
            ;;
    esac
}

# Run main
main "$@"