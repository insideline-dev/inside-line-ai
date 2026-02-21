# Dynamic AI Agent Pipeline Builder — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let admins visually configure the AI pipeline — edit agent output schemas, prompts, models, and add/remove agents within orchestrators — via an interactive node-based canvas (N8N-style).

**Architecture:** Extend the existing `ai-flow-catalog.ts` DAG + `aiPromptDefinition` revision tables with a new schema registry and dynamic agent config layer. Frontend gets a ReactFlow canvas replacing the current linear viz. Runtime resolves schemas/prompts/models from DB, falling back to code defaults. Level 2 customization: admins add/remove agents within orchestrators; top-level phase flow stays fixed.

**Tech Stack:** ReactFlow (frontend), Drizzle ORM (schema registry tables), AI SDK v6 `Output.object()` with runtime Zod, existing NestJS module system.

---

## Existing Infrastructure (DO NOT break)

These files/systems are production and must keep working throughout:

| System | Key Files | Contract |
|--------|-----------|----------|
| Pipeline execution | `services/pipeline.service.ts`, `orchestrator/` | BullMQ phase processors stay intact |
| Prompt runtime | `services/ai-prompt-runtime.service.ts`, `ai-prompt-catalog.ts` | Published revisions override code defaults |
| Model config | `services/ai-model-config.service.ts` | Stage-aware model resolution stays |
| Evaluation registry | `services/evaluation-agent-registry.service.ts` | `runAll()` / `runOne()` contracts stay |
| Research orchestrator | `services/research.service.ts` | Phase 1/Phase 2 fan-out stays |
| Flow catalog | `services/ai-flow-catalog.ts` | Read by frontend via `/admin/ai/prompts/flow` |
| Frontend agents page | `routes/_protected/admin/agents.tsx` | Will be replaced, but keep API contracts |
| DB tables | `ai_prompt_definitions`, `ai_prompt_revisions`, `ai_model_config_revisions`, `ai_context_config_revisions` | Additive changes only |

---

## Phase 1: Agent Output Schema Registry (Backend)

### Why first
Everything downstream (runtime validation, schema editor UI, variable picker) depends on schemas being stored in DB with versioning.

### Task 1.1: Create `aiAgentSchemaRevision` DB entity

**Files:**
- Create: `backend/src/modules/ai/entities/ai-agent-schema-revision.entity.ts`
- Modify: `backend/src/database/schema.ts` (add barrel export)

**Schema:**
```typescript
export const aiAgentSchemaRevision = pgTable("ai_agent_schema_revisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  definitionId: uuid("definition_id").references(() => aiPromptDefinition.id).notNull(),
  stage: startupStageEnum("stage"),                    // null = all stages
  status: revisionStatusEnum("status").default("draft").notNull(),
  schemaJson: jsonb("schema_json").notNull(),          // serialized Zod-compatible schema
  version: integer("version").default(1).notNull(),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => user.id),
  publishedBy: uuid("published_by").references(() => user.id),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});
```

**`schemaJson` format** (JSON-serializable Zod descriptor):
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
    "recommendation": {
      "type": "enum",
      "values": ["strong_pass", "pass", "consider", "decline"]
    }
  }
}
```

**Steps:**
1. Create entity file with the table definition above
2. Add to `backend/src/database/schema.ts` barrel export
3. Run `cd backend && bun db:generate && bun db:push`
4. Verify migration generated correctly

**Indexes:**
```typescript
// Add to entity file
export const aiAgentSchemaRevisionDefinitionIdx = index("ai_agent_schema_revision_definition_idx")
  .on(aiAgentSchemaRevision.definitionId);
export const aiAgentSchemaRevisionDefStageStatusIdx = index("ai_agent_schema_revision_def_stage_status_idx")
  .on(aiAgentSchemaRevision.definitionId, aiAgentSchemaRevision.stage, aiAgentSchemaRevision.status);
