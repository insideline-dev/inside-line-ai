# Docker Deployment

Production-ready Docker setup with backend (NestJS), frontend (React/Vite), and Redis.

## Quick Start

```bash
# 1. Copy and configure environment
cp .env.example .env
# Edit .env with your actual values

# 2. Build and start all services
bun docker:up

# 3. View logs
bun docker:logs
```

## Services

- **Frontend**: `http://localhost` (port 80)
- **Backend**: `http://localhost:8080`
- **Redis**: `localhost:6379`

## Commands

```bash
bun docker:build   # Rebuild images
bun docker:up      # Start services (detached)
bun docker:down    # Stop services
bun docker:logs    # Follow logs
```

## Manual Docker Compose

```bash
docker compose up -d          # Start
docker compose down           # Stop
docker compose logs -f        # Logs
docker compose ps             # Status
docker compose build          # Rebuild
```

## Environment Variables

See `.env.example` for all required variables:
- `DATABASE_URL` - PostgreSQL connection
- `JWT_SECRET` - JWT signing key
- `AWS_*` - S3 credentials
- `RESEND_API_KEY` - Email service
- `GOOGLE_CLIENT_*` - OAuth credentials

## Architecture

- **Backend**: Bun + NestJS, multi-stage build, non-root user
- **Frontend**: Bun build → nginx alpine, gzip, security headers
- **Redis**: Alpine image, persistent volume

## Production Notes

- All services have `restart: unless-stopped`
- Redis data persists in named volume `redis_data`
- Backend runs as non-root user (nestjs:nodejs)
- Nginx serves static frontend with caching and compression
- Health checks are built into the Dockerfiles
