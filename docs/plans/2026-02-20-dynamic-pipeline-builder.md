# Dynamic AI Agent Pipeline Builder — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let admins visually configure the AI pipeline — edit agent output schemas, prompts, models, and add/remove agents within orchestrators — via an interactive node-based canvas (N8N-style).

**Architecture:** Build on the existing `origin/flow` branch which has a partial ReactFlow canvas, `pipeline_flow_configs` table, typed `ai-flow-catalog.ts` with ports, prompt/model revision management, and step-level tracing. Extend with schema registry, dynamic agent config, improved canvas UX (undo/redo, distinct node types, proper handles), visual schema editor, and variable picker.

**Tech Stack:** @xyflow/react v12.10.1 (already installed), dagre (already installed), Drizzle ORM, AI SDK v6 `Output.object()` with runtime Zod, NestJS.

**Base branch:** `origin/flow`

---

## What Already Exists (from `origin/flow`)

### Backend — DONE, do not rebuild
| Component | File | Status |
|-----------|------|--------|
| Pipeline flow config table | `entities/pipeline-flow-config.schema.ts` | Done |
| Flow config CRUD service | `services/pipeline-flow-config.service.ts` | Done |
| Typed DAG with ports | `services/ai-flow-catalog.ts` (`AiFlowPort` with `fromNodeId`/`toNodeIds`) | Done |
| Prompt revision CRUD | `services/ai-prompt-service.ts` | Done |
| Model config CRUD | `services/ai-model-config.service.ts` | Done |
| Prompt runtime + preview | `services/ai-prompt-runtime.service.ts` | Done |
| Output schema endpoint | `GET /admin/ai-prompts/:key/output-schema` (Zod→JSON Schema) | Done |
| Context schema endpoint | `GET /admin/ai-prompts/:key/context-schema` | Done |
| 38 admin endpoints | Flow config, prompts, model config, preview, seed | Done |
| Step-level tracing | All 7 processors enhanced with `traceKind` + `stepKey` | Done |
| PhaseTransition + refreshConfig | `orchestrator/phase-transition.service.ts` | Done |
| Progress tracker | `orchestrator/progress-tracker.service.ts` | Done |

### Frontend — EXISTS but needs major improvements
| Component | File | Status | Issues |
|-----------|------|--------|--------|
| ReactFlow canvas | `components/pipeline/PipelineCanvas.tsx` | Partial | Single node type, no undo, immutable graph |
| Pipeline node | `components/pipeline/PipelineNode.tsx` | Partial | 2px handles, no visual distinction by type |
| Config sheet | `components/pipeline/NodeConfigSheet.tsx` | Partial | Timeout/retry editing works, upstream schema view works |
| Prompt editor | `components/pipeline/NodePromptEditor.tsx` | Working | Variable insertion, revision history, save & publish |
| Schema tree view | `components/pipeline/SchemaTreeView.tsx` | Working | View-only, recursive tree with copy/pick |
| Layout (dagre) | `components/pipeline/layout.ts` | Working | LR layout, 60/120 spacing |
| Flow route | `routes/_protected/admin/flow.tsx` | Partial | Draft/publish UI, config loading broken |
| Types | `components/pipeline/types.ts` | Done | PhaseConfig, PipelineConfig |

### What's NOT in flow branch (needs building)
1. Schema registry (DB-backed, versioned output schemas)
2. Schema compiler (JSON → Zod runtime)
3. Dynamic agent config (add/remove/disable agents)
4. Visual schema editor (not just viewer)
5. Variable picker with `{{node.field}}` insertion
6. Dynamic prompt variable resolution at runtime
7. Distinct node types (fixed vs AI vs orchestrator)
8. Undo/redo on canvas
9. Better handles and edge interactivity
10. Pipeline template versioning (snapshot per run)

---

## Existing Infrastructure (DO NOT break)

