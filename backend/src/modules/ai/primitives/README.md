# AI Primitives

Reusable pre-research building blocks shared by Screening and Due Diligence pipelines.

## Policy

A **primitive** is anything in the AI pipeline that:

1. Runs BEFORE research / evaluation / synthesis.
2. Is reusable across stages (Screening calls it at light depth; DD calls it at deep depth).
3. Has stable, idempotent inputs and a deterministic output shape (so smart re-run can hash inputs and decide what to re-fire — see plan §7).

## The five primitives

| Primitive | Service today | Notes |
|-----------|---------------|-------|
| **Extraction** | `services/extraction.service.ts` | Deck → structured fields. Same for both stages. |
| **Enrichment** | `services/enrichment.service.ts` | Public data + (DD-only) Unipile. Take `depth` opt. |
| **Scraping** | `services/scraping.service.ts` | Web / LinkedIn / news. Take `depth` opt: 1 pass vs multi-pass. |
| **Gap-fill** | `services/gap-analysis.service.ts` | Missing-materials checklist. Required-fields schema differs per stage. |
| **Classification** | `services/document-classification.service.ts` + (NEW) startup classifier | Document categorization exists. Startup-level classification (sector / stage / geography / check-size) is added during PR5 (thesis-fit dependency). |

## What is NOT a primitive

- The **research agents** (5) — DD only.
- The **evaluation agents** (11) — DD only.
- The **synthesis** memo generator — DD only.
- The **lenses** (3: market / team / traction) — used by Screening only; live under `agents/lenses/` (added in PR3).
- The **thesis-fit agent** — runs after primitives + lenses, per stage. Lives at `agents/thesis-fit.agent.ts` (added in PR5).

## Why this folder exists when the services already do

This folder is the **abstraction seam** the screening pipeline (PR4) and smart re-run system (PR8) will compose against. Today the seam is documentation + index re-exports — we deliberately do NOT churn existing service files. As primitives gain stage-aware shape (gap-fill required schemas, depth-aware enrichment), the wrappers will land here.

See `plans/some-notes-from-jaunty-pine.md` §3 for the architectural context.
