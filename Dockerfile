# Use Node.js LTS as base image
FROM node:18-alpine

# Install additional dependencies
RUN apk add --no-cache \
    bash \
    git \
    curl \
    python3 \
    make \
    g++

# Set working directory
WORKDIR /app

# Copy package files for main project
COPY package*.json ./

# Install main project dependencies
RUN npm install --legacy-peer-deps

# Copy and install scripts dependencies
COPY scripts/package*.json ./scripts/
WORKDIR /app/scripts
RUN npm install --legacy-peer-deps

# Go back to main directory
WORKDIR /app

# Copy all project files except automation
COPY .gitignore ./
COPY CLAUDE.md ./
COPY README.md ./
COPY NRDOT-V2-IMPLEMENTATION-SUMMARY.md ./
COPY deployment.yaml ./
COPY setup.sh ./
COPY configs ./configs
COPY distributions ./distributions
COPY docs ./docs
COPY examples ./examples
COPY nrdot-nr1-app ./nrdot-nr1-app
COPY orchestrator ./orchestrator
COPY pkg ./pkg
COPY scripts ./scripts

# Install dependencies in scripts workspace
WORKDIR /app/scripts
RUN npm install --legacy-peer-deps

# Back to app root
WORKDIR /app

# Make scripts executable
RUN chmod +x setup.sh && \
    find scripts -name "*.sh" -type f -exec chmod +x {} \;
# Create startup script
RUN echo '#!/bin/bash' > /app/start.sh && \
    echo 'echo "===================================="' >> /app/start.sh && \
    echo 'echo " DashBuilder Container Started"' >> /app/start.sh && \
    echo 'echo "===================================="' >> /app/start.sh && \
    echo 'echo ""' >> /app/start.sh && \
    echo 'echo "Available commands:"' >> /app/start.sh && \
    echo 'echo "  npm run validate:all    - Test New Relic connection"' >> /app/start.sh && \
    echo 'echo "  npm run deploy          - Deploy dashboards"' >> /app/start.sh && \
    echo 'echo "  npm run deploy:nrdot    - Deploy NRDOT"' >> /app/start.sh && \
    echo 'echo "  npm run cli -- [cmd]    - Run CLI commands"' >> /app/start.sh && \
    echo 'echo ""' >> /app/start.sh && \
    echo 'echo "Examples:"' >> /app/start.sh && \
    echo 'echo "  npm run cli -- dashboard list"' >> /app/start.sh && \
    echo 'echo "  npm run cli -- dashboard create ./examples/sample-dashboard.json"' >> /app/start.sh && \
    echo 'echo ""' >> /app/start.sh && \
    echo 'exec "$@"' >> /app/start.sh && \
    chmod +x /app/start.sh

# Set environment variables
ENV NODE_ENV=production
ENV NR_GUARDIAN_LOG_LEVEL=info

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Set entrypoint with comprehensive logging
ENTRYPOINT ["/docker-entrypoint.sh"]

# Default command - keep container running
CMD []