| System | Key Files | Contract |
|--------|-----------|----------|
| Pipeline execution | `services/pipeline.service.ts`, `orchestrator/` | BullMQ processors stay intact |
| Prompt runtime | `services/ai-prompt-runtime.service.ts` | Published revisions override code defaults |
| Model config | `services/ai-model-config.service.ts` | Stage-aware resolution stays |
| Evaluation registry | `services/evaluation-agent-registry.service.ts` | `runAll()` / `runOne()` stay |
| Research orchestrator | `services/research.service.ts` | Phase 1/Phase 2 fan-out stays |
| Flow catalog | `services/ai-flow-catalog.ts` | Typed ports, read by frontend |
| Flow config | `services/pipeline-flow-config.service.ts` | Draft/publish lifecycle stays |
| Existing canvas components | `components/pipeline/*` | Will be improved, not deleted |
| DB tables | `pipeline_flow_configs`, `ai_prompt_definitions`, `ai_prompt_revisions`, `ai_model_config_revisions` | Additive only |

---

## Phase 1: Agent Output Schema Registry (Backend)

### Why first
Everything downstream depends on schemas in DB. The existing `GET /output-schema` endpoint returns Zod→JSON Schema but doesn't support versioned drafts or editing.

### Task 1.1: Create `aiAgentSchemaRevision` DB entity

**Files:**
- Create: `backend/src/modules/ai/entities/ai-agent-schema-revision.entity.ts`
- Modify: `backend/src/modules/ai/entities/index.ts` (add export)
- Modify: `backend/src/database/schema.ts` (add barrel export)

**Schema:**
```typescript
import { pgTable, uuid, jsonb, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { aiPromptDefinition } from "./ai-prompt-definition.schema";
import { user } from "../../user/entities/user.entity";
// Reuse existing enums from ai-prompt-revision or pipeline-flow-config
import { revisionStatusEnum, startupStageEnum } from "./shared-enums";

export const aiAgentSchemaRevision = pgTable("ai_agent_schema_revisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  definitionId: uuid("definition_id").references(() => aiPromptDefinition.id).notNull(),
  stage: startupStageEnum("stage"),
  status: revisionStatusEnum("status").default("draft").notNull(),
  schemaJson: jsonb("schema_json").$type<SchemaDescriptor>().notNull(),
  version: integer("version").default(1).notNull(),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => user.id),
  publishedBy: uuid("published_by").references(() => user.id),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => ({
  definitionIdx: index("ai_agent_schema_rev_definition_idx").on(table.definitionId),
  defStageStatusIdx: index("ai_agent_schema_rev_def_stage_status_idx")
    .on(table.definitionId, table.stage, table.status),
}));
```

**`SchemaDescriptor` format** — the JSON stored in `schemaJson`:
```json
{
  "type": "object",
  "fields": {
    "score": { "type": "number", "min": 0, "max": 100, "description": "Overall score" },
    "confidence": { "type": "number", "min": 0, "max": 1 },
    "feedback": { "type": "string" },
    "strengths": { "type": "array", "items": { "type": "string" } },
    "founders": {
      "type": "array",
      "items": {
        "type": "object",
        "fields": {
          "name": { "type": "string" },
          "role": { "type": "string" },
          "score": { "type": "number", "min": 0, "max": 100 }
        }
      }
    },
    "recommendation": { "type": "enum", "values": ["strong_pass", "pass", "consider", "decline"] }
  }
}
```

**Steps:**
1. Create entity file
2. Add to barrel exports
3. Run `cd backend && bun db:generate && bun db:push`
4. Verify migration

---

### Task 1.2: Schema JSON ↔ Zod runtime compiler

**Files:**
- Create: `backend/src/modules/ai/interfaces/schema.interface.ts`
- Create: `backend/src/modules/ai/services/schema-compiler.service.ts`
- Create: `backend/src/modules/ai/tests/services/schema-compiler.spec.ts`

**Types** (in `schema.interface.ts`):
```typescript
export type SchemaFieldType = "string" | "number" | "boolean" | "array" | "object" | "enum";

export interface SchemaField {
  type: SchemaFieldType;
  description?: string;
  optional?: boolean;
  min?: number;          // number: min value
  max?: number;          // number: max value
  default?: unknown;
  items?: SchemaField;   // array item type
  fields?: Record<string, SchemaField>;  // object children
  values?: string[];     // enum values
}

export interface SchemaDescriptor {
  type: "object";
  fields: Record<string, SchemaField>;
}
```

