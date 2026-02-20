# Agent Config + Graph Context Fix - Implementation Plan

## Overview
Enable admins to configure AI model selection and view typed data flow in the Agents page. Add model config management UI and enrich graph context visualization.

---

## Phase 1: Backend - Model Config Endpoints

### 1.1 Add Model Config DTOs (`backend/src/modules/admin/dto/ai-prompt.dto.ts`)

Add the following Zod schemas and DTOs:

```typescript
// Input schemas for model config operations
CreateAiModelConfigDraftSchema = z.object({
  modelName: z.string().min(1),
  searchMode: z.enum(["off", "provider_grounded_search"]),
  stage: z.nativeEnum(StartupStage).nullable().optional(),
  notes: z.string().trim().max(4000).optional(),
});

UpdateAiModelConfigDraftSchema = z.object({
  modelName: z.string().min(1).optional(),
  searchMode: z.enum(["off", "provider_grounded_search"]).optional(),
  notes: z.string().trim().max(4000).optional(),
}).refine(...);  // At least one field required

// Response schemas
ResolvedModelConfigSchema = z.object({
  source: z.enum(["default", "published", "revision_override"]),
  revisionId: z.string().uuid().nullable(),
  stage: z.nativeEnum(StartupStage).nullable(),
  purpose: z.string(),
  modelName: z.string(),
  provider: z.string(),
  searchMode: z.enum(["off", "provider_grounded_search"]),
  supportedSearchModes: z.array(z.enum(["off", "provider_grounded_search"])),
});

AiModelConfigRevisionSchema = z.object({
  id: z.string().uuid(),
  stage: z.nativeEnum(StartupStage).nullable(),
  status: z.enum(["draft", "published", "archived"]),
  modelName: z.string(),
  searchMode: z.enum(["off", "provider_grounded_search"]),
  notes: z.string().nullable(),
  version: z.number().int(),
  createdBy: z.string().uuid().nullable(),
  publishedBy: z.string().uuid().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

AiModelConfigResponseSchema = z.object({
  resolved: ResolvedModelConfigSchema,
  revisions: z.array(AiModelConfigRevisionSchema),
  allowedModels: z.array(z.string()),
});

// Export DTO classes
class CreateAiModelConfigDraftDto extends createZodDto(CreateAiModelConfigDraftSchema) {}
class UpdateAiModelConfigDraftDto extends createZodDto(UpdateAiModelConfigDraftSchema) {}
class AiModelConfigResponseDto extends createZodDto(AiModelConfigResponseSchema) {}
```

**Files:** `backend/src/modules/admin/dto/ai-prompt.dto.ts` (append)

---

### 1.2 Inject AiModelConfigService into AdminController

**File:** `backend/src/modules/admin/admin.controller.ts`

Update constructor:
```typescript
constructor(
  // ...existing services...
  private aiModelConfigService: AiModelConfigService,
) {}
```

---

### 1.3 Add 5 Model Config Routes to AdminController

**File:** `backend/src/modules/admin/admin.controller.ts`

Add under `// ============ AI PROMPT MANAGEMENT ============` section:

