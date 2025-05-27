# DashBuilder Docker Container

This Docker container packages the entire DashBuilder project (excluding the automation directory) and provides a ready-to-run environment.

## Prerequisites

- Docker installed on your system
- Docker Compose (optional, but recommended)
- New Relic API credentials

## Quick Start

1. **Copy and configure environment variables:**
   ```bash
   cp .env.docker .env
   # Edit .env with your New Relic credentials
   ```

2. **Build the Docker image:**
   ```bash
   docker build -t dashbuilder:latest .
   ```

3. **Run with Docker Compose (recommended):**
   ```bash
   # Start the container
   docker-compose up -d

   # Access the container shell
   docker-compose exec dashbuilder bash

   # Run commands inside the container
   docker-compose exec dashbuilder npm run validate:all
   docker-compose exec dashbuilder npm run deploy:nrdot
   ```

4. **Or run with Docker directly:**
   ```bash
   docker run -it --rm \
     --env-file .env \
     -v $(pwd)/configs:/app/configs:ro \
     -v $(pwd)/examples:/app/examples:ro \
     -v $(pwd)/docker-output:/app/output \
     dashbuilder:latest bash
   ```

## Available Commands

Once inside the container, you can run:

- `npm run setup:quick` - Quick setup
- `npm run deploy` - Deploy dashboards
- `npm run deploy:nrdot` - Deploy NRDOT
- `npm run validate:all` - Validate configuration
- `npm run cli -- [command]` - Run CLI commands
- `npm run test:connection` - Test New Relic connection

## Using the CLI Service

For one-off commands without entering the container:

```bash
# List dashboards
docker-compose run --rm dashbuilder-cli cli -- dashboard list

# Create a dashboard
docker-compose run --rm dashbuilder-cli cli -- dashboard create ./examples/sample-dashboard.json
```

## Directory Structure in Container

- `/app` - Main application directory
- `/app/scripts` - CLI tools and scripts
- `/app/nrdot-nr1-app` - New Relic One application
- `/app/orchestrator` - Orchestration workflows
- `/app/output` - Output directory (mounted volume)

## Notes

- The automation directory is excluded from the container
- All Node.js dependencies are pre-installed
- Environment variables can be passed via .env file or docker-compose.yml
- Output files are saved to the docker-output directory on your host

## Troubleshooting

1. **Container won't start:** Check Docker logs with `docker-compose logs dashbuilder`
2. **Permission issues:** Ensure mounted volumes have correct permissions
3. **API connection errors:** Verify your New Relic credentials in .env file