**Service interface:**
```typescript
@Injectable()
export class SchemaCompilerService {
  /** JSON descriptor → runtime Zod schema for Output.object() */
  compile(descriptor: SchemaDescriptor): z.ZodObject<any>;

  /** Existing Zod schema → JSON descriptor for DB storage */
  serialize(schema: z.ZodObject<any>): SchemaDescriptor;

  /** Validate a descriptor is well-formed */
  validate(input: unknown): { valid: boolean; errors: string[] };

  /** Extract all dot-paths for variable picker: ["score", "founders[].name", ...] */
  extractFieldPaths(descriptor: SchemaDescriptor): string[];
}
```

**Test cases:**
1. Compile simple flat object (string, number, boolean)
2. Compile nested object
3. Compile array of strings
4. Compile array of objects
5. Compile enum field
6. Compile with min/max constraints
7. Optional fields
8. Roundtrip: serialize existing Zod → compile back → validate same data passes
9. `extractFieldPaths` returns correct dot-paths including `[]` for arrays
10. `validate` rejects malformed descriptors

---

### Task 1.3: Schema registry CRUD service

**Files:**
- Create: `backend/src/modules/ai/services/agent-schema-registry.service.ts`
- Modify: `backend/src/modules/ai/ai.module.ts` (add provider)

**Pattern:** Follow `ai-model-config.service.ts` exactly — draft→published→archived lifecycle.

**Interface:**
```typescript
@Injectable()
export class AgentSchemaRegistryService {
  listRevisionsByKey(key: AiPromptKey): Promise<{ definition: ...; revisions: SchemaRevision[] }>;
  getPublished(key: AiPromptKey, stage?: StartupStage): Promise<SchemaDescriptor | null>;
  createDraft(key: AiPromptKey, adminId: string, input: { schemaJson: SchemaDescriptor; notes?: string; stage?: StartupStage }): Promise<SchemaRevision>;
  updateDraft(key: AiPromptKey, revisionId: string, input: { schemaJson?: SchemaDescriptor; notes?: string }): Promise<SchemaRevision>;
  publishRevision(key: AiPromptKey, revisionId: string, adminId: string): Promise<SchemaRevision>;

  /** Resolution: published DB (key+stage) → published DB (key+null) → code default */
  resolveSchema(key: AiPromptKey, stage?: StartupStage): Promise<z.ZodObject<any>>;

  /** Same as resolveSchema but returns the raw descriptor (for frontend) */
  resolveDescriptor(key: AiPromptKey, stage?: StartupStage): Promise<SchemaDescriptor>;
}
```

---

### Task 1.4: Seed existing Zod schemas into DB

**Files:**
- Modify: `backend/src/modules/ai/services/ai-prompt.service.ts` (extend existing seed logic)

**Purpose:** On `POST /admin/ai-prompts/seed-from-code`, also seed all 17 agent schemas.

**Steps:**
1. Import all agent Zod schemas (5 research + 11 evaluation + 1 synthesis)
2. Use `SchemaCompilerService.serialize()` on each
3. Upsert into `aiAgentSchemaRevision` with status="published"
4. Test roundtrip: original Zod validates test data → serialize → compile → same test data still validates

---

### Task 1.5: Schema CRUD admin endpoints

**Files:**
- Modify: `backend/src/modules/admin/admin.controller.ts`
- Create: `backend/src/modules/admin/dto/ai-schema.dto.ts`

**Endpoints** (extend existing admin controller):
```
GET    /admin/ai-prompts/:key/schema-revisions              → list revisions
POST   /admin/ai-prompts/:key/schema-revisions              → create draft
PATCH  /admin/ai-prompts/:key/schema-revisions/:revisionId  → update draft
POST   /admin/ai-prompts/:key/schema-revisions/:revisionId/publish → publish
```

**After adding:** `cd frontend && bun generate:api`

---

## Phase 2: Dynamic Agent Configuration (Backend)

### Why second
Before adding/removing agents in the UI, backend needs a registry the orchestrators read from at runtime.

### Task 2.1: Create `aiAgentConfig` DB entity

**Files:**
- Create: `backend/src/modules/ai/entities/ai-agent-config.entity.ts`
- Modify: `backend/src/modules/ai/entities/index.ts`
- Modify: `backend/src/database/schema.ts`