```

---

### Task 1.2: Schema JSON → Zod runtime compiler

**Files:**
- Create: `backend/src/modules/ai/services/schema-compiler.service.ts`
- Create: `backend/src/modules/ai/services/schema-compiler.spec.ts`

**Purpose:** Convert the JSON schema descriptor (from DB) into a runtime Zod schema that `Output.object()` can use.

**Interface:**
```typescript
@Injectable()
export class SchemaCompilerService {
  compile(schemaJson: SchemaDescriptor): z.ZodSchema;
  serialize(schema: z.ZodSchema): SchemaDescriptor;      // code schema → DB format
  validate(schemaJson: unknown): { valid: boolean; errors: string[] };
  extractFieldPaths(schemaJson: SchemaDescriptor): string[];  // for variable picker
}
```

**Type definitions:**
```typescript
type SchemaFieldType = "string" | "number" | "boolean" | "array" | "object" | "enum";

interface SchemaField {
  type: SchemaFieldType;
  description?: string;
  optional?: boolean;
  min?: number;
  max?: number;
  default?: unknown;
  // array
  items?: SchemaField;
  // object
  fields?: Record<string, SchemaField>;
  // enum
  values?: string[];
}

interface SchemaDescriptor {
  type: "object";
  fields: Record<string, SchemaField>;
}
```

**Steps:**
1. Define `SchemaDescriptor` types in `backend/src/modules/ai/interfaces/schema.interface.ts`
2. Write failing tests for: compile simple object, compile nested object, compile array, compile enum, compile with min/max, roundtrip serialize→compile
3. Implement `compile()` recursively: object→`z.object()`, string→`z.string()`, number→`z.number().min().max()`, array→`z.array()`, enum→`z.enum()`
4. Implement `serialize()` by introspecting existing Zod schemas (for seeding defaults)
5. Implement `extractFieldPaths()` — recursive dot-path extraction (e.g. `"founders[].name"`, `"score"`)
6. Run tests, verify pass

---

### Task 1.3: Schema registry CRUD service

**Files:**
- Create: `backend/src/modules/ai/services/agent-schema-registry.service.ts`
- Modify: `backend/src/modules/ai/ai.module.ts` (register provider)

**Interface:**
```typescript
@Injectable()
export class AgentSchemaRegistryService {
  listRevisionsByKey(key: AiPromptKey): Promise<{ definition: ...; revisions: ... }>;
  getPublished(key: AiPromptKey, stage?: StartupStage): Promise<SchemaDescriptor | null>;
  createDraft(key: AiPromptKey, adminId: string, input: CreateSchemaInput): Promise<Revision>;
  updateDraft(key: AiPromptKey, revisionId: string, input: UpdateSchemaInput): Promise<Revision>;
  publishRevision(key: AiPromptKey, revisionId: string, adminId: string): Promise<Revision>;
  resolveSchema(key: AiPromptKey, stage?: StartupStage): Promise<z.ZodSchema>;
}
```

**`resolveSchema` resolution order** (mirrors model config pattern):
1. Published DB revision matching key + stage → compile → return
2. Published DB revision matching key + stage=null → compile → return
3. Fall back to hardcoded Zod schema from agent code

**Steps:**
1. Create service with DrizzleService + SchemaCompilerService injection
2. Implement CRUD following `ai-model-config.service.ts` pattern (draft→published→archived lifecycle)
3. Implement `resolveSchema()` with fallback chain
4. Register in `ai.module.ts` providers
5. Write tests for resolution priority

---

### Task 1.4: Seed existing agent schemas into DB format

**Files:**
- Create: `backend/src/modules/ai/services/schema-seeder.service.ts`

**Purpose:** Convert all 17 hardcoded Zod schemas (5 research + 11 evaluation + 1 synthesis) to `SchemaDescriptor` JSON and provide a seed command.

**Steps:**
1. Use `SchemaCompilerService.serialize()` on each agent's Zod schema
2. Create a `seedSchemas()` method that upserts into `aiAgentSchemaRevision` with status="published"
3. Wire into the existing `seedAiPrompts` admin endpoint (or create parallel)
4. Test roundtrip: serialize existing → compile back → validate against same test data

---

## Phase 2: Dynamic Agent Configuration (Backend)

### Why second
Before the UI can add/remove agents, the backend needs a dynamic registry that the orchestrators read from.

### Task 2.1: Create `aiAgentConfig` DB entity

**Files:**
- Create: `backend/src/modules/ai/entities/ai-agent-config.entity.ts`
- Modify: `backend/src/database/schema.ts`

**Schema:**
```typescript
export const aiAgentConfig = pgTable("ai_agent_configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  flowId: varchar("flow_id", { length: 50 }).notNull(),          // "pipeline" | "clara"
  orchestratorNodeId: varchar("orchestrator_node_id", { length: 120 }).notNull(), // "research_orchestrator" | "evaluation_orchestrator"
  agentKey: varchar("agent_key", { length: 120 }).notNull(),
  label: text("label").notNull(),
  description: text("description"),
  kind: aiFlowNodeKindEnum("kind").default("prompt").notNull(),   // "prompt" | "system"
  enabled: boolean("enabled").default(true).notNull(),
  promptDefinitionId: uuid("prompt_definition_id").references(() => aiPromptDefinition.id),
  executionPhase: integer("execution_phase").default(1).notNull(), // for research: phase 1 or 2
  dependsOn: jsonb("depends_on").$type<string[]>().default([]),   // agent keys this depends on (within same orchestrator)
  sortOrder: integer("sort_order").default(0).notNull(),
  isCustom: boolean("is_custom").default(false).notNull(),        // true = admin-created, false = seeded from code
  createdBy: uuid("created_by").references(() => user.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => ({
  uniqueAgent: unique().on(table.flowId, table.orchestratorNodeId, table.agentKey),
  orchestratorIdx: index("ai_agent_config_orchestrator_idx").on(table.flowId, table.orchestratorNodeId),
}));
```

**Steps:**
1. Create entity, add to barrel
2. Generate + push migration
3. Create `AgentConfigService` with: `listByOrchestrator()`, `getEnabled()`, `create()`, `update()`, `toggleEnabled()`, `delete()` (custom only)
4. Seed existing agents from `ai-flow-catalog.ts` node definitions

---

### Task 2.2: Make `EvaluationAgentRegistryService` dynamic

**Files:**
- Modify: `backend/src/modules/ai/services/evaluation-agent-registry.service.ts`
- Modify: `backend/src/modules/ai/services/evaluation.service.ts`

**Current:** Hardcoded constructor injection of 11 agents, `this.agents` array is static.

**Target:** Read enabled agents from `AgentConfigService` at runtime. For built-in agents, resolve from NestJS DI. For custom agents, use a generic agent runner that reads prompt + schema + model from DB.

**Steps:**
1. Add `AgentConfigService` + `AgentSchemaRegistryService` to constructor
2. Create `resolveAgents()` method:
   - Query enabled agents for `evaluation_orchestrator`
   - For each: if `isCustom=false`, look up in DI-injected map by key
   - If `isCustom=true`, create a `DynamicEvaluationAgent` wrapper that reads prompt/schema/model from DB
3. Change `runAll()` to call `resolveAgents()` instead of using `this.agents`
4. **Keep backward compatibility**: if DB has no configs, fall back to the hardcoded list
5. Test: disable one agent → `runAll()` skips it. Enable custom agent → `runAll()` includes it.

---

### Task 2.3: Make `ResearchService` dynamic

**Files:**
- Modify: `backend/src/modules/ai/services/research.service.ts`

Same pattern as 2.2 but for research agents with Phase 1/Phase 2 grouping.

**Steps:**
1. Read enabled agents from `AgentConfigService` for `research_orchestrator`
2. Group by `executionPhase` (1 or 2)
3. Phase 1 agents run in parallel, Phase 2 agents run after with Phase 1 context
4. Keep fallback to hardcoded `PHASE_1_KEYS` / `PHASE_2_KEYS` if no DB config

---

### Task 2.4: Create `DynamicAgentRunner` service

**Files:**
- Create: `backend/src/modules/ai/services/dynamic-agent-runner.service.ts`

**Purpose:** Generic agent executor for admin-created custom agents. Reads prompt, model, and output schema from DB; calls `generateText()` with `Output.object()`.

**Interface:**
```typescript
@Injectable()
export class DynamicAgentRunnerService {
  async run(params: {
    agentKey: string;
    promptKey: AiPromptKey;
    pipelineData: EvaluationPipelineInput | ResearchPipelineInput;
    stage?: StartupStage;
  }): Promise<{ output: unknown; usedFallback: boolean; error?: string }>;
}
```

**Steps:**
1. Resolve prompt from `AiPromptRuntimeService`
2. Resolve model from `AiModelConfigService`
3. Resolve schema from `AgentSchemaRegistryService` → compile to Zod
4. Call `generateText({ output: Output.object({ schema }), ... })`
5. Handle errors with same retry/fallback pattern as `BaseEvaluationAgent`

---

### Task 2.5: Admin CRUD endpoints for agent config

**Files:**
- Modify: `backend/src/modules/admin/admin.controller.ts`
- Modify: `backend/src/modules/admin/admin.module.ts`
- Create: DTOs for agent config CRUD

**Endpoints:**
```
GET    /admin/ai/agents                           → list all agent configs grouped by orchestrator
GET    /admin/ai/agents/:orchestratorId            → list agents for orchestrator
POST   /admin/ai/agents/:orchestratorId            → create custom agent
PATCH  /admin/ai/agents/:orchestratorId/:agentKey  → update (label, description, enabled, sort)
DELETE /admin/ai/agents/:orchestratorId/:agentKey  → delete (custom only)
PATCH  /admin/ai/agents/:orchestratorId/:agentKey/toggle → enable/disable

GET    /admin/ai/schemas/:promptKey                → list schema revisions
POST   /admin/ai/schemas/:promptKey                → create schema draft
PATCH  /admin/ai/schemas/:promptKey/:revisionId    → update draft
POST   /admin/ai/schemas/:promptKey/:revisionId/publish → publish
```

**Steps:**
1. Create DTOs with `createZodDto`
2. Add endpoints to admin controller
3. Register services in admin module
4. Regenerate frontend API: `cd frontend && bun generate:api`

---

## Phase 3: ReactFlow Canvas (Frontend)

### Why third
Backend is ready. Now build the visual representation.

### Task 3.1: Install ReactFlow

**Steps:**
```bash
cd frontend && bun add @xyflow/react
```

---

### Task 3.2: Create canvas data transformer

**Files:**
- Create: `frontend/src/components/pipeline-canvas/use-pipeline-graph.ts`

**Purpose:** Transform `AiPromptFlowResponseDto` (existing API) + agent configs (new API) into ReactFlow nodes/edges.

**Node types mapping:**
```typescript
type PipelineNodeType =
  | "fixedDataNode"      // scraping, extraction, enrichment — view only
  | "aiAgentNode"        // research/evaluation/synthesis agents — editable
  | "orchestratorNode"   // research_orchestrator, evaluation_orchestrator — view only
  | "phaseGateNode";     // stage boundaries — view only

// Each node carries:
interface PipelineNodeData {
  nodeType: PipelineNodeType;
  flowNode: FlowNode;              // from ai-flow-catalog
  agentConfig?: AgentConfig;       // from new API (null for fixed nodes)
  isEditable: boolean;
  isEnabled: boolean;
  outputSchema?: SchemaDescriptor; // for variable picker
  inputs: string[];
  outputs: string[];
}
```

**Steps:**
1. Hook fetches flow data + agent configs
2. Maps each `FlowNode` to a ReactFlow `Node` with position auto-layout (dagre)
3. Maps each edge to a ReactFlow `Edge` with animated data flow label
4. Returns `{ nodes, edges, onNodesChange, onEdgesChange }`

---

### Task 3.3: Create custom node components

**Files:**
- Create: `frontend/src/components/pipeline-canvas/nodes/fixed-data-node.tsx`
- Create: `frontend/src/components/pipeline-canvas/nodes/ai-agent-node.tsx`
- Create: `frontend/src/components/pipeline-canvas/nodes/orchestrator-node.tsx`
- Create: `frontend/src/components/pipeline-canvas/nodes/phase-gate-node.tsx`

**Design:**
- Fixed data: Gray card, icon, read-only I/O badges
- AI agent: Blue card, editable badge, click → opens config sheet. Shows prompt key, model name, schema field count. Toggle switch for enable/disable.
- Orchestrator: Purple hub card, fan-out/fan-in indicator, child agent count badge
- Phase gate: Small diamond, dependency label

**Steps:**
1. Build each as a React component receiving `NodeProps<PipelineNodeData>`
2. Use shadcn Card/Badge primitives
3. AI agent node: click handler opens side sheet
4. All nodes: show Handle components for edges (top=target, bottom=source)

---

### Task 3.4: Create the pipeline canvas page

**Files:**
- Create: `frontend/src/components/pipeline-canvas/pipeline-canvas.tsx`
- Modify: `frontend/src/routes/_protected/admin/agents.tsx` (integrate canvas as a tab or replacement)

**Steps:**
1. `<ReactFlow>` wrapper with custom node types registered
2. Auto-layout using dagre (install: `bun add dagre @types/dagre`)
3. Stage grouping: nodes within same stage get a background group node
4. Minimap + controls panel
5. Add as new "Canvas" tab alongside existing "Prompts" tab in agents.tsx
6. Wire up node click → sheet/panel for editing

---

### Task 3.5: Agent config side panel

**Files:**
- Create: `frontend/src/components/pipeline-canvas/panels/agent-config-panel.tsx`

**Purpose:** When admin clicks an AI agent node, opens a Sheet with tabs:
- **Prompt** tab: system prompt + user prompt editors (existing revision UI, reuse)
- **Model** tab: model selector + search mode toggle (existing revision UI, reuse)
- **Schema** tab: visual schema editor (Phase 4)
- **Info** tab: inputs, outputs, description, enable/disable toggle

**Steps:**
1. Reuse existing prompt revision components from `agents.tsx`
2. Wire to existing API endpoints
3. Schema tab placeholder until Phase 4
4. Enable/disable toggle calls `PATCH /admin/ai/agents/:orch/:key/toggle`

---

## Phase 4: Visual Schema Editor (Frontend)

### Why fourth
The canvas is usable for prompt/model editing. Now add the full schema builder.

### Task 4.1: Schema editor component

**Files:**
- Create: `frontend/src/components/pipeline-canvas/schema-editor/schema-editor.tsx`
- Create: `frontend/src/components/pipeline-canvas/schema-editor/field-row.tsx`
- Create: `frontend/src/components/pipeline-canvas/schema-editor/types.ts`

**UI structure:**
```
┌─ Schema Editor ─────────────────────────────────┐
│ [+ Add Field]                                    │
│                                                  │
│ ┌─ score ──────────────────────────────────────┐ │
│ │ Type: [number ▾]  Min: [0]  Max: [100]       │ │
│ │ Description: [Overall team quality score]      │ │
│ │ Required: [x]                          [🗑]   │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ ┌─ founders ───────────────────────────────────┐ │
│ │ Type: [array ▾]  Items: [object ▾]           │ │
│ │ ┌─ name ────────────────────────────────┐    │ │
│ │ │ Type: [string ▾]  Required: [x]       │    │ │
│ │ └──────────────────────────────────────┘    │ │
│ │ ┌─ role ────────────────────────────────┐    │ │
│ │ │ Type: [string ▾]  Required: [x]       │    │ │
│ │ └──────────────────────────────────────┘    │ │
│ │ [+ Add Field to founders]                    │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ [Save Draft]  [Publish]                          │
└──────────────────────────────────────────────────┘
```

**Steps:**
1. `types.ts`: mirror `SchemaDescriptor` / `SchemaField` types from backend
2. `field-row.tsx`: recursive component — renders field config + nested children for object/array types
3. `schema-editor.tsx`: manages field list state, add/remove/reorder, save/publish buttons
4. Wire save to `POST /admin/ai/schemas/:key` (create draft) and publish endpoint
5. Load existing schema from `GET /admin/ai/schemas/:key` (published revision)

---

### Task 4.2: Schema preview & validation

**Files:**
- Modify: `frontend/src/components/pipeline-canvas/schema-editor/schema-editor.tsx`

**Features:**
- "Preview JSON" toggle showing the raw `SchemaDescriptor` JSON
- Client-side validation (field names unique, required fields have types, no empty objects)
- Show field count badge on the AI agent node

---

## Phase 5: Variable Picker & Dynamic Prompts (Frontend + Backend)

### Why fifth
Schemas are editable. Now let admins reference upstream output fields in prompts.

### Task 5.1: Backend endpoint for upstream output fields

**Files:**
- Modify: `backend/src/modules/admin/admin.controller.ts`

**Endpoint:**
```
GET /admin/ai/agents/:nodeId/upstream-fields → { nodeId, label, fields: string[] }[]
```

**Logic:**
1. Walk edges backward from `nodeId` in the flow catalog
2. For each upstream node, resolve its output schema (published or code default)
3. Use `SchemaCompilerService.extractFieldPaths()` to get dot-paths
4. Return list of `{ nodeId, label, fields }` per upstream node

---

### Task 5.2: Variable picker component

**Files:**
- Create: `frontend/src/components/pipeline-canvas/prompt-editor/variable-picker.tsx`

**UI:** Dropdown/popover triggered by `{{` typing or button click in prompt textarea. Shows upstream nodes as groups, fields as insertable tokens.

```
┌─ Insert Variable ──────────────────┐
│ 🔍 Search fields...                │
│                                    │
│ ▼ Team Research                    │
│   {{team_research.score}}          │
│   {{team_research.founders[].name}}│
│   {{team_research.feedback}}       │
│                                    │
│ ▼ Market Research                  │
│   {{market_research.tam}}          │
│   {{market_research.competitors}}  │
└────────────────────────────────────┘
```

**Steps:**
1. Fetch upstream fields from new endpoint
2. Filter by search query
3. On click/select, insert `{{nodeId.fieldPath}}` at cursor position in textarea
4. Highlight `{{...}}` tokens in the prompt editor (syntax highlighting)

---

### Task 5.3: Backend prompt variable resolution for dynamic fields

**Files:**
- Modify: `backend/src/modules/ai/services/ai-prompt-runtime.service.ts`

**Current:** Variables resolved from hardcoded `resolveVariablesForKey()` methods.

**Addition:** After resolving built-in variables, scan prompt text for `{{nodeId.fieldPath}}` patterns. For each match, look up the node's runtime output from `PipelineState.results` and resolve the field path.

**Steps:**
1. Add `resolveDynamicVariables(promptText, pipelineState)` method
2. Regex scan for `{{...}}` tokens
3. For each token: parse `nodeId.fieldPath`, look up in pipeline state results
4. Replace token with stringified value (or `"[not available]"` if phase hasn't run)
5. Call after existing variable resolution in `previewPrompt()` and runtime render paths

---

## Phase 6: Add/Remove Custom Agents (Frontend)

### Why last
All infrastructure is ready. This is the final user-facing feature.

### Task 6.1: "Add Agent" dialog on orchestrator nodes

**Files:**
- Create: `frontend/src/components/pipeline-canvas/dialogs/add-agent-dialog.tsx`

**UI:** Click "+" on orchestrator node → dialog:
- Agent key (slug, auto-generated from label)
- Label
- Description
- Execution phase (for research: 1 or 2)
- Dependencies (multi-select of sibling agents, for Phase 2 context)

**On save:** `POST /admin/ai/agents/:orchestratorId` → creates agent config + auto-creates `aiPromptDefinition` + empty schema draft.

---

### Task 6.2: New agent appears on canvas

**Steps:**
1. After successful create, invalidate flow + agent config queries
2. New node appears under orchestrator with "New" badge
3. Click to open config panel → admin sets prompt, model, schema
4. Publish all three revisions (prompt, model, schema) to activate

---

### Task 6.3: Delete custom agent

**Files:**
- Modify: `frontend/src/components/pipeline-canvas/panels/agent-config-panel.tsx`

**Steps:**
1. "Delete" button only visible for `isCustom=true` agents
2. Confirmation dialog
3. `DELETE /admin/ai/agents/:orch/:key` → removes config, node disappears from canvas

---

### Task 6.4: Update flow catalog to include dynamic agents

**Files:**
- Modify: `backend/src/modules/ai/services/ai-flow-catalog.ts` (or create overlay service)
- Modify: `backend/src/modules/admin/admin.controller.ts` (flow endpoint)

**Current:** `AI_FLOW_DEFINITIONS` is a static array.

**Target:** The `GET /admin/ai/prompts/flow` endpoint merges static definitions with dynamic agent configs from DB. Custom agents appear as additional nodes under their orchestrator, with edges auto-generated.

**Steps:**
1. Create `DynamicFlowCatalogService` that reads `AI_FLOW_DEFINITIONS` + overlays `aiAgentConfig` entries
2. For each enabled custom agent, add a node + edges (from orchestrator → agent, agent → downstream)
3. For disabled built-in agents, mark node as `enabled: false` (grayed out on canvas)
4. Return merged flow definition from API

---

## Phase 7: Pipeline Template Versioning

### Task 7.1: Create `pipelineTemplate` entity

**Files:**
- Create: `backend/src/modules/ai/entities/pipeline-template.entity.ts`
- Modify: `backend/src/database/schema.ts`

**Schema:**
```typescript
export const pipelineTemplate = pgTable("pipeline_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  flowId: varchar("flow_id", { length: 50 }).notNull(),
  version: integer("version").notNull(),
  status: revisionStatusEnum("status").default("draft").notNull(),
  snapshot: jsonb("snapshot").notNull(),  // full config snapshot: agents, schemas, prompts, models
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => user.id),
  publishedBy: uuid("published_by").references(() => user.id),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});
```

**Steps:**
1. Create entity, migrate
2. Modify `PipelineService.startPipeline()` to snapshot current published config into `pipelineRun.config`
3. At runtime, pipeline reads from snapshot — not live DB config
4. This ensures old runs are reproducible even after config changes

---

## Execution Order & Dependencies

```
Phase 1 (Schema Registry)
  ├── 1.1 DB entity ──────┐
  ├── 1.2 Schema compiler ─┤→ 1.3 Registry service → 1.4 Seeder
  └────────────────────────┘

Phase 2 (Dynamic Agents)      depends on: Phase 1
  ├── 2.1 DB entity
  ├── 2.4 Dynamic runner ──→ 2.2 Eval registry dynamic
  │                        → 2.3 Research service dynamic
  └── 2.5 Admin endpoints

Phase 3 (ReactFlow Canvas)    depends on: Phase 2.5
  ├── 3.1 Install ReactFlow
  ├── 3.2 Data transformer
  ├── 3.3 Node components ──→ 3.4 Canvas page
  └── 3.5 Agent config panel

Phase 4 (Schema Editor)       depends on: Phase 3.5
  ├── 4.1 Schema editor component
  └── 4.2 Preview & validation

Phase 5 (Variable Picker)     depends on: Phase 4
  ├── 5.1 Backend upstream fields endpoint
  ├── 5.2 Variable picker component
  └── 5.3 Dynamic variable resolution

Phase 6 (Agent CRUD)          depends on: Phase 3 + Phase 5
  ├── 6.1 Add agent dialog
  ├── 6.2 Canvas integration
  ├── 6.3 Delete custom agent
  └── 6.4 Dynamic flow catalog

Phase 7 (Template Versioning) depends on: Phase 2
  └── 7.1 Pipeline template entity + snapshot
```

**Parallelizable work:**
- Phase 1 tasks (1.1–1.4) are sequential
- Phase 2 tasks: 2.1 + 2.4 can parallel, then 2.2 + 2.3 can parallel
- Phase 3 tasks: 3.1–3.3 can parallel, 3.4 depends on all three
- Phase 4 and Phase 7 can run in parallel (different concerns)
- Phase 5 and Phase 6 depend on Phase 4 but are independent of each other

---

## Testing Strategy

**Backend:**
- Unit tests for `SchemaCompilerService` (roundtrip, edge cases, invalid schemas)
- Unit tests for `AgentSchemaRegistryService` (resolution priority)
- Integration tests for `DynamicAgentRunnerService` (mock AI SDK, verify schema validation)
- Integration tests for dynamic `EvaluationAgentRegistryService` (enable/disable agents)
- E2E: full pipeline run with one disabled agent + one custom agent

**Frontend:**
- Component tests for schema editor (add field, nested object, delete, validation)
- Component tests for variable picker (upstream resolution, search, insertion)
- Visual regression for node components
- Integration test: create custom agent → appears on canvas → configure → enable

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Schema compiler doesn't handle all Zod features | Start with subset (object, string, number, boolean, array, enum). Add union/optional later. Code schemas still work as fallback. |
| Dynamic agents break existing pipeline | `resolveAgents()` falls back to hardcoded list if no DB config exists. Feature flag `AI_DYNAMIC_AGENTS_ENABLED`. |
| ReactFlow performance with many nodes | ~25 nodes max in current pipeline. Not a concern. |
| Schema migration breaks running pipelines | Template versioning (Phase 7) pins config at pipeline start time. |
| Custom agent produces invalid output | Same retry/fallback pattern as built-in agents. Schema validation catches bad output. |
