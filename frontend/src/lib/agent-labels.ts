/**
 * Maps internal evaluation agent keys to friendly, user-facing labels shown
 * whenever we expose document routing (submit form, data room, re-eval feedback).
 */
const AGENT_LABELS: Record<string, string> = {
  team: "Team Analysis",
  market: "Market Research",
  product: "Product Assessment",
  traction: "Traction",
  businessModel: "Business Model",
  gtm: "Go-to-Market",
  financials: "Financial Review",
  competitiveAdvantage: "Competitive Advantage",
  legal: "Legal Review",
  dealTerms: "Deal Terms",
  exitPotential: "Exit Potential",
};

export function formatAgentLabel(agentKey: string): string {
  return (
    AGENT_LABELS[agentKey] ??
    agentKey
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (c) => c.toUpperCase())
      .trim()
  );
}

export function formatAgentLabels(agentKeys: string[] | null | undefined): string[] {
  if (!agentKeys || agentKeys.length === 0) return [];
  return agentKeys.map(formatAgentLabel);
}

const CATEGORY_LABELS: Record<string, string> = {
  pitch_deck: "Pitch Deck",
  financial: "Financial",
  cap_table: "Cap Table",
  legal: "Legal",
  technical_product: "Technical / Product",
  business_plan: "Business Plan",
  market_research: "Market Research",
  contract: "Contract",
  team_hr: "Team / HR",
  miscellaneous: "Miscellaneous",
};

export function formatCategoryLabel(category: string): string {
  return (
    CATEGORY_LABELS[category] ??
    category
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}