**Schema:**
```typescript
export const aiAgentConfig = pgTable("ai_agent_configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  flowId: varchar("flow_id", { length: 50 }).notNull(),
  orchestratorNodeId: varchar("orchestrator_node_id", { length: 120 }).notNull(),
  agentKey: varchar("agent_key", { length: 120 }).notNull(),
  label: text("label").notNull(),
  description: text("description"),
  kind: aiFlowNodeKindEnum("kind").default("prompt").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  promptDefinitionId: uuid("prompt_definition_id").references(() => aiPromptDefinition.id),
  executionPhase: integer("execution_phase").default(1).notNull(),
  dependsOn: jsonb("depends_on").$type<string[]>().default([]),
  sortOrder: integer("sort_order").default(0).notNull(),
  isCustom: boolean("is_custom").default(false).notNull(),
  createdBy: uuid("created_by").references(() => user.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => ({
  uniqueAgent: unique().on(table.flowId, table.orchestratorNodeId, table.agentKey),
  orchestratorIdx: index("ai_agent_config_orchestrator_idx").on(table.flowId, table.orchestratorNodeId),
}));
```

**Steps:**
1. Create entity, add to barrels
2. `bun db:generate && bun db:push`
3. Create `AgentConfigService` with: `listByOrchestrator()`, `getEnabled()`, `create()`, `update()`, `toggleEnabled()`, `delete()` (custom only)
4. Create seed method from `ai-flow-catalog.ts` node definitions

---

### Task 2.2: `DynamicAgentRunner` service

**Files:**
- Create: `backend/src/modules/ai/services/dynamic-agent-runner.service.ts`

**Purpose:** Generic executor for admin-created custom agents. Reads prompt + model + schema from DB, calls `generateText({ output: Output.object({ schema }) })`.

```typescript
@Injectable()
export class DynamicAgentRunnerService {
  constructor(
    private promptRuntime: AiPromptRuntimeService,
    private modelConfig: AiModelConfigService,
    private schemaRegistry: AgentSchemaRegistryService,
    private schemaCompiler: SchemaCompilerService,
    private providers: AiProviderService,
    private aiConfig: AiConfigService,
  ) {}

  async run(params: {
    agentKey: string;
    promptKey: AiPromptKey;
    pipelineData: EvaluationPipelineInput | ResearchPipelineInput;
    stage?: StartupStage;
  }): Promise<{ key: string; output: unknown; usedFallback: boolean; error?: string }>;
}
```

**Implementation mirrors `BaseEvaluationAgent.run()`:**
1. Resolve prompt → render with variables
2. Resolve model → get provider
3. Resolve schema → compile to Zod
4. `generateText({ output: Output.object({ schema }), ... })`
5. Retry up to 3 times with exponential backoff
6. Fallback: return empty schema-validated object

---

### Task 2.3: Make `EvaluationAgentRegistryService` dynamic

**Files:**
- Modify: `backend/src/modules/ai/services/evaluation-agent-registry.service.ts`

**Changes:**
1. Add `AgentConfigService` to constructor
2. New `resolveAgents()` method:
   - Query enabled agents for `evaluation_orchestrator` from `AgentConfigService`
   - Built-in agents (`isCustom=false`): look up in existing DI map
   - Custom agents (`isCustom=true`): wrap in `DynamicAgentRunner`
   - **Fallback**: if no DB configs exist, use hardcoded `this.agents` list
3. Change `runAll()` to call `resolveAgents()` at start
4. `runOne()` also checks dynamic registry

---

### Task 2.4: Make `ResearchService` dynamic

**Files:**
- Modify: `backend/src/modules/ai/services/research.service.ts`

**Same pattern as 2.3:**
1. Query enabled agents from `AgentConfigService` for `research_orchestrator`
2. Group by `executionPhase`
3. Phase 1 parallel, Phase 2 after with Phase 1 context
4. Fallback to hardcoded keys if no DB config

---

### Task 2.5: Agent config admin endpoints

**Files:**
- Modify: `backend/src/modules/admin/admin.controller.ts`
- Create: `backend/src/modules/admin/dto/ai-agent-config.dto.ts`

