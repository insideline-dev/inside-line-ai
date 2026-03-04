# Prompt Library

This is the source of truth for AI prompt templates.

## Structure
- `global/<group>/<name>/system.md`
- `global/<group>/<name>/user.md`
- `stages/<startup_stage>/<group>/<name>/system.md` (optional override)
- `stages/<startup_stage>/<group>/<name>/user.md` (optional override)

## Naming
Prompt keys map to folders via dot notation + kebab-case:
- `research.team` -> `research/team`
- `evaluation.businessModel` -> `evaluation/business-model`

## Behavior
- Runtime first checks stage override files when stage is provided.
- Missing stage files fall back to global files.
- If global files are missing, code defaults are used as a safety fallback.
