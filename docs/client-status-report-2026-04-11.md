# Inside Line Status Report

| Area | Item | Status | Notes |
| --- | --- | --- | --- |
| Founder View & Submit | Remove startup scores from founder view | Done | Founder routes were updated, but this should be visually checked across all founder-facing startup views. |
| Founder View & Submit | Deck gaps / preview requested formatting / restricted sections | Done | The recommendations/gaps components were refactored, but the exact requested presentation should be checked against your expectations. I added "How to strengthen this..." |
| Founder View & Submit | Tagline and one-line description optional | Done | Form validation now allows these fields to be empty without blocking submission. |
| Founder View & Submit | `.xls` / `.xlsx` upload support | Done | Excel MIME types are included in the upload flow and file metadata is preserved. |
| Founder View & Submit | Uploaded files persist and remain downloadable | Done | Current startup/data room flow preserves uploaded file metadata and download paths. |
| Founder View & Submit | Multiple-document automatic classification | Done | Classification logic and data-room integration are implemented, but classification accuracy and category assignment should be spot-checked manually. |
| Founder View & Submit | Save as draft | Done | Draft-related backend and frontend flow implemented |
| Founder View & Submit | Draft files appear in data room | Done |  |
| Founder View & Submit | Additional uploads after draft save | Needs  retesting | Data room upload capability exists, but should be tested as a post-save user action. |
| Founder View & Submit | 10-section data room structure | Done | The expanded data room categorization is implemented in backend schema/service and surfaced in frontend data room views. |
| Investor View | Startup score visible on cards | Done | Investor pipeline cards now display score information directly. |
| Investor View | Thesis alignment score visible | Done | Thesis fit score is surfaced in investor cards/details when available. |
| Investor View | Pipeline cards clickable | Done | Investor pipeline cards link through to startup detail pages. |
| Investor View | Stage changes persist | Done |  |
| Investor View | Scores visible in pipeline sub-view | Done | Scores are rendered in the card layouts used in pipeline/list views. |
| Investor View | Thesis alignment summary in startup details | Done | Startup detail view includes thesis-fit summary information. |
| Investor View | Filter button position fixed when active | Done |  |
| Investor View | Investor direct startup submission | Done | There is an investor submission route using the investor-mode startup form. |
| Evaluation / Core Output | Agent timeout mitigation | Done | Evaluation fallback path now carries explicit timeout metadata while allowing the phase to continue safely. |
| Evaluation / Core Output | Data routed to correct agents | Done | Document classification and category-to-agent routing are implemented. |
| Evaluation / Core Output | KPI extraction + provenance / unit standardization | Needs  retesting | UI now surfaces clearer source/year/forecast-actual labels, but LLM might not always outputs them |
| Evaluation / Core Output | Clara incomplete-data handling | Needs retesting | Clara flow has been improved in code, but edge cases should be tested live. |
| Evaluation / Core Output | Clara-submitted startups appear in investor dashboard | Needs  retesting | Integration is present, but this should be confirmed end-to-end with a real Clara-originated submission. |

---