# Testing Strategy (Reference Document)

## Philosophy

**Core Principle**: Test logic, not AI responses. Every test must be deterministic and repeatable.

### What We Test
1. **Data Flow**: Correct data reaches the right services in the right format
2. **Schema Validation**: Zod schemas accept valid data and reject invalid data
3. **Error Handling**: Services handle failures gracefully and propagate errors correctly
4. **State Transitions**: Pipeline phases follow dependency graph without race conditions

### What We Don't Test
1. **AI Response Quality**: Never test if GPT output is "good" or "accurate"
2. **External API Availability**: Always mock AI SDK, Mistral SDK, external HTTP calls
3. **Real Database Operations**: Use in-memory or mocked database for unit tests
4. **Actual File I/O**: Mock S3 uploads, PDF generation, file system operations

### Why Determinism Matters
- Tests run in CI/CD must pass 100% of the time
- Developers must trust test failures indicate real bugs
- AI model responses vary non-deterministically - mocking eliminates variance
- Cost: Real AI calls would make test suite prohibitively expensive

### TDD Process

**Test-Driven Development Workflow:** For each deliverable in each phase, follow this strict order:

1. **Create the spec file first** (e.g., `pdf-text-extractor.service.spec.ts`)
2. **Write test cases** based on the acceptance criteria in the phase doc
3. **Run tests** - they should all FAIL (Red phase)
4. **Create the implementation file**
5. **Write minimal code** to make tests pass (Green phase)
6. **Refactor for cleanliness** while keeping tests green
7. **Move to next deliverable** only when all tests pass

**Benefits:**
- Forces you to think about the interface before implementation
- Catches edge cases early in the development cycle
- Prevents over-engineering and unnecessary complexity
- Every phase's "Test Plan" table defines WHAT to test - write those tests before the implementation

## Mock Patterns

### AI SDK Mocking (Vercel AI SDK)

**Module-Level Mock Strategy**
Mock the `ai` package at the top of test files using Vitest's `vi.mock()`. Replace `generateObject` and `generateText` with deterministic functions returning valid schema-conformant data.

**generateObject Pattern**
Mock returns object with structure: `{ object: <schema-valid-data>, usage: { promptTokens, completionTokens }, finishReason: 'stop' }`. Use fixtures from `tests/fixtures/` directory to ensure data matches expected schemas.

**generateText Pattern**
Mock returns object with: `{ text: <string>, usage: {...}, finishReason: 'stop', experimental_providerMetadata: { groundingMetadata: [...] } }`. Include grounding metadata to test citation extraction logic.

**Provider Metadata**
Research and evaluation phases depend on grounding metadata for source citations. Mock structure: `{ groundingMetadata: [{ url, title, snippet }] }`. Test that citation arrays are correctly populated from this metadata.

**Error Simulation**
Test retry logic by making mock throw on first call, succeed on second call. Test validation failures by returning invalid schema data, verifying service catches error.

### Mistral SDK Mocking (@mistralai/mistralai)

**Module-Level Mock Strategy**
Mock the `@mistralai/mistralai` package. Replace `Mistral` class constructor and `chat.complete()` method.

**OCR Response Pattern**
Mock `chat.complete()` returns structure: `{ choices: [{ message: { content: JSON.stringify({ pages: [...] }) } }] }`. Each page contains `pageNumber`, `text`, `tables` array. Use realistic fixture data with multi-page documents.

**Error Scenarios**
Test timeout handling by making mock delay then reject. Test malformed JSON by returning invalid content string. Test empty document by returning zero pages.

### BullMQ Mocking

**Reference Existing Pattern**
Follow pattern from `src/modules/analysis/tests/scoring.processor.spec.ts`. Mock `Worker`, `Job`, and `QueueEvents` classes.

**Job Mock Structure**
Mock job has: `{ id: string, data: <payload>, attemptsMade: number, updateProgress: vi.fn(), log: vi.fn() }`. Processor tests call processor function directly with mocked job.

**Worker Lifecycle**
Test processor methods like `process()`, `onCompleted()`, `onFailed()`. Mock worker emits events: `completed`, `failed`, `progress`. Verify handlers respond correctly.

**Queue Events**
For orchestration tests, mock `QueueEvents` to simulate completion events from multiple queues. Test `PhaseTransitionService` subscribing to events and triggering next phases.

**Job Progress Updates**
Verify processors call `job.updateProgress()` with correct percentage values. Verify progress values flow to WebSocket via `NotificationGateway`.

### Drizzle ORM Mocking

**Chain Pattern**
Mock Drizzle database with chainable methods: `.select().from().where().returning()`. Each method returns object with next method in chain.

**DrizzleService Mock**
Mock `DrizzleService` with `db` property. The `db` object contains table references and query builder. Follow pattern from existing auth and analysis test files.

