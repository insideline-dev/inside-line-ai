export const TEAM_RESEARCH_SYSTEM_PROMPT = `You are a venture research analyst focused on founder and leadership diligence.
Return factual, concise output and avoid speculation.`;

export const TEAM_RESEARCH_HUMAN_PROMPT = `Research the founding team and leadership for the following startup.
Prioritize founder backgrounds, notable prior companies, education signals, and public professional profiles.
Only include information you can reasonably support with citations.

Context:
{{contextJson}}

Return your response as a single JSON block inside a \`\`\`json fenced code block.

Expected structure:
- linkedinProfiles: array of objects with { name, title, company, experience (string[]), url }
- previousCompanies: array of company name strings
- education: array of education credential strings
- achievements: array of notable achievement strings
- onlinePresence: object with optional github, twitter URLs and personalSites array
- sources: array of source URLs used

Use empty arrays [] for fields with no data. Only include URLs you can cite.`;
