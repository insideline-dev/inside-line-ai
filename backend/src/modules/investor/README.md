# Investor Module

Manages investor-specific features including investment thesis, custom scoring preferences, and startup matches.

## Endpoints (8 total)

### Thesis Management
All endpoints require authentication and investor/admin role.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/investor/thesis` | Get investment thesis |
| POST | `/investor/thesis` | Create or update thesis (upsert) |
| DELETE | `/investor/thesis` | Delete thesis |

### Scoring Preferences
| Method | Path | Description |
|--------|------|-------------|
| GET | `/investor/scoring` | Get scoring weights |
| PUT | `/investor/scoring` | Update scoring weights |

### Matches
| Method | Path | Description |
|--------|------|-------------|
| GET | `/investor/matches` | List matches (paginated, sorted by score) |
| GET | `/investor/matches/:startupId` | Get match details |
| PATCH | `/investor/matches/:startupId/save` | Toggle saved status |

## Services

### ThesisService
- `findOne(userId)` - Get thesis for investor
- `upsert(userId, dto)` - Create or update thesis
- `delete(userId)` - Delete thesis
- `hasThesis(userId)` - Check if active thesis exists

### ScoringService
- `findOne(userId)` - Get scoring weights (defaults to 20 each)
- `update(userId, dto)` - Update weights
- `getDefaults()` - Return default weights (20 each)

### MatchService
- `findAll(investorId, query)` - Paginated matches with filters
- `findOne(investorId, startupId)` - Single match details
- `toggleSaved(investorId, startupId)` - Toggle saved flag
- `updateViewedAt(investorId, startupId)` - Track view timestamp
- `calculateOverallScore(match, weights)` - Weighted average
- `regenerateMatches(investorId)` - Queue match recalculation
- `createOrUpdate(investorId, startupId, scores)` - Upsert match

## DTOs

### CreateThesisDto
```typescript
{
  industries?: string[];
  stages?: string[];
  checkSizeMin?: number;
  checkSizeMax?: number;
  geographicFocus?: string[];
  mustHaveFeatures?: string[];
  dealBreakers?: string[];
  notes?: string;
}
```

### UpdateScoringWeightsDto
```typescript
{
  marketWeight: number;      // 0-100
  teamWeight: number;         // 0-100
  productWeight: number;      // 0-100
  tractionWeight: number;     // 0-100
  financialsWeight: number;   // 0-100
}
// Constraint: All weights must sum to 100
```

### GetMatchesQueryDto
```typescript
{
  page?: number;      // default: 1
  limit?: number;     // default: 20, max: 100
  minScore?: number;  // 0-100
  isSaved?: boolean;
}
```

## Business Logic

### Scoring Algorithm
When investor updates weights, the overall score is recalculated:
```typescript
overallScore = (
  (marketScore * marketWeight) +
  (teamScore * teamWeight) +
  (productScore * productWeight) +
  (tractionScore * tractionWeight) +
  (financialsScore * financialsWeight)
) / 100
```

### Match Regeneration
Triggered when:
- Investor updates thesis → queue `regenerate-matches` job
- Investor updates weights → queue `regenerate-matches` job

### Default Weights
If investor hasn't customized scoring weights:
```typescript
{
  marketWeight: 20,
  teamWeight: 20,
  productWeight: 20,
  tractionWeight: 20,
  financialsWeight: 20
}
```

## Security

### RLS Policies
- Thesis: Only owner can CRUD their thesis
- Weights: Only owner can CRUD their weights
- Matches: Investors see only their own matches

### Guards
- `JwtAuthGuard` - Requires authentication
- `RolesGuard` - Requires USER or ADMIN role
- `@Roles(UserRole.USER, UserRole.ADMIN)` - Applied to all endpoints

## Testing

### Coverage
- 43 tests across 4 test files
- 100% pass rate
- Tests cover:
  - All 8 endpoints
  - CRUD operations
  - Validation (weight sum = 100, check size min ≤ max)
  - Edge cases (null scores, deleted thesis, etc.)
  - Mock DB with proper query chaining

### Run Tests
```bash
bun test src/modules/investor/tests/
```

## Integration Points

### Called by AnalysisService
- `MatchService.createOrUpdate()` - Creates/updates match after startup analysis

### Calls QueueService
- Queues `regenerate-matches` job when thesis/weights change

## File Structure
```
src/modules/investor/
├── investor.module.ts
├── thesis.service.ts
├── scoring.service.ts
├── match.service.ts
├── investor.controller.ts
├── dto/
│   ├── create-thesis.dto.ts
│   ├── update-thesis.dto.ts
│   ├── update-scoring-weights.dto.ts
│   ├── get-matches-query.dto.ts
│   └── index.ts
├── entities/
│   ├── investor.schema.ts
│   └── index.ts
└── tests/
    ├── thesis.service.spec.ts
    ├── scoring.service.spec.ts
    ├── match.service.spec.ts
    └── investor.controller.spec.ts
```
