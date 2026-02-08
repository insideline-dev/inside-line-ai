# Phase 3: PDF Extraction Service

## Overview

Extract text from pitch deck PDFs via two paths: (1) pdf-parse for text PDFs (fast, free), (2) Mistral OCR for image/scanned PDFs. Then extract structured fields via GPT-4o-mini + Zod schema.

## Prerequisites

- Phase 1 (Foundation) completed: `AiProviderService`, `PipelineStateService`, queue infrastructure
- S3 bucket configured for pitch deck storage
- Mistral API credentials in environment
- OpenAI API credentials for GPT-4o-mini

## Architecture Overview

```
PDF Upload → S3 Storage → Extraction Queue
                              ↓
                    [ExtractionProcessor]
                              ↓
                    Try pdf-parse first
                              ↓
                  hasContent? ─┬─ Yes → Use text
                               │
                               └─ No → Mistral OCR (presigned URL)
                                        ↓
                              GPT-4o-mini Field Extraction
                                        ↓
                              Store in Redis Pipeline State
                                        ↓
                              WebSocket Progress Update
```

## Deliverables

| File | Purpose | Key Methods |
|------|---------|-------------|
| `src/modules/ai/extraction/extraction.module.ts` | Sub-module imported by AiModule | Module definition with providers and exports |
| `src/modules/ai/extraction/pdf-text-extractor.service.ts` | Uses `pdf-parse` for fast text extraction | `extractText(buffer: Buffer): Promise<PdfTextResult>` |
| `src/modules/ai/extraction/mistral-ocr.service.ts` | Wraps Mistral OCR API | `extractFromPdf(presignedUrl: string): Promise<MistralOcrResult>` |
| `src/modules/ai/extraction/field-extractor.service.ts` | Uses AI SDK `generateObject()` with GPT-4o-mini | `extractFields(rawText: string, startupContext?: Partial<Startup>): Promise<ExtractedFields>` |
| `src/modules/ai/extraction/extraction.service.ts` | Orchestrator service | `processExtraction(jobData: ExtractionJobData): Promise<ExtractionResult>` |
| `src/modules/ai/extraction/extraction.processor.ts` | BullMQ processor for `ai-extraction` queue | Extends `BaseProcessor` from `src/queue/processors/base.processor.ts` |

## Key Interface Definitions

### PdfTextResult
```typescript
{
  text: string;
  pageCount: number;
  hasContent: boolean; // False if only page markers, no actual content
}
```

### MistralOcrResult
```typescript
{
  text: string;
  pages: Array<{ pageNumber: number; content: string }>;
}
```

### ExtractedFields
Inferred from extraction Zod schema at `src/modules/ai/schemas/extraction.schema.ts`

### ExtractionResult
```typescript
{
  text: string;
  source: 'pdf-parse' | 'mistral-ocr';
  pageCount: number;
  fields: ExtractedFields;
  rawPages?: Array<{ pageNumber: number; content: string }>; // Only from OCR
}
```

### ExtractionJobData
```typescript
extends AiPipelineBaseJobData {
  deckPath: string; // S3 key
  deckUrl?: string; // Optional direct URL
}
```

### ExtractionJobResult
```typescript
extends BaseJobResult {
  extractionResult: ExtractionResult;
}
```

## Detailed Component Specifications

### pdf-text-extractor.service.ts

**Package**: `pdf-parse`

**Responsibilities**:
- Extract text from text-based PDFs (fast path)
- Detect if PDF contains actual text content vs. just page markers
- Return page count and extracted text

**Key Implementation Details**:
- Must implement `hasActualContent()` check to detect scanned PDFs
- Reference old backend `langchain-agents.ts` line 102 for the pattern
- Consider content "empty" if only whitespace, page numbers, or structural markers
- Typical heuristic: < 50 chars per page = likely scanned

**Error Handling**:
- Corrupted PDF: throw `UnrecoverableError` (no retry)
- Empty/unreadable PDF: return `hasContent: false` to trigger OCR fallback

### mistral-ocr.service.ts

**Package**: `@mistralai/mistralai`

**API Configuration**:
- Model: `mistral-ocr-latest`
- Document input: `document_url` type (S3 presigned URL)
- Options:
  - `tableFormat: "html"` (preserve table structure)
  - `includeImageBase64: true` (capture embedded charts/graphs)

**Responsibilities**:
- Generate presigned S3 URL (read-only, 15 min expiry)
- Call Mistral OCR API with presigned URL
- Parse response into per-page markdown
- Aggregate into full text

