# Makefile for NRDOT-Plus Distribution

VERSION := 2.0.0
DIST_NAME := nrdot-plus
BUILD_DIR := packaging/output
ARCH := $(shell uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')

.PHONY: all clean build package test install uninstall

all: build

clean:
	@echo "Cleaning build artifacts..."
	@rm -rf $(BUILD_DIR)
	@find . -name "*.pyc" -delete
	@find . -name "__pycache__" -delete

build: clean
	@echo "Building NRDOT-Plus distribution..."
	@mkdir -p $(BUILD_DIR)
	@bash packaging/build.sh

package: build
	@echo "Packages built in $(BUILD_DIR):"
	@ls -la $(BUILD_DIR)

test:
	@echo "Running tests..."
	@bash -n scripts/*.sh
	@echo "Validating YAML configs..."
	@yq eval '.' config/*.yaml > /dev/null
	@echo "All tests passed!"

install:
	@echo "Installing NRDOT-Plus..."
	@sudo bash install.sh

uninstall:
	@echo "Uninstalling NRDOT-Plus..."
	@sudo systemctl stop nrdot-plus-control-loop || true
	@sudo systemctl stop nrdot-plus || true
	@sudo apt-get remove -y nrdot-plus 2>/dev/null || \
	 sudo yum remove -y nrdot-plus 2>/dev/null || \
	 sudo dnf remove -y nrdot-plus 2>/dev/null || true

dev-install:
	@echo "Installing in development mode..."
	@sudo mkdir -p /etc/nrdot-plus /var/lib/nrdot-plus /var/log/nrdot-plus
	@sudo cp config/*.yaml /etc/nrdot-plus/
	@sudo cp scripts/nrdot-plus-* /usr/bin/
	@sudo chmod +x /usr/bin/nrdot-plus-*
	@sudo cp systemd/*.service /lib/systemd/system/
	@sudo cp systemd/nrdot-plus-default /etc/default/nrdot-plus
	@sudo systemctl daemon-reload
	@echo "Development installation complete!"

docs:
	@echo "Building documentation..."
	@cd ../docs && mkdocs build || echo "mkdocs not installed"

release: clean build
	@echo "Creating release artifacts..."
	@mkdir -p releases/$(VERSION)
	@cp -r $(BUILD_DIR)/* releases/$(VERSION)/
	@tar -czf releases/nrdot-plus-$(VERSION).tar.gz -C distributions nrdot-plus/
	@echo "Release artifacts created in releases/"

help:
	@echo "NRDOT-Plus Distribution Makefile"
	@echo ""
	@echo "Available targets:"
	@echo "  make              - Build distribution packages"
	@echo "  make clean        - Clean build artifacts"
	@echo "  make build        - Build DEB and RPM packages"
	@echo "  make package      - Same as build"
	@echo "  make test         - Run basic tests"
	@echo "  make install      - Install NRDOT-Plus"
	@echo "  make uninstall    - Uninstall NRDOT-Plus"
	@echo "  make dev-install  - Install for development"
	@echo "  make docs         - Build documentation"
	@echo "  make release      - Create release artifacts"
	@echo "  make help         - Show this help"