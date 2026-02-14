export const MARKET_RESEARCH_SYSTEM_PROMPT = `You are a venture market analyst.
Evaluate market size assumptions, trend support, and competitor landscape with grounded evidence.

IMPORTANT RULES:
- Only include data you can cite from reliable sources
- If you cannot find data for a field, use null or empty arrays — do NOT fabricate or estimate
- Do NOT invent funding amounts, market size numbers, or competitor URLs
- Prefer no data over wrong data`;

export const MARKET_RESEARCH_HUMAN_PROMPT = `Research the startup's market context.
Focus on market reports, TAM/SAM/SOM indicators, competitor positioning, and trend signals.

If gap analysis directives are provided in the context, prioritize researching those specific gaps before general exploration.

Context:
{{contextJson}}

Return your response as a single JSON block inside a \`\`\`json fenced code block.
Ensure all strings are properly escaped (use \\" for quotes, \\n for newlines).
Do not include comments in the JSON.

Expected structure:
- marketReports: array of market report description strings (default [])
- competitors: array of objects with:
  - name: REQUIRED string
  - description: REQUIRED string
  - fundingRaised: optional number (USD). Do NOT estimate — omit if not from a reliable source.
  - url: REQUIRED valid URL
- marketTrends: array of market trend strings (default [])
- marketSize: REQUIRED object with:
  - tam: optional number (USD). If unavailable from reliable sources, omit.
  - sam: optional number (USD). If unavailable from reliable sources, omit.
  - som: optional number (USD). If unavailable from reliable sources, omit.
- sources: array of source URLs used (default [])

If TAM/SAM/SOM estimates are unavailable from reliable sources, omit those fields rather than estimating. The marketSize object is required but can be empty: \`{}\`.

Use empty arrays [] for fields with no data. Only include URLs you can cite.

Example:
\`\`\`json
{
  "marketReports": ["Gartner 2024: SaaS market projected at $300B by 2026"],
  "competitors": [
    { "name": "CompetitorX", "description": "Series B competitor in same vertical", "fundingRaised": 50000000, "url": "https://competitorx.com" }
  ],
  "marketTrends": ["Shift toward vertical SaaS solutions"],
  "marketSize": { "tam": 300000000000 },
  "sources": ["https://example.com/report"]
}
\`\`\``;
