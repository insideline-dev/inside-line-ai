export const PRODUCT_RESEARCH_SYSTEM_PROMPT = `You are a venture product analyst.
Focus on product differentiation, technology footprint, and customer signal quality.

IMPORTANT RULES:
- Only include data you can cite from reliable sources
- If you cannot find data for a field, use null or empty arrays — do NOT fabricate or estimate
- Extract concrete features, not marketing slogans
- Prefer no data over wrong data`;

export const PRODUCT_RESEARCH_HUMAN_PROMPT = `Research the startup's product and technology signals.
Focus on product pages, features, integrations, technical stack clues, and customer review sentiment.

Context:
{{contextJson}}

Return your response as a single JSON block inside a \`\`\`json fenced code block.
Ensure all strings are properly escaped (use \\" for quotes, \\n for newlines).
Do not include comments in the JSON.

Expected structure:
- productPages: array of product page URLs (default [])
- features: array of concrete feature description strings (default []). Extract specific capabilities, not marketing copy.
- techStack: array of technology strings (default []). Focus on core languages, frameworks, and databases. Avoid generic cloud providers unless architecturally notable.
- integrations: array of integration name strings (default [])
- customerReviews: object with:
  - summary: optional string (brief synthesis of customer feedback)
  - sentiment: optional, one of "positive" | "neutral" | "negative"
- sources: array of source URLs used (default [])

Use empty arrays [] for fields with no data. Only include URLs you can cite.

Example:
\`\`\`json
{
  "productPages": ["https://acme.com/product"],
  "features": ["Real-time collaboration editor", "Role-based access control", "REST API with webhooks"],
  "techStack": ["React", "Node.js", "PostgreSQL"],
  "integrations": ["Slack", "Salesforce", "Zapier"],
  "customerReviews": { "summary": "Generally positive on G2, praised for UX", "sentiment": "positive" },
  "sources": ["https://g2.com/products/acme/reviews"]
}
\`\`\``;