**Endpoints:**
```
GET    /admin/ai/agent-configs                                     → list all, grouped by orchestrator
GET    /admin/ai/agent-configs/:orchestratorId                     → list agents for orchestrator
POST   /admin/ai/agent-configs/:orchestratorId                     → create custom agent
PATCH  /admin/ai/agent-configs/:orchestratorId/:agentKey           → update
DELETE /admin/ai/agent-configs/:orchestratorId/:agentKey           → delete (custom only)
PATCH  /admin/ai/agent-configs/:orchestratorId/:agentKey/toggle    → enable/disable
```

**After adding:** `cd frontend && bun generate:api`

---

### Task 2.6: Dynamic flow catalog overlay

**Files:**
- Create: `backend/src/modules/ai/services/dynamic-flow-catalog.service.ts`
- Modify: `backend/src/modules/admin/admin.controller.ts` (`GET /ai-prompts/flow`)

**Current:** `GET /ai-prompts/flow` returns static `AI_FLOW_DEFINITIONS`.

**New:** `DynamicFlowCatalogService` reads static catalog + overlays DB agent configs:
- Custom agents → new nodes + edges under their orchestrator
- Disabled built-in agents → node marked `enabled: false`
- Returns merged `AiFlowDefinition[]`

---

## Phase 3: Canvas UX Overhaul (Frontend)

### Why third
Backend ready. Now fix the existing canvas — don't rebuild from scratch, improve what's there.

### Task 3.1: Add distinct node type components

**Files:**
- Create: `frontend/src/components/pipeline/nodes/FixedDataNode.tsx`
- Create: `frontend/src/components/pipeline/nodes/AiAgentNode.tsx`
- Create: `frontend/src/components/pipeline/nodes/OrchestratorNode.tsx`
- Modify: `frontend/src/components/pipeline/PipelineCanvas.tsx` (register types)

**Replaces** the single `PipelineNode.tsx` with 3 specialized components.

**Classification logic** (in `PipelineCanvas.tsx` when mapping flow nodes):
```typescript
function getNodeType(node: FlowNode): string {
  if (node.id.includes("orchestrator")) return "orchestrator";
  if (node.kind === "system") return "fixedData";
  return "aiAgent"; // kind === "prompt"
}
```

**Visual design:**
- **FixedDataNode**: `border-muted bg-muted/30`, dashed border, Cog icon, read-only badge, shows typed output ports
- **AiAgentNode**: `border-primary bg-primary/5`, Bot icon, editable badge, model name pill, schema field count badge, enable/disable toggle switch. Click opens config sheet.
- **OrchestratorNode**: `border-violet-500 bg-violet-50`, Workflow icon, child count badge (`5 agents`), fan-out/fan-in arrows

**Handles for all:** Larger handles (8x8px), styled distinctly per node type, visible on hover:
```tsx
<Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-primary !border-2 !border-background" />
<Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-primary !border-2 !border-background" />
```

---

### Task 3.2: Undo/redo support

**Files:**
- Create: `frontend/src/components/pipeline/hooks/use-undo-redo.ts`
- Modify: `frontend/src/components/pipeline/PipelineCanvas.tsx`

**Implementation:** History stack for `PhaseConfig[]` changes (the editable state):
```typescript
function useUndoRedo<T>(initial: T) {
  const [past, setPast] = useState<T[]>([]);
  const [present, setPresent] = useState(initial);
  const [future, setFuture] = useState<T[]>([]);

  const push = (next: T) => { setPast([...past, present]); setPresent(next); setFuture([]); };
  const undo = () => { /* pop past, push present to future */ };
  const redo = () => { /* pop future, push present to past */ };
  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  return { present, push, undo, redo, canUndo, canRedo };
}
```

**Keyboard shortcuts:** Register `Ctrl+Z` (undo) and `Ctrl+Shift+Z` (redo) via `useEffect` keydown listener.

**Wire into `flow.tsx`:** Replace `setPipelineConfig` with `history.push()`, pass `undo`/`redo` to canvas toolbar.

---

### Task 3.3: Fix edge styling and data flow labels

**Files:**
- Modify: `frontend/src/components/pipeline/PipelineCanvas.tsx`

