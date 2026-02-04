# NestJS Boilerplate

Production-ready NestJS boilerplate with authentication, queues, storage, and email.

## Tech Stack

- **Framework**: NestJS 11
- **Database**: PostgreSQL with Drizzle ORM
- **Queue**: BullMQ with Redis
- **Validation**: Zod + nestjs-zod
- **Auth**: JWT + Passport (local + Google OAuth)
- **Storage**: R2/S3 compatible
- **Email**: Resend
- **Docs**: Swagger/OpenAPI

## Getting Started

### Prerequisites

- Node.js 20+
- Bun (recommended) or pnpm
- PostgreSQL
- Redis

### Installation

```bash
# Install dependencies
bun install

# Copy environment file
cp .env.example .env

# Edit .env with your values
```

### Database Setup

```bash
# Push schema to database
bun run db:push

# Or generate and run migrations
bun run db:generate
bun run db:migrate
```

### Running

```bash
# Development
bun run dev

# Production build
bun run build
bun run start:prod
```

## API Documentation

Swagger docs available at `http://localhost:8080/docs` when `ENABLE_SWAGGER=true`.

## Project Structure

```
src/
├── app.module.ts       # Root module
├── main.ts             # Bootstrap
├── config/             # Zod-validated environment config
├── database/           # Drizzle ORM setup
├── auth/               # JWT auth, Passport strategies, guards
├── queue/              # BullMQ processors and job management
├── storage/            # R2/S3 file uploads
├── email/              # Resend email service
├── health/             # Health check endpoints
└── common/             # Shared filters, interceptors, middleware
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start development server |
| `bun run build` | Build for production |
| `bun run start:prod` | Run production build |
| `bun run test` | Run unit tests |
| `bun run test:e2e` | Run e2e tests |
| `bun run lint` | Run ESLint |
| `bun run db:generate` | Generate migrations |
| `bun run db:migrate` | Run migrations |
| `bun run db:push` | Push schema directly |
| `bun run db:studio` | Open Drizzle Studio |

## Environment Variables

See `.env.example` for all required variables.

## License

MIT
