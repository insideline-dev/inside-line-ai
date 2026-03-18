# Flow Output Schema Tree Design

**Goal:** Replace the placeholder output schema block in `/admin/flow` with a human-readable tree that shows each output field name, type, and all nested descendants.

## Context

The current node sheet UI renders an `Output Structure` card with only a `Source: code` badge and placeholder copy. The backend already contains schema descriptor infrastructure via `AgentSchemaRegistryService` and `SchemaCompilerService`, but the admin controller does not currently expose that descriptor for the node sheet UI.

## Decision

Use the backend schema registry as the source of truth and render the descriptor recursively in the frontend.

## Why

- Avoids duplicating schema definitions in the frontend.
- Keeps the UI aligned with code-registered prompt output schemas.
- Supports nested objects and arrays without manual per-prompt configuration.

## UI Shape

- Keep the existing `Output Structure` header and source badge.
- Replace placeholder text with a compact recursive tree.
- Each row shows:
  - field name
  - type badge
- Nested objects show their child fields indented underneath.
- Arrays show their item type and render nested item fields when the array item is an object.
- If no structured schema exists for a prompt key, show a clear empty state.

## Backend Changes

- Add `GET /admin/ai-prompts/:key/output-schema`.
- Delegate to `AgentSchemaRegistryService.resolveDescriptorWithSource(...)`.
- Return the existing DTO shape used by generated frontend models.

## Frontend Changes

- Fetch the schema for the selected prompt key.
- Render a recursive tree component inside `OutputSchemaViewer`.
- Keep the display read-only and compact.

## Testing

- Backend controller spec for the new endpoint response.
- Frontend render test for nested object and array schema rows.