**Insert/Update/Delete**
Mock insert returns `{ returning: vi.fn().mockResolvedValue([mockRecord]) }`. Mock update and delete similar. Test that correct table and values passed to query builder.

**Query Results**
Mock select returns array of records matching expected schema. Test that WHERE clauses constructed correctly (cannot verify actual SQL, but verify method calls).

**Transaction Handling**
Mock `db.transaction()` with callback receiving transaction object. Verify all operations within transaction use transaction object, not main db.

### Redis Mocking (ioredis)

**In-Memory Map Strategy**
Create in-memory Map behind mock IORedis client. Operations modify Map synchronously. Enables testing cache hit/miss behavior deterministically.

**Supported Operations**
- `hget(key, field)`: return Map value or null
- `hset(key, field, value)`: store in Map
- `hgetall(key)`: return all fields for key
- `expire(key, ttl)`: track TTL (don't need actual expiration in tests)
- `del(key)`: remove from Map
- `exists(key)`: check Map has key

**Pipeline State Testing**
Test `pipeline:state:{startupId}` Redis keys used by orchestrator. Verify state updates are atomic. Simulate race conditions by calling concurrent operations.

**Cache Hit/Miss Verification**
Test location normalizer: first call misses cache (calls AI), second call hits cache (no AI call). Verify AI mock called once only.

### NotificationGateway Mocking

**Mock WebSocket Emission**
Mock `NotificationGateway` service with methods `sendJobStatus()`, `sendNotification()`, `emitToRoom()`. Use `vi.fn()` to track calls.

**Verify Call Arguments**
Test that correct event names, room IDs, and payloads passed to mock. Example: `expect(mockGateway.sendJobStatus).toHaveBeenCalledWith(startupId, expect.objectContaining({ phase: 'research', status: 'completed' }))`.

**Room Targeting**
Verify startup-specific rooms used for progress updates: `startup-{startupId}`. Verify investor notifications use investor-specific rooms: `investor-{investorId}`.

**Event Frequency**
Test that high-frequency agent progress updates throttled appropriately. Verify coalescing logic if multiple agents update within short time window.

## Test Categories

| Category | Scope | Example | Typical File Name | Coverage Target |
|----------|-------|---------|-------------------|-----------------|
| **Unit** | Single service or agent in isolation | Testing `FieldExtractorService` extracts founder names correctly | `field-extractor.service.spec.ts` | 80% |
| **Schema** | Zod schema validation rules | Testing market schema accepts valid data, rejects invalid | `market.schema.spec.ts` | 100% |
| **Processor** | BullMQ job lifecycle and error handling | Testing extraction processor handles job completion/failure | `extraction.processor.spec.ts` | 90% |
| **Integration** | Multi-service coordination | Testing full pipeline orchestration across phases | `pipeline.service.spec.ts` | 70% |
| **Computation** | Pure mathematical functions | Testing weighted score calculation with known inputs | `score-computation.service.spec.ts` | 100% |

### Unit Test Focus
Test single service method with all external dependencies mocked. Verify method calls correct dependencies with correct arguments. Verify return value matches expected structure. Test error handling: what happens when dependency throws?

### Schema Test Focus
Create test data covering all schema fields. Test required vs optional fields. Test type validation (string vs number). Test custom validators (regex, enums). Test nested object validation. Test array validation (min/max length).

### Processor Test Focus
Test job processing logic with mocked job object. Verify progress updates called. Verify completion/failure handlers triggered. Test retry exhaustion scenarios. Test dead letter queue handling.

### Integration Test Focus
Test multi-step workflows with real service instances (but mocked external APIs). Verify correct sequencing of operations. Verify state transitions. Verify error propagation across service boundaries.

### Computation Test Focus
Pure functions with zero mocks. Test mathematical correctness with known inputs/outputs. Test edge cases: zero values, negative values, boundary values, division by zero. Test normalization: weights sum to 1.0. Test ranking: percentile computation accuracy.

## Mock Data Fixtures

**Location**: `src/modules/ai/tests/fixtures/`

### Required Fixture Files

**mock-startup.fixture.ts**
Exports realistic `Startup` record with:
- Complete profile data (name, description, website, etc.)
- Founder information
- Industry tags array
- Funding stage enum
- Geographic location
- Pitch deck S3 URL
Includes factory function: `createMockStartup(overrides?)` for test variations.

**mock-extraction.fixture.ts**
Exports canned PDF extraction result with:
- Multiple pages of extracted text
- Structured field data (founders, revenue, team size, etc.)
- Table extraction results
- Confidence scores per field
Includes variations: `createMinimalExtraction()`, `createCompleteExtraction()`, `createFailedExtraction()`.

**mock-scraping.fixture.ts**
Exports canned website scraping + LinkedIn data with:
- Homepage content
- About page content
- Team page structured data
- LinkedIn company profile
- LinkedIn employee profiles
- GitHub repository data if applicable
Includes variations for different completeness levels.

**mock-research.fixture.ts**
Exports canned research agent outputs matching research schemas:
- Market research with grounding metadata
- Competitor analysis with citations
- Technology research with sources
- Industry research with trend data
Each includes realistic `groundingMetadata` arrays for citation testing.

**mock-evaluation.fixture.ts**
Exports complete 11-agent evaluation results with:
- All required fields per schema (score, rationale, strengths, risks, recommendations)
- Realistic score distributions (not all 100 or all 50)
- Varied string lengths to test rendering
Factory: `createMockEvaluation(agentKey, overrides?)`.

**mock-synthesis.fixture.ts**
Exports final synthesis output with:
- Executive summary (2-3 paragraphs)
- Key strengths array (4-6 items)
- Key risks array (4-6 items)
- Recommendations array (3-5 items)
- Investor memo markdown (formatted with sections)
- Founder report markdown (constructive tone)
- Data confidence notes
Matches synthesis Zod schema exactly.

**mock-investor.fixture.ts**
Exports diverse investor profiles with:
- Different funding stages (seed, series-a, growth)
- Different geographies (us, europe, asia, etc.)
- Different check sizes ($100k-$10M range)
- Different industry focuses (SaaS, fintech, climate, etc.)
- Different thesis texts (2-3 paragraphs each)
Factory: `createMockInvestor(type: 'seed' | 'growth' | 'generalist')`.

### Fixture Usage Pattern
Import fixtures at top of test file:
```typescript
import { createMockStartup } from '../fixtures/mock-startup.fixture';
```

Use in beforeEach or individual tests:
```typescript
const startup = createMockStartup({ stage: 'series-a' });
```

Override specific fields for edge case testing:
```typescript
const invalidStartup = createMockStartup({ website: null }); // test missing field
```

## Coverage Targets

| Module | Target | Rationale |
|--------|--------|-----------|
| **Schemas** | 100% | Pure validation logic, easy to test exhaustively |
| **Score Computation** | 100% | Pure math, deterministic, critical for accuracy |
| **Processors** | 90% | Cover lifecycle + errors, some BullMQ internals untestable |
| **Services** | 80% | Happy paths + key error scenarios, skip trivial getters |
| **Context Builders** | 80% | Verify correct data selection, not every field combination |
| **Orchestrator** | 85% | Complex state management requires thorough testing |
| **Error Recovery** | 90% | Critical reliability component |

### Measuring Coverage
Run: `bun test --coverage`

Review coverage report for gaps. Focus on:
- Uncovered branches (if/else paths)
- Uncovered error handlers (catch blocks)
- Uncovered edge cases (boundary conditions)

Do NOT chase 100% coverage on trivial code (getters, setters, simple constructors).

## Test Naming Convention

### File Naming
Pattern: `{service-name}.spec.ts`
Examples:
- `field-extractor.service.spec.ts`
- `market.schema.spec.ts`
- `pipeline.service.spec.ts`

### Suite Structure
Three-level hierarchy:
```
describe('ServiceName')
  describe('methodName')
    it('should do X when Y')
```

### Test Case Naming
Use natural language describing behavior:
- "should extract founder names from pitch deck text"
- "should retry on schema validation failure"
- "should not queue research until both extraction and scraping complete"

Avoid:
- "test1", "test2" (meaningless)
- "works" (too vague)
- Technical jargon without context

### Arrange-Act-Assert Pattern
Structure test bodies consistently:
```typescript
it('should compute weighted score correctly', () => {
  // Arrange
  const sectionScores = { market: 85, team: 90, ... };
  const weights = { market: 0.3, team: 0.25, ... };

  // Act
  const result = service.computeWeightedScore(sectionScores, weights);

  // Assert
  expect(result).toBe(87);
});
```

## CI/CD Integration

### Test Execution
All tests run via `bun test` in CI pipeline. Must pass before merge to main branch.

### Pre-Commit Checks
Run locally before committing:
1. `bunx tsc --noEmit` - zero TypeScript errors
2. `bun lint` - zero ESLint errors
3. `bun test` - all tests pass

### Type Safety
**Zero `any` types allowed** in new code. Use proper types or `unknown` with type guards.

Check with: `bunx tsc --noEmit --strict`

### Linting
Fix all warnings before considering task complete. No exceptions.

Run: `bun lint --fix` to auto-fix formatting issues.

### Performance Benchmarks
Monitor test suite execution time. Target: <60 seconds for full suite. Investigate if tests take >2 minutes.

Optimize slow tests:
- Reduce mock data size
- Parallelize independent tests
- Remove unnecessary async operations

## Test Organization Best Practices

### Group Related Tests
Use nested `describe` blocks for logical grouping:
```
describe('SynthesisService')
  describe('orchestration sequence')
    it('should call synthesis agent first')
    it('should compute scores after synthesis')
    it('should update database after scores')
  describe('error handling')
    it('should retry synthesis on schema failure')
    it('should continue on memo generation failure')
```

### Shared Setup
Use `beforeEach` for common setup. Avoid duplication across tests. Reset mocks in `beforeEach` using `vi.clearAllMocks()`.

### Avoid Test Interdependence
Each test must run independently. No shared state between tests. Tests must pass when run in any order.

### Mock Isolation
Create fresh mocks per test suite. Don't share mock instances across test files. Prevents cross-contamination.

### Async Handling
Always `await` async operations in tests. Use `async/await` syntax, not callbacks. Vitest handles async tests natively.

## Common Testing Antipatterns to Avoid

### Testing Implementation Details
**Bad**: Verify private method called
**Good**: Verify public method produces correct output

### Over-Mocking
**Bad**: Mock every single dependency even for integration tests
**Good**: Mock external APIs, use real instances for internal services in integration tests

### Testing Framework Behavior
**Bad**: Test that Zod schema parsing works (library test)
**Good**: Test that your custom validators work

### Brittle Assertions
**Bad**: `expect(text).toBe('exact string with typo')` breaks on minor wording changes
**Good**: `expect(text).toContain('key phrase')` or use `expect.objectContaining()`

### Magic Numbers
**Bad**: `expect(score).toBe(87.234567)`
**Good**: `const expectedScore = computeExpectedScore(weights); expect(score).toBe(expectedScore);`

### Ignoring Errors
**Bad**: Test passes but logs unhandled promise rejection
**Good**: Verify error thrown with `expect(() => ...).toThrow()`

## Example Test Structure (No Code)

### Unit Test Example Structure
File: `field-extractor.service.spec.ts`

Setup:
- Import service and dependencies
- Create mock Mistral SDK
- Create mock startup fixture

Test suite:
- Describe block: FieldExtractorService
  - Describe block: extractFields method
    - Test: should extract founder names from clean text
    - Test: should handle missing founder information gracefully
    - Test: should extract revenue figures with currency normalization
    - Test: should retry on Mistral API timeout
    - Test: should throw on invalid schema response

Each test:
- Arrange: Create mock pitch deck data
- Act: Call service.extractFields()
- Assert: Verify returned object matches expected structure

### Schema Test Example Structure
File: `market.schema.spec.ts`

Setup:
- Import schema
- Create valid and invalid test data

Test suite:
- Describe block: Market Schema
  - Test: should accept valid market research data
  - Test: should reject missing required fields
  - Test: should reject invalid score (negative number)
  - Test: should reject invalid score (>100)
  - Test: should accept missing optional fields
  - Test: should validate nested objects correctly

Each test:
- Arrange: Create test data
- Act: Parse with schema
- Assert: Expect success or expect error with specific message

### Processor Test Example Structure
File: `extraction.processor.spec.ts`

Setup:
- Import processor
- Mock Worker, Job
- Mock ExtractionService
- Mock NotificationGateway

Test suite:
- Describe block: ExtractionProcessor
  - Describe block: process method
    - Test: should call extraction service with correct startup ID
    - Test: should update job progress during processing
    - Test: should emit WebSocket event on completion
    - Test: should retry on transient failure
    - Test: should move to dead letter queue after max retries

Each test:
- Arrange: Create mock job with test data
- Act: Call processor.process(job)
- Assert: Verify service calls, progress updates, event emissions

## Estimated Effort
**Size: S (1 day - reference document)**

This document serves as ongoing reference. Testing is distributed across each phase implementation, not a separate phase. Each developer implements tests alongside feature code using patterns defined here.

### Per-Phase Testing Effort (Embedded in Phase Estimates)
- Phase 3 (Extraction): ~0.5 day testing
- Phase 4 (Scraping): ~0.5 day testing
- Phase 5 (Research): ~0.75 day testing
- Phase 6 (Evaluation): ~1 day testing (11 agents)
- Phase 7 (Synthesis): ~0.5 day testing
- Phase 8 (Orchestration): ~0.75 day testing

Total testing effort: ~4 days distributed across phases.

## Maintenance

### When to Update This Document
- New testing pattern discovered and proven effective
- New external dependency requiring mock strategy
- Coverage targets adjusted based on team consensus
- New fixture types needed for emerging use cases

### Review Cycle
Quarterly review of:
- Coverage targets still appropriate?
- Mock patterns still following best practices?
- Test execution time acceptable?
- Fixture data still realistic?

### Continuous Improvement
Capture testing pain points and solutions. Share across team. Update this document when consensus reached on better approach.