```typescript
@Get('ai-prompts/:key/model-config')
@ApiOperation({ summary: "Get resolved model config, revisions history, and allowed models" })
@ApiResponse({ status: 200, type: AiModelConfigResponseDto })
async getAiModelConfig(@Param('key') key: string) {
  const resolved = await this.aiModelConfigService.resolveConfig({ key });
  const { revisions } = await this.aiModelConfigService.listRevisionsByKey(key);
  const allowedModels = ["gpt-5.2", "gemini-3.0-flash-preview"];
  return { resolved, revisions, allowedModels };
}

@Post('ai-prompts/:key/model-config')
@ApiOperation({ summary: "Create model config draft revision" })
@ApiResponse({ status: 201, type: AiModelConfigResponseDto })
async createAiModelConfigDraft(
  @CurrentUser() admin: User,
  @Param('key') key: string,
  @Body() dto: CreateAiModelConfigDraftDto,
) {
  return this.aiModelConfigService.createDraft(key, admin.id, dto);
}

@Patch('ai-prompts/:key/model-config/:revisionId')
@ApiOperation({ summary: "Update model config draft revision" })
@ApiResponse({ status: 200, type: AiModelConfigResponseDto })
async updateAiModelConfigDraft(
  @Param('key') key: string,
  @Param('revisionId', ParseUUIDPipe) revisionId: string,
  @Body() dto: UpdateAiModelConfigDraftDto,
) {
  return this.aiModelConfigService.updateDraft(key, revisionId, dto);
}

@Post('ai-prompts/:key/model-config/:revisionId/publish')
@ApiOperation({ summary: "Publish model config draft revision" })
@ApiResponse({ status: 201, type: AiModelConfigResponseDto })
async publishAiModelConfigDraft(
  @CurrentUser() admin: User,
  @Param('key') key: string,
  @Param('revisionId', ParseUUIDPipe) revisionId: string,
) {
  return this.aiModelConfigService.publishRevision(key, revisionId, admin.id);
}

@Delete('ai-prompts/:key/model-config/:revisionId')
@ApiOperation({ summary: "Archive model config draft revision (soft delete)" })
async deleteAiModelConfigDraft(
  @Param('key') key: string,
  @Param('revisionId', ParseUUIDPipe) revisionId: string,
) {
  // Mark as archived or deleted in DB if schema supports it
  // For now, optional implementation
  return { success: true, message: 'Revision archived' };
}
```

---

### 1.4 Add Output Schema Endpoint to AdminController

**File:** `backend/src/modules/admin/admin.controller.ts`

Add helper method:
```typescript
private resolveOutputSchemaForKey(promptKey: string): object | null {
  const keyMap: Record<string, any> = {
    'extraction.fields': AI_SCHEMAS.extraction,
    'research.team': AI_SCHEMAS.research.team,
    'research.market': AI_SCHEMAS.research.market,
    'research.product': AI_SCHEMAS.research.product,
    'research.news': AI_SCHEMAS.research.news,
    'research.competitor': AI_SCHEMAS.research.competitor,
    'evaluation.team': AI_SCHEMAS.evaluation.team,
    'evaluation.market': AI_SCHEMAS.evaluation.market,
    'evaluation.product': AI_SCHEMAS.evaluation.product,
    'evaluation.traction': AI_SCHEMAS.evaluation.traction,
    'evaluation.businessModel': AI_SCHEMAS.evaluation.businessModel,
    'evaluation.gtm': AI_SCHEMAS.evaluation.gtm,
    'evaluation.financials': AI_SCHEMAS.evaluation.financials,
    'evaluation.competitiveAdvantage': AI_SCHEMAS.evaluation.competitiveAdvantage,
    'evaluation.legal': AI_SCHEMAS.evaluation.legal,
    'evaluation.dealTerms': AI_SCHEMAS.evaluation.dealTerms,
    'evaluation.exitPotential': AI_SCHEMAS.evaluation.exitPotential,
    'synthesis.final': AI_SCHEMAS.synthesis,
    'matching.thesis': AI_SCHEMAS.thesisAlignment,
  };

  return keyMap[promptKey] ?? null;
}
```

