# DashBuilder Frontend Dockerfile
# Multi-stage build for optimized production image

# Stage 1: Build
FROM node:16-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN npm ci --only=production
RUN cd frontend && npm ci

# Copy source code
COPY . .

# Build application
ENV NODE_ENV=production
RUN cd frontend && npm run build

# Stage 2: Runtime
FROM nginx:alpine

# Install runtime dependencies
RUN apk add --no-cache tini

# Copy nginx configuration
COPY frontend/deployment/nginx.conf /etc/nginx/nginx.conf
COPY frontend/deployment/default.conf /etc/nginx/conf.d/default.conf

# Copy built application
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy security headers configuration
COPY frontend/deployment/security-headers.conf /etc/nginx/conf.d/security-headers.conf

# Create non-root user
RUN adduser -D -H -u 1000 -s /sbin/nologin www-user

# Set permissions
RUN chown -R www-user:www-user /usr/share/nginx/html && \
    chown -R www-user:www-user /var/cache/nginx && \
    chown -R www-user:www-user /var/log/nginx && \
    chown -R www-user:www-user /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R www-user:www-user /var/run/nginx.pid

# Switch to non-root user
USER www-user

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

# Expose port
EXPOSE 8080

# Use tini as entrypoint
ENTRYPOINT ["/sbin/tini", "--"]

# Start nginx
CMD ["nginx", "-g", "daemon off;"]