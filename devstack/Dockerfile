FROM ubuntu:22.04

# Set environment to avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install base packages and virtualization support
RUN apt-get update && apt-get install -y \
    sudo \
    git \
    curl \
    wget \
    python3 \
    python3-pip \
    python3-dev \
    build-essential \
    libssl-dev \
    libffi-dev \
    libxml2-dev \
    libxslt1-dev \
    zlib1g-dev \
    openvswitch-switch \
    systemd \
    systemd-sysv \
    qemu-kvm \
    libvirt-daemon-system \
    libvirt-clients \
    bridge-utils \
    iptables \
    ebtables \
    dnsmasq \
    lsb-release \
    ca-certificates \
    netcat \
    iproute2 \
    net-tools \
    && rm -rf /var/lib/apt/lists/*

# Create stack user
RUN useradd -s /bin/bash -d /opt/stack -m stack && \
    echo "stack ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers

# Set working directory
WORKDIR /opt/stack

# Copy devstack
COPY devstack /opt/stack/devstack

# Set ownership
RUN chown -R stack:stack /opt/stack

# Switch to stack user
USER stack

# Set environment variables
ENV HOME=/opt/stack

# Entry point
ENTRYPOINT ["/bin/bash"]