**Changes:**
1. Animated edges for running pipelines (dotted stroke animation)
2. Edge labels showing data type from `AiFlowPort.type` (e.g., "object", "array")
3. Colored edges by data type: `text→gray`, `object→blue`, `array→green`, `number→amber`
4. Selected edge highlight (`stroke-width: 3`)
5. Edge hover tooltip showing port labels

---

### Task 3.4: Fix flow.tsx config loading

**Files:**
- Modify: `frontend/src/routes/_protected/admin/flow.tsx`

**Current bug:** `handleLoadConfig` sets `draftId` but doesn't load the phases from the config into state.

**Fix:**
```typescript
const handleLoadConfig = (config: PipelineFlowConfig) => {
  setDraftId(config.id);
  // Actually load the phase config into state:
  const loadedPhases = (config.pipelineConfig as PipelineConfig).phases;
  if (loadedPhases) {
    history.push(loadedPhases);  // Use undo-redo push
  }
};
```

---

### Task 3.5: Canvas toolbar

**Files:**
- Create: `frontend/src/components/pipeline/CanvasToolbar.tsx`
- Modify: `frontend/src/components/pipeline/PipelineCanvas.tsx`

**Toolbar items:**
- Undo / Redo buttons (with Ctrl+Z/Ctrl+Shift+Z hints)
- Zoom controls (fit view, zoom in/out)
- "Unsaved changes" indicator
- "Save Draft" / "Publish" buttons (moved from flow.tsx header into canvas)
- Node count / edge count info

---

## Phase 4: Visual Schema Editor (Frontend)

### Why fourth
Canvas is usable. Now add schema editing — the existing `SchemaTreeView.tsx` is view-only.

### Task 4.1: Schema editor component

**Files:**
- Create: `frontend/src/components/pipeline/schema-editor/SchemaEditor.tsx`
- Create: `frontend/src/components/pipeline/schema-editor/FieldRow.tsx`
- Create: `frontend/src/components/pipeline/schema-editor/schema-types.ts`

**`schema-types.ts`:** Mirror backend `SchemaDescriptor` / `SchemaField` types.

