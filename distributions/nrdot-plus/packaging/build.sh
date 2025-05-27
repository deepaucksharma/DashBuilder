#!/bin/bash
# Build script for NRDOT-Plus packages

set -euo pipefail

# Configuration
NRDOT_PLUS_VERSION="2.0.0"
OTEL_VERSION="0.104.0"
BUILD_DIR="$(dirname "$0")"
DIST_DIR="$(dirname "$BUILD_DIR")"
OUTPUT_DIR="${BUILD_DIR}/output"

# Architecture mapping
declare -A ARCH_MAP=(
    ["x86_64"]="amd64"
    ["aarch64"]="arm64"
    ["armv7l"]="armhf"
)

# Detect architecture
ARCH=$(uname -m)
DEB_ARCH=${ARCH_MAP[$ARCH]:-$ARCH}

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Build function for DEB package
build_deb() {
    echo "Building DEB package for $DEB_ARCH..."
    
    local pkg_name="nrdot-plus"
    local pkg_version="${NRDOT_PLUS_VERSION}"
    local pkg_dir="${BUILD_DIR}/deb/${pkg_name}_${pkg_version}_${DEB_ARCH}"
    
    # Clean and create package directory
    rm -rf "$pkg_dir"
    mkdir -p "$pkg_dir"/{DEBIAN,etc/{nrdot-plus,default},usr/{bin,share/doc/nrdot-plus},var/{lib,log}/nrdot-plus,lib/systemd/system,lib/tmpfiles.d}
    
    # Copy binaries (assumes otelcol is available)
    cp /usr/bin/otelcol "$pkg_dir/usr/bin/" || echo "Warning: otelcol not found, skipping"
    
    # Copy our scripts
    cp "$DIST_DIR/scripts/nrdot-plus-control-loop.sh" "$pkg_dir/usr/bin/nrdot-plus-control-loop"
    cp "$DIST_DIR/scripts/nrdot-plus-ctl" "$pkg_dir/usr/bin/nrdot-plus-ctl"
    chmod +x "$pkg_dir/usr/bin/nrdot-plus-"*
    
    # Copy configurations
    cp "$DIST_DIR/config/config.yaml" "$pkg_dir/etc/nrdot-plus/"
    cp "$DIST_DIR/config/optimization.yaml" "$pkg_dir/etc/nrdot-plus/"
    
    # Copy systemd files
    cp "$DIST_DIR/systemd/nrdot-plus.service" "$pkg_dir/lib/systemd/system/"
    cp "$DIST_DIR/systemd/nrdot-plus-control-loop.service" "$pkg_dir/lib/systemd/system/"
    cp "$DIST_DIR/systemd/nrdot-plus.tmpfiles" "$pkg_dir/lib/tmpfiles.d/nrdot-plus.conf"
    
    # Copy default environment
    cp "$DIST_DIR/systemd/nrdot-plus-default" "$pkg_dir/etc/default/nrdot-plus"
    
    # Copy documentation
    cp "$DIST_DIR/README.md" "$pkg_dir/usr/share/doc/nrdot-plus/"
    cp -r "$DIST_DIR/../docs" "$pkg_dir/usr/share/doc/nrdot-plus/" || true
    
    # Create control file
    cat > "$pkg_dir/DEBIAN/control" <<EOF
Package: ${pkg_name}
Version: ${pkg_version}
Architecture: ${DEB_ARCH}
Maintainer: New Relic <nrdot-plus@newrelic.com>
Description: NRDOT-Plus Optimized OpenTelemetry Collector
 NRDOT-Plus is an enhanced distribution of the New Relic OpenTelemetry
 collector that includes built-in process metrics optimization,
 delivering 70-85% cost reduction out of the box.
Homepage: https://docs.newrelic.com/nrdot-plus
Depends: systemd, curl, jq, bc
Recommends: yq
Conflicts: nrdot-collector-host
Replaces: nrdot-collector-host
Provides: nrdot-collector
Section: admin
Priority: optional
EOF

    # Create postinst script
    cat > "$pkg_dir/DEBIAN/postinst" <<'EOF'
#!/bin/bash
set -e

# Create user and group
if ! getent group nrdot-plus >/dev/null; then
    groupadd -r nrdot-plus
fi

if ! getent passwd nrdot-plus >/dev/null; then
    useradd -r -g nrdot-plus -d /var/lib/nrdot-plus -s /sbin/nologin \
        -c "NRDOT-Plus daemon" nrdot-plus
fi

# Set ownership
chown -R nrdot-plus:nrdot-plus /var/lib/nrdot-plus /var/log/nrdot-plus
chown root:nrdot-plus /etc/nrdot-plus
chmod 750 /etc/nrdot-plus

# Create tmpfiles
systemd-tmpfiles --create /lib/tmpfiles.d/nrdot-plus.conf

# Calculate ring assignment
RING=$(( $(hostname | cksum | cut -d' ' -f1) % 8 ))
sed -i "s/^NRDOT_RING=.*/NRDOT_RING=\"$RING\"/" /etc/default/nrdot-plus

# Reload systemd
systemctl daemon-reload

# Migrate from nrdot-collector-host if exists
if [ -f /etc/nrdot-collector-host/config.yaml ]; then
    echo "Migrating from nrdot-collector-host..."
    # Preserve license key
    if grep -q "NEW_RELIC_LICENSE_KEY" /etc/default/nrdot-collector-host 2>/dev/null; then
        grep "NEW_RELIC_LICENSE_KEY" /etc/default/nrdot-collector-host >> /etc/default/nrdot-plus
    fi
fi

echo ""
echo "NRDOT-Plus installed successfully!"
echo ""
echo "Next steps:"
echo "1. Set your New Relic license key:"
echo "   sudo sed -i 's/#NEW_RELIC_LICENSE_KEY=.*/NEW_RELIC_LICENSE_KEY=YOUR_KEY/' /etc/default/nrdot-plus"
echo ""
echo "2. Start the service:"
echo "   sudo systemctl start nrdot-plus"
echo "   sudo systemctl start nrdot-plus-control-loop"
echo ""
echo "3. Check status:"
echo "   nrdot-plus-ctl status"
echo ""

exit 0
EOF
    chmod 755 "$pkg_dir/DEBIAN/postinst"

    # Create prerm script
    cat > "$pkg_dir/DEBIAN/prerm" <<'EOF'
#!/bin/bash
set -e

# Stop services if running
systemctl stop nrdot-plus-control-loop || true
systemctl stop nrdot-plus || true

exit 0
EOF
    chmod 755 "$pkg_dir/DEBIAN/prerm"

    # Create postrm script
    cat > "$pkg_dir/DEBIAN/postrm" <<'EOF'
#!/bin/bash
set -e

# Remove user and group on purge
if [ "$1" = "purge" ]; then
    # Remove user and group
    userdel nrdot-plus || true
    groupdel nrdot-plus || true
    
    # Remove directories
    rm -rf /var/lib/nrdot-plus /var/log/nrdot-plus
fi

exit 0
EOF
    chmod 755 "$pkg_dir/DEBIAN/postrm"

    # Build package
    dpkg-deb --build "$pkg_dir" "$OUTPUT_DIR/${pkg_name}_${pkg_version}_${DEB_ARCH}.deb"
    echo "DEB package built: $OUTPUT_DIR/${pkg_name}_${pkg_version}_${DEB_ARCH}.deb"
}

