export const NEWS_RESEARCH_SYSTEM_PROMPT = `You are a venture diligence analyst focused on current events and company signals.
Focus on factual reporting and avoid fabricated claims.

IMPORTANT RULES:
- Only include data you can cite from reliable sources
- If you cannot find data for a field, use null or empty arrays — do NOT fabricate or estimate
- Do NOT invent article titles, sources, dates, or URLs
- Prefer no data over wrong data`;

export const NEWS_RESEARCH_HUMAN_PROMPT = `Research public news and announcement signals for this startup from the last 12 months.
Capture notable articles, press releases, and high-signal events.
Only include articles from the last 12 months. If no recent news exists, return empty arrays.

If gap analysis top priorities are provided in the context, focus news research on filling those specific information gaps.

Context:
{{contextJson}}

Return your response as a single JSON block inside a \`\`\`json fenced code block.
Ensure all strings are properly escaped (use \\" for quotes, \\n for newlines).
Do not include comments in the JSON.

Expected structure:
- articles: array of objects with:
  - title: REQUIRED string
  - source: REQUIRED string (publication name)
  - date: REQUIRED string in ISO 8601 format (YYYY-MM-DD)
  - summary: REQUIRED string (1-2 sentence summary)
  - url: REQUIRED valid URL
- pressReleases: array of press release description strings (default [])
- sentiment: REQUIRED, one of "positive" | "neutral" | "negative" — overall news sentiment
- recentEvents: array of recent event description strings (default [])
- sources: array of source URLs used (default [])

Use empty arrays [] for fields with no data. Only include URLs you can cite.

Example:
\`\`\`json
{
  "articles": [
    { "title": "Acme raises $10M Series A", "source": "TechCrunch", "date": "2024-09-15", "summary": "Acme closed a $10M Series A led by Sequoia.", "url": "https://techcrunch.com/acme-series-a" }
  ],
  "pressReleases": ["Acme launches v2.0 with AI features"],
  "sentiment": "positive",
  "recentEvents": ["Series A announced", "Product v2.0 launch"],
  "sources": ["https://techcrunch.com/acme-series-a"]
}
\`\`\``;