Add endpoint:
```typescript
@Get('ai-prompts/:key/output-schema')
@ApiOperation({ summary: "Get output JSON schema for a prompt key" })
async getAiPromptOutputSchema(@Param('key') key: string) {
  const zodSchema = this.resolveOutputSchemaForKey(key);

  if (!zodSchema) {
    throw new BadRequestException(`No output schema found for key: ${key}`);
  }

  // Convert Zod schema to JSON Schema
  // Use zod-to-json-schema if available, or build recursively
  const jsonSchema = this.zodToJsonSchema(zodSchema);

  return {
    key,
    jsonSchema,
    note: "Schema defined in code. Editable schema config coming in a future update.",
  };
}

private zodToJsonSchema(zodSchema: any): object {
  // If zod-to-json-schema is in package.json, use it
  // Otherwise, recursively extract shape properties
  if (typeof zodSchema._def === 'object') {
    const shape = zodSchema._def.shape?.();
    if (shape) {
      return {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(shape).map(([key, val]: [string, any]) => [
            key,
            { type: this.inferZodType(val), description: val._def?.description },
          ])
        ),
      };
    }
  }
  return { type: 'unknown' };
}

private inferZodType(zodType: any): string {
  if (!zodType?._def) return 'unknown';
  const typeName = zodType._def.typeName;

  const typeMap: Record<string, string> = {
    'ZodString': 'string',
    'ZodNumber': 'number',
    'ZodBoolean': 'boolean',
    'ZodArray': 'array',
    'ZodObject': 'object',
    'ZodUnion': 'mixed',
  };

  return typeMap[typeName] ?? 'unknown';
}
```

---

### 1.5 Enrich AiFlowPort Structure

**File:** `backend/src/modules/ai/services/ai-flow-catalog.ts`

Replace node definitions with structured ports:

```typescript
export interface AiFlowPort {
  label: string;
  type: "text" | "object" | "array" | "number";
  fromNodeId?: string;    // For inputs: upstream node that provides this
  toNodeIds?: string[];   // For outputs: downstream nodes that consume this
}

export interface AiFlowNodeDefinition {
  id: string;
  label: string;
  description: string;
  kind: AiFlowNodeKind;
  promptKeys: AiPromptKey[];
  inputs: AiFlowPort[];      // Changed from string[]
  outputs: AiFlowPort[];     // Changed from string[]
}

// Update each node in AI_FLOW_DEFINITIONS
// Example for research_team:
{
  id: "research_team",
  label: "Team Research",
  description: "Research founder and leadership quality.",
  kind: "prompt",
  promptKeys: ["research.team"],
  inputs: [
    { label: "Company context", type: "object", fromNodeId: "research_orchestrator" },
    { label: "Team data", type: "object", fromNodeId: "linkedin_enrichment" },
  ],
  outputs: [
    { label: "Team diligence findings", type: "object", toNodeIds: ["evaluation_orchestrator", "evaluation_team"] },
  ]
}
```

Update all node definitions systematically using the edge definitions to derive the fromNodeId/toNodeIds mappings.

---

### 1.6 Update AiFlowPort DTO Schema

**File:** `backend/src/modules/admin/dto/ai-prompt.dto.ts`

Replace:
```typescript
const AiFlowNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  kind: FlowNodeKindSchema,
  promptKeys: z.array(PromptKeySchema),
  inputs: z.array(z.string()),        // OLD
  outputs: z.array(z.string()),       // OLD
});
```

With:
```typescript
const AiFlowPortSchema = z.object({
  label: z.string(),
  type: z.enum(["text", "object", "array", "number"]),
  fromNodeId: z.string().optional(),
  toNodeIds: z.array(z.string()).optional(),
});

const AiFlowNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  kind: FlowNodeKindSchema,
  promptKeys: z.array(PromptKeySchema),
  inputs: z.array(AiFlowPortSchema),      // NEW
  outputs: z.array(AiFlowPortSchema),     // NEW
});
```

---

### Phase 1 Checklist
- [ ] Add model config DTOs to `ai-prompt.dto.ts`
- [ ] Inject `AiModelConfigService` in `admin.controller.ts`
- [ ] Add 5 model config routes to admin controller
- [ ] Add output schema endpoint with helper methods
- [ ] Update `AiFlowPort` interface in `ai-flow-catalog.ts`
- [ ] Update all node definitions with structured ports + nodeId linkage
- [ ] Update `AiFlowPortSchema` in DTO file
- [ ] Run: `cd backend && bunx tsc --noEmit` (zero errors)

