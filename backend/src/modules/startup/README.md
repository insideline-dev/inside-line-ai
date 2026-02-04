# Startup Module

Complete CRUD module for managing startup submissions in the Inside Line platform.

## Overview

This module handles the entire startup lifecycle from draft creation through approval workflow. It supports founders submitting startups, admins reviewing/approving them, and investors viewing approved startups.

## Features

### Database Schema

- **Startup Table**: Main entity with status workflow (draft → submitted → approved/rejected)
- **Startup Draft Table**: Autosave system for incomplete applications
- **RLS Policies**: Row-level security ensuring proper access control

### Status Workflow

```
draft → submitted → approved/rejected
                 ↓
              resubmit (from rejected)
```

- **Draft**: Initial state, can be edited/deleted by founder
- **Submitted**: Under review, no edits allowed
- **Approved**: Visible to investors, no edits allowed
- **Rejected**: Can be resubmitted after fixes

## API Endpoints (21 total)

### Founder Endpoints
- `POST /startups` - Create new startup (status = draft)
- `GET /startups` - List my startups (paginated)
- `GET /startups/:id` - Get startup details
- `PATCH /startups/:id` - Update startup (only if draft/rejected)
- `DELETE /startups/:id` - Delete startup (only if draft)
- `POST /startups/:id/submit` - Submit for review
- `POST /startups/:id/resubmit` - Resubmit after rejection
- `GET /startups/:id/jobs` - Get analysis jobs for startup
- `POST /startups/:id/upload-url` - Get presigned URL for file upload
- `POST /startups/:id/draft` - Save draft (autosave)
- `GET /startups/:id/draft` - Get latest draft

### Investor Endpoints
- `GET /startups/approved/list` - List all approved startups (paginated, filterable)
- `GET /startups/approved/:id` - View approved startup details

### Admin Endpoints
- `GET /startups/admin/all` - List all startups (any status, paginated)
- `GET /startups/admin/pending` - List pending submissions
- `POST /startups/admin/:id/approve` - Approve startup
- `POST /startups/admin/:id/reject` - Reject startup (with reason)
- `POST /startups/admin/:id/reanalyze` - Trigger re-analysis (queue job)
- `PATCH /startups/admin/:id` - Admin edit any field
- `DELETE /startups/admin/:id` - Hard delete startup

### Public Endpoints
- `GET /startups/public/:slug` - View startup by slug (if approved)

## Services

### StartupService
Main service handling all CRUD operations, status transitions, and business logic.

**Key Methods:**
- `create(userId, dto)` - Create draft startup
- `findAll(userId, query)` - Paginated list with RLS
- `submit(id, userId)` - Submit for review, queue scoring job, delete draft
- `approve(id, adminId)` - Approve and queue matching job
- `reject(id, adminId, reason)` - Reject with reason
- `resubmit(id, userId)` - Resubmit rejected startup
- `getUploadUrl(id, userId, dto)` - Generate R2 presigned URL

### DraftService
Handles autosave functionality for startup applications.

**Key Methods:**
- `save(startupId, userId, draftData)` - Upsert draft
- `get(startupId, userId)` - Get latest draft
- `delete(startupId)` - Delete draft (called after submission)

## DTOs

All DTOs use Zod schemas with nestjs-zod integration:

- `CreateStartupDto` - Required fields for creating a startup
- `UpdateStartupDto` - Partial update schema
- `SubmitStartupDto` - Empty (status change only)
- `ApproveStartupDto` - Empty (status change only)
- `RejectStartupDto` - Rejection reason (required, min 10 chars)
- `SaveDraftDto` - Draft data as JSONB object
- `PresignedUrlDto` - File upload metadata
- `GetStartupsQueryDto` - Pagination + filters (status, industry, stage, search)
- `GetApprovedStartupsQueryDto` - Investor-specific filters

## Guards

Uses role-based access control via `RolesGuard` and `@Roles()` decorator:
- Founder endpoints: `@Roles(UserRole.USER, UserRole.ADMIN)`
- Admin endpoints: `@Roles(UserRole.ADMIN)`
- Public endpoints: `@Public()`

## Integration Points

