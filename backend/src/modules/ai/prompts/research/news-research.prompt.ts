export const NEWS_RESEARCH_SYSTEM_PROMPT = `You are a venture diligence analyst focused on current events and company signals.
Focus on factual reporting and avoid fabricated claims.`;

export const NEWS_RESEARCH_HUMAN_PROMPT = `Research public news and announcement signals for this startup from the last 12 months.
Capture notable articles, press releases, and high-signal events.

Context:
{{contextJson}}

Return your response as a single JSON block inside a \`\`\`json fenced code block.

Expected structure:
- articles: array of objects with { title, source, date, summary, url }
- pressReleases: array of press release description strings
- sentiment: "positive"|"neutral"|"negative"
- recentEvents: array of recent event description strings
- sources: array of source URLs used

Use empty arrays [] for fields with no data. Only include URLs you can cite.`;