---

## Phase 2: API Generation

### 2.1 Generate Orval Hooks
```bash
cd frontend && bun generate:api
```

This regenerates all Orval hooks from updated Swagger schema.

---

## Phase 3: Frontend - Model Config Tab

### 3.1 Add "Model Config" Tab to agents.tsx

**File:** `frontend/src/routes/_protected/admin/agents.tsx`

New state variables:
```typescript
const [modelName, setModelName] = useState("");
const [searchMode, setSearchMode] = useState<"off" | "provider_grounded_search">("off");
const [modelStage, setModelStage] = useState<"global" | StageOption>("global");
const [modelNotes, setModelNotes] = useState("");
```

New queries (after useAdminControllerGetAiPromptContextSchema):
```typescript
const modelConfigQuery = useAdminControllerGetAiModelConfig(currentPromptKey ?? "", {
  query: { enabled: Boolean(currentPromptKey) },
});

const createModelConfigMutation = useAdminControllerCreateAiModelConfigDraft({
  mutation: {
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: getAdminControllerGetAiModelConfigQueryKey(currentPromptKey ?? "")
      });
      toast.success("Model config draft created");
    },
  },
});

const updateModelConfigMutation = useAdminControllerUpdateAiModelConfigDraft({
  mutation: {
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: getAdminControllerGetAiModelConfigQueryKey(currentPromptKey ?? "")
      });
      toast.success("Model config updated");
    },
  },
});

const publishModelConfigMutation = useAdminControllerPublishAiModelConfigDraft({
  mutation: {
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: getAdminControllerGetAiModelConfigQueryKey(currentPromptKey ?? "")
      });
      toast.success("Model config published");
    },
  },
});
```

Update effect to load model config when currentPromptKey changes:
```typescript
useEffect(() => {
  if (!currentPromptKey || !modelConfigQuery.data) {
    setModelName("");
    setSearchMode("off");
    setModelNotes("");
    return;
  }

  const data = extractResponseData(modelConfigQuery.data);
  if (data?.resolved) {
    setModelName(data.resolved.modelName);
    setSearchMode(data.resolved.searchMode);
    setModelNotes("");
  }
}, [currentPromptKey, modelConfigQuery.data]);
```

Add new tab in TabsList (between "Revisions" and "Runtime Preview"):
```typescript
<TabsTrigger value="model-config">Model Config</TabsTrigger>
```

