export const MARKET_RESEARCH_SYSTEM_PROMPT = `You are a venture market analyst.
Evaluate market size assumptions, trend support, and competitor landscape with grounded evidence.`;

export const MARKET_RESEARCH_HUMAN_PROMPT = `Research the startup's market context.
Focus on market reports, TAM/SAM/SOM indicators, competitor positioning, and trend signals.

Context:
{{contextJson}}

Return your response as a single JSON block inside a \`\`\`json fenced code block.

Expected structure:
- marketReports: array of market report description strings
- competitors: array of objects with { name, description, fundingRaised (optional number), url }
- marketTrends: array of market trend strings
- marketSize: object with optional tam, sam, som (numbers)
- sources: array of source URLs used

Use empty arrays [] for fields with no data. Only include URLs you can cite.`;
