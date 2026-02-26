# Report UI + Docs + Summary Fixes Design (2026-02-22)

## Scope
Implement missing fixes (excluding scraping) for:
- Report UI overall data not populated across cards.
- Docs not appearing (preview + download) in Sources tab.
- Add owner-accessible evaluation endpoint without RLS enforcement.

## Decisions
- Add `GET /startups/:id/evaluation` endpoint accessible to roles ADMIN, INVESTOR, FOUNDER without ownership enforcement.
- Sources tab should show:
  - Pitch deck (`startup.pitchDeckUrl` or `startup.pitchDeckPath`).
  - AI sources categorized as `document`.
  - Data room documents from `GET /startups/:id/data-room`.
- Data room documents shown only in founder/admin views (same access as current data room endpoint).
- Summary cards use fallbacks when evaluation is partial or missing:
  - `overallScore`: `evaluation.overallScore` -> fallback `startup.overallScore`.
  - Section scores: use direct fields if present, else `evaluation.sectionScores`.
  - Strengths/risks: `evaluation.keyStrengths/keyRisks` -> fallback to `evaluation.strengths/concerns`.

## Data Flow
- Backend: expose evaluation for a startup by ID to roles ADMIN/INVESTOR/FOUNDER.
- Frontend:
  - Investor and founder startup detail pages call new evaluation endpoint when `startup.evaluation` is missing.
  - Admin pages already load evaluation and will benefit from fallback handling in the cards.
  - Sources tab fetches data room docs in founder/admin routes and merges into document sources.

## UI Behavior
- Summary cards display values even if evaluation shape changes.
- Sources tab shows:
  - Documents list (pitch deck + data room + document sources).
  - Website sources and AI agent rows unchanged.
- Memo tab PDF buttons remain available; no change to route prefix (still `/api/startups/:id/memo.pdf` / `report.pdf`).

## Error Handling
- If evaluation endpoint returns 404, UI remains as before (no crash); cards show startup fallback values.
- If data room docs fetch fails, Sources tab still renders pitch deck and AI sources.

## Testing
- No new automated tests planned.
- Manual verify:
  - Founder startup detail shows scores/strengths with evaluation fetched.
  - Investor startup detail shows scores/strengths with evaluation fetched.
  - Admin startup detail remains unchanged but shows fallbacks if evaluation lacks fields.
  - Sources tab (founder/admin) shows data room docs and document sources.