**`FieldRow.tsx`:** Recursive component:
```
┌─ [field_name] ──────────────────────────────────┐
│ Type: [string|number|boolean|array|object|enum ▾]│
│ Description: [..............................]     │
│ Required: [x]  Min: [0]  Max: [100]        [🗑]  │
│ ┌─ nested children if object/array ──────────┐   │
│ │  (recursive FieldRow components)            │   │
│ │  [+ Add Field]                              │   │
│ └────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

**`SchemaEditor.tsx`:** Manages field list, add/remove/reorder, save/publish:
- Fetches current schema from `GET /admin/ai-prompts/:key/schema-revisions`
- Edits in-memory `SchemaDescriptor`
- "Save Draft" → `POST /admin/ai-prompts/:key/schema-revisions`
- "Publish" → `POST /admin/ai-prompts/:key/schema-revisions/:id/publish`
- "Preview JSON" toggle showing raw descriptor
- Client-side validation before save

---

### Task 4.2: Integrate schema editor into NodeConfigSheet

**Files:**
- Modify: `frontend/src/components/pipeline/NodeConfigSheet.tsx`

**Add "Schema" tab** (alongside existing Queue Config, Input/Output, Prompts tabs):
- For AI agent nodes (`kind === "prompt"`): render `SchemaEditor` with the node's prompt key
- For fixed/system nodes: render existing `SchemaTreeView` (read-only)
- Show field count badge on tab header

---

## Phase 5: Variable Picker & Dynamic Prompts

### Why fifth
Schemas are editable. Now enable `{{node.field}}` references in prompts.

### Task 5.1: Backend upstream fields endpoint

**Files:**
- Modify: `backend/src/modules/admin/admin.controller.ts`

**Endpoint:**
```
GET /admin/ai-prompts/:nodeId/upstream-fields
→ { nodeId: string; label: string; fields: { path: string; type: string; description?: string }[] }[]
```

**Logic:**
1. Walk edges backward from `nodeId` in dynamic flow catalog
2. For each upstream node with `promptKeys`, resolve output schema via `AgentSchemaRegistryService`
3. Use `SchemaCompilerService.extractFieldPaths()` for dot-paths
4. Return grouped by upstream node

---

### Task 5.2: Enhanced variable picker in prompt editor

**Files:**
- Create: `frontend/src/components/pipeline/prompt-editor/VariablePicker.tsx`
- Modify: `frontend/src/components/pipeline/NodePromptEditor.tsx`

**Current state:** `NodePromptEditor` already has basic variable buttons that insert `{{variableName}}`. Extend this:

**VariablePicker popover:**
```
┌─ Insert Variable ──────────────────────────┐
│ 🔍 Search fields...                        │
│                                             │
│ ▸ Built-in Variables                        │
│   {{companyName}} {{sector}} {{website}}    │
│                                             │
│ ▸ Team Research (upstream)                  │
│   {{research_team.score}}                   │
│   {{research_team.founders[].name}}         │
│   {{research_team.feedback}}                │
│                                             │
│ ▸ Market Research (upstream)                │
│   {{research_market.tam}}                   │
│   {{research_market.competitors}}           │
└─────────────────────────────────────────────┘
```

**Steps:**
1. Fetch upstream fields from new endpoint
2. Merge with existing built-in variables from context schema
3. Searchable, grouped by source node
4. Click inserts `{{nodeId.fieldPath}}` at cursor position
5. Syntax highlight `{{...}}` tokens in textarea (CSS `mark` overlay or similar)

---

### Task 5.3: Backend dynamic variable resolution

**Files:**
- Modify: `backend/src/modules/ai/services/ai-prompt-runtime.service.ts`

**Current:** `resolveVariablesForKey()` resolves hardcoded variable names.

**Addition:** After existing resolution, scan for `{{nodeId.fieldPath}}` tokens and resolve from pipeline state:

```typescript
private resolveDynamicVariables(
  promptText: string,
  pipelineState: PipelineState | null,
): string {
  return promptText.replace(/\{\{(\w+)\.([^}]+)\}\}/g, (match, nodeId, fieldPath) => {
    if (!pipelineState) return `[${nodeId}.${fieldPath}: not available]`;
    const phaseResult = this.findPhaseResultForNode(nodeId, pipelineState);
    if (!phaseResult) return `[${nodeId}.${fieldPath}: phase not completed]`;
    const value = this.resolveFieldPath(phaseResult, fieldPath);
    return typeof value === "string" ? value : JSON.stringify(value);
  });
}
```

Call in both `previewPrompt()` and the actual runtime render paths.

---

## Phase 6: Agent CRUD on Canvas (Frontend)

### Why sixth
All infrastructure ready. This is the final UX feature.

### Task 6.1: "Add Agent" button on orchestrator nodes

**Files:**
- Modify: `frontend/src/components/pipeline/nodes/OrchestratorNode.tsx`
- Create: `frontend/src/components/pipeline/dialogs/AddAgentDialog.tsx`

**UX:** Orchestrator node shows `[+]` button. Click opens dialog:
- Label (required)
- Agent key (auto-slugified from label, editable)
- Description
- Execution phase (1 or 2, for research orchestrator only)

**On save:** `POST /admin/ai/agent-configs/:orchestratorId` → creates agent config + auto-creates `aiPromptDefinition` + empty schema draft. Invalidate flow query → new node appears on canvas.

---

### Task 6.2: Enable/disable toggle on agent nodes

**Files:**
- Modify: `frontend/src/components/pipeline/nodes/AiAgentNode.tsx`

**UX:** Toggle switch on AI agent nodes. Calls `PATCH .../toggle` endpoint. Disabled nodes render with `opacity-50` and dashed border. Canvas re-layouts to show disabled nodes as grayed.

---

### Task 6.3: Delete custom agent

**Files:**
- Modify: `frontend/src/components/pipeline/NodeConfigSheet.tsx`

**UX:** "Delete Agent" button in config sheet footer, only for `isCustom === true` agents. Confirmation dialog. Calls `DELETE` endpoint. Invalidate flow query → node removed.

---

## Phase 7: Pipeline Template Versioning

### Why last
This is insurance — pins config per pipeline run so schema changes don't affect in-flight runs.

### Task 7.1: Snapshot config on pipeline start

**Files:**
- Modify: `backend/src/modules/ai/services/pipeline.service.ts`

**Current:** `pipelineRun.config` exists as JSONB but stores minimal data.

**Change:** On `startPipeline()`, snapshot the full published config:
```typescript
const snapshot = {
  flowConfig: await this.flowConfigService.getEffectiveConfig(),
  agentConfigs: await this.agentConfigService.listAllEnabled(),
  schemaRevisions: await this.schemaRegistry.getAllPublished(),
  promptRevisions: await this.promptService.getAllPublished(),
  modelConfigs: await this.modelConfigService.getAllPublished(),
};
await this.pipelineState.updateConfig(startupId, snapshot);
```

**Runtime resolution:** Pipeline processors read from snapshot first, fall back to live DB if snapshot field is missing (backward compat with old runs).

---

## Execution Order & Dependencies

```
Phase 1 (Schema Registry)          ← Backend, no frontend deps
  1.1 DB entity
  1.2 Schema compiler + tests
  1.3 Registry CRUD service
  1.4 Seed existing schemas
  1.5 Admin endpoints + generate:api