**Method Signature**:
```typescript
async extractFromPdf(presignedUrl: string): Promise<MistralOcrResult>
```

**Error Handling**:
- Mistral API 500: throw `RecoverableError` (retry with backoff)
- Mistral API 400 (bad file): throw `UnrecoverableError`
- Rate limit (429): throw `RecoverableError` with exponential backoff

### field-extractor.service.ts

**Package**: AI SDK (`@ai-sdk/openai`)

**Model**: `gpt-4o-mini`

**Responsibilities**:
- Take raw text (from pdf-parse or Mistral OCR)
- Use AI SDK `generateObject()` with extraction Zod schema
- Merge AI-extracted fields with existing startup DB data
- Return validated extraction result

**Method Signature**:
```typescript
async extractFields(
  rawText: string,
  startupContext?: Partial<Startup>
): Promise<ExtractedFields>
```

**Merge Strategy**:
- DB data takes precedence for immutable fields (id, createdAt)
- AI-extracted data overwrites editable fields (name, description, metrics)
- Append to array fields (team members, products)
- Use startupContext to provide hints (e.g., existing team member names)

**Prompt Engineering**:
- System: "Extract structured data from startup pitch deck"
- Include schema description in prompt
- Use few-shot examples for complex fields (metrics, team roles)

**Error Handling**:
- OpenAI API error: throw `RecoverableError`
- Zod validation error: log warning, return partial data
- Empty text: return empty schema with defaults

### extraction.service.ts

**Orchestration Flow**:
1. Download PDF buffer from S3 using `deckPath`
2. Attempt pdf-parse extraction
3. Check `hasContent`:
   - If `true`: use pdf-parse text, skip to step 6
   - If `false`: continue to step 4
4. Generate S3 presigned URL (15 min expiry, read-only)
5. Call Mistral OCR with presigned URL
6. Run field extraction with GPT-4o-mini
7. Store `ExtractionResult` in Redis pipeline state under key `extraction`
8. Return result

**Method Signature**:
```typescript
async processExtraction(jobData: ExtractionJobData): Promise<ExtractionResult>
```

**Redis Pipeline State Structure**:
```typescript
pipeline:{startupId} = {
  extraction: {
    text: string,
    source: 'pdf-parse' | 'mistral-ocr',
    fields: ExtractedFields,
    completedAt: ISO8601
  }
}
```

**Error Handling**:
- S3 file not found: throw `UnrecoverableError`
- Both extractors fail: throw `UnrecoverableError` with details
- Field extraction fails: store raw text, mark fields as incomplete

### extraction.processor.ts

**Queue Name**: `ai-extraction`

**Base Class**: `BaseProcessor` from `src/queue/processors/base.processor.ts`

**Process Method**:
```typescript
async process(job: Job<ExtractionJobData>): Promise<ExtractionJobResult>
```

**Job Lifecycle**:
1. Validate job data (deckPath exists)
2. Emit WebSocket `job:status` with `status: 'processing'`
3. Call `extractionService.processExtraction(job.data)`
4. Store result in Redis via `pipelineStateService`
5. Update job progress (0% → 50% → 100%)
6. Emit WebSocket `job:status` with `status: 'completed'`
7. Return `ExtractionJobResult`

**Progress Mapping**:
- 0%: Job started
- 25%: PDF text extracted
- 50%: OCR completed (if needed)
- 75%: Field extraction started
- 100%: Results stored in Redis

**WebSocket Events**:
```typescript
{
  event: 'job:status',
  data: {
    jobId: string,
    startupId: string,
    phase: 'extraction',
    status: 'processing' | 'completed' | 'failed',
    progress: number,
    result?: ExtractionResult
  }
}
```

## Acceptance Criteria

### Functional Requirements
- [ ] Text PDF (e.g., Canva-generated): pdf-parse returns text with `hasContent: true`
- [ ] Image PDF (scanned): pdf-parse returns `hasContent: false`, triggers Mistral OCR
- [ ] Mistral OCR receives presigned URL and returns markdown per page
- [ ] Field extraction produces valid data matching `extraction.schema.ts`
- [ ] Results stored in Redis under `pipeline:{startupId}` with `extraction` key
- [ ] Non-existent deck throws `UnrecoverableError` (no retry)
- [ ] WebSocket `job:status` emitted at start and completion

### Non-Functional Requirements
- [ ] pdf-parse completes in < 2 seconds for 20-page deck
- [ ] Mistral OCR completes in < 30 seconds for 20-page scanned deck
- [ ] Field extraction completes in < 5 seconds
- [ ] Redis storage uses TTL of 24 hours for extraction results
- [ ] Presigned URLs expire in 15 minutes
- [ ] Graceful degradation if OpenAI API fails (store raw text, retry field extraction later)

