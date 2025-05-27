# Use Node.js LTS as base image
FROM node:18-alpine

# Install additional dependencies that might be needed
RUN apk add --no-cache \
    bash \
    git \
    curl \
    python3 \
    make \
    g++

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
COPY scripts/package*.json ./scripts/
COPY nrdot-nr1-app/package*.json ./nrdot-nr1-app/

# Install dependencies for main project
RUN npm install

# Install dependencies for scripts
WORKDIR /app/scripts
RUN npm install

# Install dependencies for nrdot-nr1-app
WORKDIR /app/nrdot-nr1-app
RUN npm install

# Go back to main directory
WORKDIR /app

# Copy all project files except automation directory
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

# Make scripts executable
RUN chmod +x setup.sh
RUN chmod +x scripts/*.sh

# Create a startup script
RUN echo '#!/bin/bash' > /app/start.sh && \
    echo 'echo "DashBuilder Container Started"' >> /app/start.sh && \
    echo 'echo "Available commands:"' >> /app/start.sh && \
    echo 'echo "  npm run setup:quick - Quick setup"' >> /app/start.sh && \
    echo 'echo "  npm run deploy - Deploy dashboards"' >> /app/start.sh && \
    echo 'echo "  npm run deploy:nrdot - Deploy NRDOT"' >> /app/start.sh && \
    echo 'echo "  npm run validate:all - Validate configuration"' >> /app/start.sh && \
    echo 'echo "  npm run cli -- [command] - Run CLI commands"' >> /app/start.sh && \
    echo 'echo ""' >> /app/start.sh && \
    echo 'echo "To get started, configure your environment variables in .env file"' >> /app/start.sh && \
    echo 'echo ""' >> /app/start.sh && \
    echo 'exec "$@"' >> /app/start.sh && \
    chmod +x /app/start.sh

# Expose any ports if needed (adjust based on your application)
# EXPOSE 3000

# Set the startup script as entrypoint
ENTRYPOINT ["/app/start.sh"]

# Default command - keeps container running
CMD ["tail", "-f", "/dev/null"]