# Build function for RPM package
build_rpm() {
    echo "Building RPM package..."
    
    # Create RPM build structure
    local rpm_dir="${BUILD_DIR}/rpm"
    mkdir -p "$rpm_dir"/{BUILD,RPMS,SOURCES,SPECS,SRPMS}
    
    # Create tarball of sources
    local pkg_name="nrdot-plus"
    local pkg_version="${NRDOT_PLUS_VERSION}"
    local source_dir="${rpm_dir}/SOURCES/${pkg_name}-${pkg_version}"
    
    rm -rf "$source_dir"
    mkdir -p "$source_dir"
    cp -r "$DIST_DIR"/{config,scripts,systemd,README.md} "$source_dir/"
    
    # Create tarball
    tar -czf "${rpm_dir}/SOURCES/${pkg_name}-${pkg_version}.tar.gz" \
        -C "${rpm_dir}/SOURCES" "${pkg_name}-${pkg_version}"
    
    # Create spec file
    cat > "$rpm_dir/SPECS/nrdot-plus.spec" <<EOF
Name:           nrdot-plus
Version:        ${pkg_version}
Release:        1%{?dist}
Summary:        NRDOT-Plus Optimized OpenTelemetry Collector
License:        Apache-2.0
URL:            https://docs.newrelic.com/nrdot-plus
Source0:        %{name}-%{version}.tar.gz

BuildArch:      x86_64
Requires:       systemd, curl, jq, bc
Recommends:     yq
Conflicts:      nrdot-collector-host
Provides:       nrdot-collector

%description
NRDOT-Plus is an enhanced distribution of the New Relic OpenTelemetry
collector that includes built-in process metrics optimization,
delivering 70-85% cost reduction out of the box.

%prep
%setup -q

%install
# Create directories
mkdir -p %{buildroot}%{_bindir}
mkdir -p %{buildroot}%{_sysconfdir}/nrdot-plus
mkdir -p %{buildroot}%{_sysconfdir}/default
mkdir -p %{buildroot}%{_unitdir}
mkdir -p %{buildroot}%{_tmpfilesdir}
mkdir -p %{buildroot}%{_localstatedir}/lib/nrdot-plus
mkdir -p %{buildroot}%{_localstatedir}/log/nrdot-plus
mkdir -p %{buildroot}%{_docdir}/nrdot-plus

# Install binaries
install -m 755 scripts/nrdot-plus-control-loop.sh %{buildroot}%{_bindir}/nrdot-plus-control-loop
install -m 755 scripts/nrdot-plus-ctl %{buildroot}%{_bindir}/nrdot-plus-ctl

# Install configs
install -m 644 config/config.yaml %{buildroot}%{_sysconfdir}/nrdot-plus/
install -m 644 config/optimization.yaml %{buildroot}%{_sysconfdir}/nrdot-plus/

# Install systemd files
install -m 644 systemd/nrdot-plus.service %{buildroot}%{_unitdir}/
install -m 644 systemd/nrdot-plus-control-loop.service %{buildroot}%{_unitdir}/
install -m 644 systemd/nrdot-plus.tmpfiles %{buildroot}%{_tmpfilesdir}/nrdot-plus.conf

# Install defaults
install -m 644 systemd/nrdot-plus-default %{buildroot}%{_sysconfdir}/default/nrdot-plus

# Install docs
install -m 644 README.md %{buildroot}%{_docdir}/nrdot-plus/

%pre
# Create user and group
getent group nrdot-plus >/dev/null || groupadd -r nrdot-plus
getent passwd nrdot-plus >/dev/null || useradd -r -g nrdot-plus -d /var/lib/nrdot-plus -s /sbin/nologin -c "NRDOT-Plus daemon" nrdot-plus

%post
# Set ownership
chown -R nrdot-plus:nrdot-plus %{_localstatedir}/lib/nrdot-plus %{_localstatedir}/log/nrdot-plus
chown root:nrdot-plus %{_sysconfdir}/nrdot-plus
chmod 750 %{_sysconfdir}/nrdot-plus

# Create tmpfiles
systemd-tmpfiles --create %{_tmpfilesdir}/nrdot-plus.conf

# Calculate ring assignment
RING=\$(( \$(hostname | cksum | cut -d' ' -f1) % 8 ))
sed -i "s/^NRDOT_RING=.*/NRDOT_RING=\"\$RING\"/" %{_sysconfdir}/default/nrdot-plus

# Reload systemd
systemctl daemon-reload

%preun
if [ \$1 -eq 0 ]; then
    # Stop services on uninstall
    systemctl stop nrdot-plus-control-loop || true
    systemctl stop nrdot-plus || true
fi

%postun
if [ \$1 -eq 0 ]; then
    # Remove user and group on uninstall
    userdel nrdot-plus || true
    groupdel nrdot-plus || true
fi

%files
%{_bindir}/nrdot-plus-control-loop
%{_bindir}/nrdot-plus-ctl
%{_unitdir}/nrdot-plus.service
%{_unitdir}/nrdot-plus-control-loop.service
%{_tmpfilesdir}/nrdot-plus.conf
%config(noreplace) %{_sysconfdir}/nrdot-plus/config.yaml
%config(noreplace) %{_sysconfdir}/nrdot-plus/optimization.yaml
%config(noreplace) %{_sysconfdir}/default/nrdot-plus
%dir %{_sysconfdir}/nrdot-plus
%dir %{_localstatedir}/lib/nrdot-plus
%dir %{_localstatedir}/log/nrdot-plus
%doc %{_docdir}/nrdot-plus/README.md

%changelog
* Thu Nov 28 2024 New Relic <nrdot-plus@newrelic.com> - 2.0.0-1
- Initial release of NRDOT-Plus
EOF

    # Build RPM
    if command -v rpmbuild &>/dev/null; then
        rpmbuild -ba --define "_topdir $rpm_dir" "$rpm_dir/SPECS/nrdot-plus.spec"
        cp "$rpm_dir/RPMS/${ARCH}/"*.rpm "$OUTPUT_DIR/" || true
        echo "RPM package built in $OUTPUT_DIR"
    else
        echo "rpmbuild not found, skipping RPM build"
    fi
}

# Main build process
main() {
    echo "Building NRDOT-Plus packages version $NRDOT_PLUS_VERSION"
    echo "Architecture: $ARCH ($DEB_ARCH)"
    echo
    
    # Build DEB package
    build_deb
    
    # Build RPM package
    build_rpm
    
    echo
    echo "Build complete! Packages available in: $OUTPUT_DIR"
    ls -la "$OUTPUT_DIR"
}

# Run main
main "$@"