### Error Handling
- [ ] Corrupted PDF: `UnrecoverableError` with message "Corrupted PDF file"
- [ ] S3 access denied: `UnrecoverableError` with message "Deck file not accessible"
- [ ] Mistral API 500: `RecoverableError` with retry (max 3 attempts)
- [ ] OpenAI timeout: `RecoverableError` with retry (max 2 attempts)

## Test Plan

### pdf-text-extractor.service.spec.ts
**Mock Strategy**: Mock `pdf-parse` package

**Test Cases**:
- [ ] Rich text PDF: Returns `hasContent: true` with text length > 500 chars
- [ ] Page markers only: Returns `hasContent: false` with text < 50 chars
- [ ] Empty PDF: Returns `hasContent: false`
- [ ] Corrupted PDF: Throws `UnrecoverableError`
- [ ] Multi-page PDF: Returns correct `pageCount`

### mistral-ocr.service.spec.ts
**Mock Strategy**: Mock `@mistralai/mistralai` client

**Test Cases**:
- [ ] Successful OCR: Returns canned response with pages array
- [ ] API 500 error: Throws `RecoverableError`
- [ ] API 400 error: Throws `UnrecoverableError`
- [ ] Rate limit (429): Throws `RecoverableError` with backoff
- [ ] Presigned URL generation: Creates valid S3 URL with 15 min expiry

### field-extractor.service.spec.ts
**Mock Strategy**: Mock AI SDK `generateObject`

**Test Cases**:
- [ ] Valid extraction: Returns schema-compliant data
- [ ] Garbage input: Returns partial data with defaults
- [ ] Empty text: Returns empty schema
- [ ] Zod validation error: Logs warning, returns partial
- [ ] OpenAI API error: Throws `RecoverableError`
- [ ] Context merge: DB data takes precedence over AI data

### extraction.service.spec.ts
**Mock Strategy**: Mock both extractors (pdf-parse and Mistral OCR)

**Test Cases**:
- [ ] pdf-parse success: Skips OCR, returns text result
- [ ] pdf-parse `hasContent: false`: Triggers OCR fallback
- [ ] Both extractors fail: Throws `UnrecoverableError`
- [ ] S3 download fails: Throws `UnrecoverableError`
- [ ] Field extraction fails: Stores raw text, marks incomplete
- [ ] Redis storage: Verifies pipeline state structure

### extraction.processor.spec.ts
**Mock Strategy**: Follow pattern from `scoring.processor.spec.ts`. Mock `Worker`, mock `ExtractionService`

**Test Cases**:
- [ ] Job lifecycle: Start → processing → completed
- [ ] Progress updates: 0% → 25% → 50% → 75% → 100%
- [ ] WebSocket events: Emits at start and completion
- [ ] Recoverable error: Job retries with backoff
- [ ] Unrecoverable error: Job fails immediately
- [ ] Redis state: Verifies extraction data stored

## Integration Points

### S3 Service
- Download PDF buffer via `deckPath`
- Generate presigned URL for Mistral OCR (read-only, 15 min)

### Redis (PipelineStateService)
- Store extraction results under `pipeline:{startupId}`
- TTL: 24 hours

### WebSocket Gateway
- Emit `job:status` events to startup-specific room

### Next Phase Handoff
- Scraping (Phase 4) reads `pipeline:{startupId}.extraction.fields.website` to discover URLs
- Scoring (Phase 5) uses all extracted fields for match scoring

## Environment Variables

```bash
MISTRAL_API_KEY=sk-...
MISTRAL_OCR_MODEL=mistral-ocr-latest
OPENAI_API_KEY=sk-...
FIELD_EXTRACTION_MODEL=gpt-4o-mini
PDF_EXTRACTION_TIMEOUT_MS=60000
MISTRAL_OCR_TIMEOUT_MS=120000
```

## Estimated Effort

**Size**: M (Medium)
**Duration**: 2-3 days
**Complexity**: Moderate (two-path logic, fallback handling, external API integration)

## Success Metrics

- 95% of text PDFs processed via pdf-parse (fast path)
- < 5% of PDFs require Mistral OCR fallback
- Field extraction accuracy > 80% (manually validated sample)
- P95 latency < 10 seconds (text PDF), < 45 seconds (OCR PDF)
- Zero job retries for unrecoverable errors