### Queue Jobs
- **On submit**: Queues scoring job (high priority)
- **On approve**: Queues matching job (medium priority)
- **On reanalyze**: Queues full analysis (low priority)

### Storage
- Presigned URL generation for pitch decks and assets
- File types: PDFs (pitch decks), images (logos)
- Path structure: `{userId}/{startupId}/{assetType}/{id}.{ext}`

### Notifications (Future)
- On submit: Notify admins
- On approve: Notify founder
- On reject: Notify founder with reason

## Testing

Comprehensive test coverage (45 tests):

### Service Tests (19 tests)
- CRUD operations
- Status transitions
- Error cases (NotFoundException, ForbiddenException, BadRequestException)
- Queue job creation
- Storage integration

### Draft Service Tests (5 tests)
- Upsert logic
- Draft retrieval
- Cleanup

### Controller Tests (21 tests)
- All endpoints
- Role-based access
- Request/response handling
- Admin operations

**Run tests:**
```bash
bun test src/modules/startup/tests/
```

## File Structure

```
src/modules/startup/
├── startup.module.ts          # Module definition
├── startup.service.ts         # Main CRUD service
├── startup.controller.ts      # API endpoints (21 routes)
├── draft.service.ts           # Autosave service
├── dto/
│   ├── create-startup.dto.ts
│   ├── update-startup.dto.ts
│   ├── submit-startup.dto.ts
│   ├── approve-startup.dto.ts
│   ├── reject-startup.dto.ts
│   ├── save-draft.dto.ts
│   ├── presigned-url.dto.ts
│   └── query-startups.dto.ts
├── guards/
│   └── roles.guard.ts         # Role-based access control
├── decorators/
│   └── roles.decorator.ts     # @Roles() decorator
├── entities/
│   └── startup.schema.ts      # Drizzle schema
└── tests/
    ├── startup.service.spec.ts    # 19 tests
    ├── draft.service.spec.ts      # 5 tests
    └── startup.controller.spec.ts # 21 tests
```

## Usage Examples

### Create and Submit Startup (Founder Flow)

```typescript
// 1. Create draft
POST /startups
{
  "name": "AI Startup",
  "tagline": "Revolutionizing AI",
  "description": "...",
  "website": "https://example.com",
  "location": "San Francisco",
  "industry": "AI/ML",
  "stage": "seed",
  "fundingTarget": 1000000,
  "teamSize": 5
}

// 2. Save draft (autosave)
POST /startups/:id/draft
{
  "draftData": { "name": "Updated AI Startup", ... }
}

// 3. Upload pitch deck
POST /startups/:id/upload-url
{
  "fileName": "pitch.pdf",
  "fileType": "application/pdf",
  "fileSize": 2048000
}

// 4. Submit for review
POST /startups/:id/submit
{}
```

### Admin Review Flow

```typescript
// 1. Get pending startups
GET /startups/admin/pending?page=1&limit=20

// 2. Approve
POST /startups/admin/:id/approve
{}

// OR Reject
POST /startups/admin/:id/reject
{
  "rejectionReason": "Need more traction before funding"
}
```

### Investor Flow

```typescript
// 1. Browse approved startups
GET /startups/approved/list?industry=AI/ML&stage=seed&page=1

// 2. View details
GET /startups/approved/:id
```

## Business Rules

### Edit Restrictions
- Can only edit if status = `draft` or `rejected`
- Cannot edit while `submitted` or `approved`

### Delete Restrictions
- Can only delete if status = `draft`

### Status Transitions
- `draft` → `submitted`: Only by founder
- `submitted` → `approved`: Only by admin
- `submitted` → `rejected`: Only by admin
- `rejected` → `submitted`: Only by founder (resubmit)

### Draft Cleanup
- Draft is automatically deleted when startup is submitted
- One draft per startup (unique constraint on startupId)

## RLS Policies

- **Founders**: See only their own startups (via `crudOwnPolicy`)
- **Investors**: See only approved startups (via `startup_investor_view` policy)
- **Admins**: See all startups (via `isAdmin` check in RLS)

## Future Enhancements

1. Notification integration (currently stubbed)
2. Job status tracking endpoint (currently returns placeholder)
3. Scout submission workflow (removed from current version)
4. Analytics and metrics
5. Bulk operations for admins
6. Export functionality