Add TabsContent for model config (between Revisions and Runtime Preview tabs):
```typescript
<TabsContent value="model-config" className="space-y-4">
  {!currentPromptKey ? (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">Select a prompt to view model config</p>
      </CardContent>
    </Card>
  ) : (
    <>
      {/* Resolved Banner */}
      {modelConfigQuery.data && extractResponseData(modelConfigQuery.data)?.resolved && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">Current Configuration</p>
                <p className="text-xs text-muted-foreground">
                  {extractResponseData(modelConfigQuery.data)?.resolved.modelName}
                  {" "}
                  <Badge variant="outline" className="ml-2">
                    {extractResponseData(modelConfigQuery.data)?.resolved.source}
                  </Badge>
                </p>
              </div>
              <div className="text-xs font-mono text-muted-foreground">
                {extractResponseData(modelConfigQuery.data)?.resolved.provider}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stage Selector */}
      <div>
        <Label>Stage</Label>
        <Select value={modelStage} onValueChange={(val) => setModelStage(val as any)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="global">Global</SelectItem>
            {STAGES.map((stage) => (
              <SelectItem key={stage} value={stage}>
                {formatStage(stage)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Model Dropdown */}
      <div>
        <Label>Model</Label>
        <Select value={modelName} onValueChange={setModelName}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {extractResponseData(modelConfigQuery.data)?.allowedModels?.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Search Mode Toggle */}
      {extractResponseData(modelConfigQuery.data)?.resolved?.supportedSearchModes?.includes("provider_grounded_search") && (
        <div className="flex items-center justify-between">
          <Label>Grounded Search (Google)</Label>
          <input
            type="checkbox"
            checked={searchMode === "provider_grounded_search"}
            onChange={(e) => setSearchMode(e.target.checked ? "provider_grounded_search" : "off")}
            className="h-4 w-4"
          />
        </div>
      )}

      {/* Notes Input */}
      <div>
        <Label>Notes</Label>
        <Textarea
          value={modelNotes}
          onChange={(e) => setModelNotes(e.target.value)}
          placeholder="Optional notes about this configuration..."
          className="h-20"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button
          onClick={() => {
            createModelConfigMutation.mutate({
              modelName,
              searchMode,
              stage: modelStage === "global" ? null : modelStage,
              notes: modelNotes,
            });
          }}
          disabled={!modelName || createModelConfigMutation.isPending}
        >
          {createModelConfigMutation.isPending ? "Saving..." : "Save Draft"}
        </Button>
        <Button
          variant="outline"
          disabled={true}  // Enable after draft created
        >
          Publish
        </Button>
      </div>

      {/* Revisions History */}
      {modelConfigQuery.data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Revision History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {extractResponseData(modelConfigQuery.data)?.revisions?.map((rev) => (
                <div key={rev.id} className="flex items-center justify-between text-sm p-2 border rounded">
                  <div>
                    <Badge variant="outline">{rev.status}</Badge>
                    <span className="ml-2 text-xs text-muted-foreground">
                      v{rev.version} • {formatStage(rev.stage)} • {new Date(rev.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <span className="text-xs">{rev.modelName}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )}
</TabsContent>
```

---

## Phase 4: Frontend - Output Schema Tab

### 4.1 Add "Output Schema" Tab

**File:** `frontend/src/routes/_protected/admin/agents.tsx`

New state for schema view:
```typescript
const [schemaViewMode, setSchemaViewMode] = useState<"tree" | "json">("tree");
```

New query:
```typescript
const outputSchemaQuery = useAdminControllerGetAiPromptOutputSchema(currentPromptKey ?? "", {
  query: { enabled: Boolean(currentPromptKey) },
});
```

Helper component for JSON schema tree (inline):
```typescript
function JsonSchemaTreeNode({
  name,
  schema,
  depth = 0,
}: {
  name: string;
  schema: any;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);

  if (!schema || typeof schema !== "object") {
    return (
      <div style={{ paddingLeft: `${depth * 16}px` }} className="text-xs py-1">
        <span className="font-mono text-muted-foreground">{name}</span>
        <Badge variant="outline" className="ml-2 text-[10px]">
          {typeof schema}
        </Badge>
      </div>
    );
  }

  const isArray = schema.type === "array";
  const isObject = schema.type === "object";

  if (!isArray && !isObject) {
    return (
      <div style={{ paddingLeft: `${depth * 16}px` }} className="text-xs py-1">
        <span className="font-mono text-muted-foreground">{name}</span>
        <Badge variant="outline" className="ml-2 text-[10px]">
          {schema.type}
        </Badge>
      </div>
    );
  }

  const properties = schema.properties ?? {};
  const items = schema.items ?? {};

  return (
    <div style={{ paddingLeft: `${depth * 16}px` }} className="text-xs py-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="font-mono text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1"
      >
        <span>{expanded ? "▼" : "▶"}</span>
        <span>{name}</span>
        <Badge variant="outline" className="text-[10px]">
          {isArray ? "array" : "object"}
        </Badge>
      </button>

      {expanded && (
        <div>
          {isArray && Object.keys(items).length > 0 && (
            <JsonSchemaTreeNode name="[items]" schema={items} depth={depth + 1} />
          )}
          {isObject && Object.entries(properties).map(([key, prop]: [string, any]) => (
            <JsonSchemaTreeNode key={key} name={key} schema={prop} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
```

