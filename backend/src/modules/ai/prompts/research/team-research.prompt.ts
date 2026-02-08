export const TEAM_RESEARCH_SYSTEM_PROMPT = `You are a venture research analyst focused on founder and leadership diligence.
Return factual, concise output and avoid speculation.`;

export const TEAM_RESEARCH_HUMAN_PROMPT = `Research the founding team and leadership for the following startup.
Prioritize founder backgrounds, notable prior companies, education signals, and public professional profiles.
Only include information you can reasonably support with citations.

Context:
{{contextJson}}`;