Phase 2 (Dynamic Agents)           ← Depends on Phase 1
  2.1 DB entity
  2.2 DynamicAgentRunner
  2.3 Eval registry dynamic
  2.4 Research service dynamic
  2.5 Agent config endpoints + generate:api
  2.6 Dynamic flow catalog overlay

Phase 3 (Canvas UX Overhaul)       ← Depends on Phase 2.5 + 2.6
  3.1 Distinct node types (FixedData, AiAgent, Orchestrator)
  3.2 Undo/redo
  3.3 Edge styling + data flow labels
  3.4 Fix config loading bug
  3.5 Canvas toolbar

Phase 4 (Schema Editor)            ← Depends on Phase 1.5 + Phase 3
  4.1 Schema editor component
  4.2 Integrate into NodeConfigSheet

Phase 5 (Variable Picker)          ← Depends on Phase 4
  5.1 Backend upstream fields endpoint
  5.2 Variable picker component
  5.3 Backend dynamic variable resolution

Phase 6 (Agent CRUD on Canvas)     ← Depends on Phase 2.5 + Phase 3
  6.1 Add agent dialog
  6.2 Enable/disable toggle
  6.3 Delete custom agent

Phase 7 (Template Versioning)      ← Depends on Phase 2, independent of frontend
  7.1 Snapshot on pipeline start
```

**Parallelizable:**
- Phase 1 (backend) and Phase 3.2-3.5 (canvas UX fixes) can start in parallel — canvas fixes don't need schema registry
- Phase 4 and Phase 6 are independent of each other
- Phase 7 is independent of all frontend work

---

## Testing Strategy

**Backend:**
- `schema-compiler.spec.ts`: roundtrip, edge cases, invalid schemas, extractFieldPaths
- `agent-schema-registry.spec.ts`: resolution priority (stage-specific > global > code)
- `dynamic-agent-runner.spec.ts`: mock AI SDK, verify schema compilation + validation
- `evaluation-agent-registry.spec.ts`: enable/disable agents, custom agent execution
- Integration: full pipeline run with 1 disabled + 1 custom agent

**Frontend:**
- Schema editor: add/remove/reorder fields, nested objects, validation
- Variable picker: upstream field loading, search, insertion at cursor
- Node types: verify correct classification and rendering
- Undo/redo: push → undo → redo cycle

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Schema compiler doesn't handle all Zod features | Start with subset (object, string, number, boolean, array, enum). Code schemas still work as fallback. |
| Dynamic agents break existing pipeline | `resolveAgents()` falls back to hardcoded list if no DB config exists. Feature flag `AI_DYNAMIC_AGENTS_ENABLED`. |
| Canvas performance | ~25 nodes max. Not a concern. |
| Schema changes break running pipelines | Phase 7 snapshots config at start. Old runs use snapshot. |
| Custom agent bad output | Same retry/fallback as built-in agents. Schema validation catches it. |
| Undo/redo complexity | Only tracks `PhaseConfig[]` changes, not full graph state. Simple history stack. |
| Existing flow branch code conflicts | Build on top of `origin/flow`, never rewrite working components. |