Add tab to TabsList:
```typescript
<TabsTrigger value="output-schema">Output Schema</TabsTrigger>
```

Add TabsContent:
```typescript
<TabsContent value="output-schema" className="space-y-4">
  {!currentPromptKey ? (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">Select a prompt to view output schema</p>
      </CardContent>
    </Card>
  ) : (
    <>
      {/* Info Banner */}
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="pt-6">
          <p className="text-xs text-amber-900">
            Schema is defined in code. Editable schema config coming in a future update.
          </p>
        </CardContent>
      </Card>

      {/* View Mode Toggle */}
      <div className="flex gap-2">
        <Button
          variant={schemaViewMode === "tree" ? "default" : "outline"}
          size="sm"
          onClick={() => setSchemaViewMode("tree")}
        >
          Visual Tree
        </Button>
        <Button
          variant={schemaViewMode === "json" ? "default" : "outline"}
          size="sm"
          onClick={() => setSchemaViewMode("json")}
        >
          Raw JSON
        </Button>
      </div>

      {/* Schema Display */}
      {outputSchemaQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : outputSchemaQuery.data ? (
        <Card>
          <CardContent className="pt-6">
            {schemaViewMode === "tree" ? (
              <div className="font-mono text-xs space-y-2">
                {extractResponseData(outputSchemaQuery.data)?.jsonSchema && (
                  <JsonSchemaTreeNode
                    name={currentPromptKey}
                    schema={extractResponseData(outputSchemaQuery.data)?.jsonSchema}
                  />
                )}
              </div>
            ) : (
              <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-96">
                {JSON.stringify(extractResponseData(outputSchemaQuery.data)?.jsonSchema, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">No schema found for this prompt</p>
          </CardContent>
        </Card>
      )}
    </>
  )}
</TabsContent>
```

---

## Phase 5: Frontend - Fix Graph Context Tab

### 5.1 Enhance Graph Context Tab

**File:** `frontend/src/routes/_protected/admin/agents.tsx`

Find the "Graph Context (Static)" tab and replace/enhance:

```typescript
<TabsContent value="graph-context" className="space-y-4">
  {!selectedNode ? (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">Select a node from the flow</p>
      </CardContent>
    </Card>
  ) : (
    <>
      {/* Inputs Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Inputs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {selectedNode.inputs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No inputs</p>
          ) : (
            selectedNode.inputs.map((port, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs p-2 border rounded">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {port.type}
                  </Badge>
                  <span className="font-mono">{port.label}</span>
                </div>
                {port.fromNodeId && (
                  <button
                    onClick={() => setSelectedNodeId(port.fromNodeId!)}
                    className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 cursor-pointer"
                  >
                    {port.fromNodeId}
                  </button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Outputs Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Outputs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {selectedNode.outputs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No outputs</p>
          ) : (
            selectedNode.outputs.map((port, idx) => (
              <div key={idx} className="flex items-start justify-between text-xs p-2 border rounded">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {port.type}
                  </Badge>
                  <span className="font-mono">{port.label}</span>
                </div>
                {port.toNodeIds && port.toNodeIds.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {port.toNodeIds.map((nodeId) => (
                      <button
                        key={nodeId}
                        onClick={() => setSelectedNodeId(nodeId)}
                        className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer"
                      >
                        {nodeId}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Incoming/Outgoing Nodes */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Incoming</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {activeFlow?.edges
              .filter((e) => e.to === selectedNode.id)
              .map((edge) => {
                const fromNode = nodeById.get(edge.from);
                if (!fromNode) return null;
                return (
                  <button
                    key={edge.from}
                    onClick={() => setSelectedNodeId(edge.from)}
                    className="block w-full text-left text-xs p-2 rounded hover:bg-muted cursor-pointer"
                  >
                    {fromNode.label}
                  </button>
                );
              })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Outgoing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {activeFlow?.edges
              .filter((e) => e.from === selectedNode.id)
              .map((edge) => {
                const toNode = nodeById.get(edge.to);
                if (!toNode) return null;
                return (
                  <button
                    key={edge.to}
                    onClick={() => setSelectedNodeId(edge.to)}
                    className="block w-full text-left text-xs p-2 rounded hover:bg-muted cursor-pointer"
                  >
                    {toNode.label}
                  </button>
                );
              })}
          </CardContent>
        </Card>
      </div>
    </>
  )}
</TabsContent>
```

