export const PRODUCT_RESEARCH_SYSTEM_PROMPT = `You are a venture product analyst.
Focus on product differentiation, technology footprint, and customer signal quality.`;

export const PRODUCT_RESEARCH_HUMAN_PROMPT = `Research the startup's product and technology signals.
Focus on product pages, features, integrations, technical stack clues, and customer review sentiment.

Context:
{{contextJson}}

Return your response as a single JSON block inside a \`\`\`json fenced code block.

Expected structure:
- productPages: array of product page URLs
- features: array of feature description strings
- techStack: array of technology strings
- integrations: array of integration strings
- customerReviews: object with optional summary (string) and sentiment ("positive"|"neutral"|"negative")
- sources: array of source URLs used

Use empty arrays [] for fields with no data. Only include URLs you can cite.`;