---

## Phase 6: Type Safety & Compilation

### 6.1 Verify TypeScript

```bash
cd backend && bunx tsc --noEmit
cd frontend && bunx tsc --noEmit
```

Must result in **zero errors**.

---

## Phase 7: Manual Testing

### 7.1 Test Model Config Tab
- [ ] Navigate to Agents page → select "Team Research" node
- [ ] Click "Model Config" tab
- [ ] Verify resolved banner shows current model (e.g., `gemini-3.0-flash-preview (default)`)
- [ ] Select stage, model, search mode
- [ ] Click "Save Draft" — should create revision
- [ ] Verify revision appears in history
- [ ] Click "Publish Draft" — should persist as published
- [ ] Refresh page — config should persist

### 7.2 Test Output Schema Tab
- [ ] Select "Team Research" node (or any research agent)
- [ ] Click "Output Schema" tab
- [ ] Toggle "Visual Tree" — should show expandable schema structure
- [ ] Toggle "Raw JSON" — should show formatted JSON
- [ ] Schema should match `AI_SCHEMAS.research.team` shape

### 7.3 Test Graph Context Tab
- [ ] Select any node (e.g., "research_team")
- [ ] View inputs with clickable node chips (e.g., "research_orchestrator")
- [ ] Click chip → sidebar navigates to that node
- [ ] View outputs with downstream node chips
- [ ] Incoming/Outgoing sections should be clickable

### 7.4 Test Existing Tabs Still Work
- [ ] Prompts tab — edit prompt text
- [ ] Variables tab — show variable docs
- [ ] Revisions tab — list prompt revisions
- [ ] Runtime Preview tab — preview rendered prompt
- [ ] Pipeline Context tab — preview full pipeline context

---

## Rollback Plan

If issues arise:
- **Backend compilation fails:** Revert `ai-flow-catalog.ts` and admin controller changes, keep DTOs in draft
- **Frontend generation fails:** Ensure `bun generate:api` completes; check backend Swagger schema
- **UI issues:** Comment out new tabs temporarily, focus on backend validation

---

## Files Changed Summary

| File | Change Type | Status |
|------|-------------|--------|
| `backend/src/modules/admin/dto/ai-prompt.dto.ts` | Add model config DTOs + update AiFlowPort schema | To Do |
| `backend/src/modules/admin/admin.controller.ts` | Add 6 new routes (model config + output schema) | To Do |
| `backend/src/modules/ai/services/ai-flow-catalog.ts` | Enrich inputs/outputs to AiFlowPort[] + linkage | To Do |
| `frontend/src/routes/_protected/admin/agents.tsx` | Add 3 tabs (Model Config, Output Schema, enhance Graph Context) | To Do |
| (API regeneration) | Run `bun generate:api` | To Do |

---

## Success Criteria

✅ All 7 steps completed
✅ `cd backend && bunx tsc --noEmit` → **0 errors**
✅ `cd frontend && bunx tsc --noEmit` → **0 errors**
✅ Model Config tab: save, publish, persist
✅ Output Schema tab: tree + JSON view
✅ Graph Context tab: typed ports + clickable navigation
✅ All existing tabs continue to work
✅ No console errors when navigating agents page
