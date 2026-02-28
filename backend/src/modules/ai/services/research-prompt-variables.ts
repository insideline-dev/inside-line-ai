import type { ResearchAgentKey, ResearchPipelineInput } from "../interfaces/agent.interface";

export interface ResearchFeedbackPromptContextItem {
  scope: string;
  feedback: string;
  createdAt: Date;
}

type ResearchTemplateVariables = {
  contextJson: string;
  agentName: string;
  agentKey: string;
  companyName: string;
  sector: string;
  website: string;
  founderNames: string;
  teamMembers: string;
  deckClaims: string;
  adminGuidance: string;
  location: string;
  claimedTam: string;
  claimedGrowthRate: string;
  targetMarket: string;
  productDescription: string;
  claimedTechStack: string;
  knownCompetitors: string;
  claimedDifferentiation: string;
  targetCustomers: string;
  geographicFocus: string;
  businessModel: string;
  fundingStage: string;
  orchestratorGuidance: string;
};

const DEFAULT_TEXT = "Not provided";
const DEFAULT_LIST_TEXT = "None provided";

const TECH_KEYWORDS = [
  "python",
  "typescript",
  "javascript",
  "java",
  "go",
  "rust",
  "node",
  "react",
  "next.js",
  "postgres",
  "mysql",
  "mongodb",
  "redis",
  "kubernetes",
  "aws",
  "gcp",
  "azure",
  "api",
  "llm",
  "ai",
];

const firstNonEmpty = (...values: Array<string | null | undefined>): string | undefined => {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return undefined;
};

const truncate = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}\n...[truncated]`;
};

const toBulletList = (
  items: Array<string | null | undefined>,
  fallback = DEFAULT_LIST_TEXT,
): string => {
  const values = items
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);

  if (values.length === 0) {
    return fallback;
  }

  return values.map((item) => `- ${item}`).join("\n");
};

const extractClaimLine = (rawText: string, matcher: RegExp): string => {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const matched = lines.find((line) => matcher.test(line));
  return matched ?? DEFAULT_TEXT;
};

const extractTechSignals = (
  rawText: string,
  websiteHeadings: string[],
  trl: string | null | undefined,
): string => {
  const normalizedRaw = rawText.toLowerCase();
  const normalizedHeadings = websiteHeadings.join(" ").toLowerCase();
  const hits = TECH_KEYWORDS.filter(
    (keyword) =>
      normalizedRaw.includes(keyword) || normalizedHeadings.includes(keyword),
  );
  const uniqueHits = Array.from(new Set(hits)).slice(0, 10);
  const values = uniqueHits.map((hit) =>
    hit === "api" ? "API" : hit.toUpperCase() === hit ? hit : hit,
  );

  if (trl && trl.trim().length > 0) {
    values.unshift(`Technology Readiness Level: ${trl.trim()}`);
  }

  return values.length > 0 ? toBulletList(values) : DEFAULT_TEXT;
};

const buildTeamMembersSummary = (
  pipelineInput: ResearchPipelineInput,
): string => {
  const fromScrape = pipelineInput.scraping.teamMembers.map((member) => {
    const name = member.name?.trim() || "Unknown";
    const role = member.role?.trim();
    const linkedin = member.linkedinUrl?.trim();

    if (role && linkedin) {
      return `${name} - ${role} (${linkedin})`;
    }
    if (role) {
      return `${name} - ${role}`;
    }
    if (linkedin) {
      return `${name} (${linkedin})`;
    }
    return name;
  });

  const fromIntake =
    pipelineInput.extraction.startupContext?.teamMembers?.map((member) => {
      const name = member.name?.trim() || "Unknown";
      const role = member.role?.trim();
      const linkedin = member.linkedinUrl?.trim();

      if (role && linkedin) {
        return `${name} - ${role} (${linkedin})`;
      }
      if (role) {
        return `${name} - ${role}`;
      }
      if (linkedin) {
        return `${name} (${linkedin})`;
      }
      return name;
    }) ?? [];

  const merged = Array.from(new Set([...fromScrape, ...fromIntake]));
  return toBulletList(merged);
};

const buildDeckClaims = (pipelineInput: ResearchPipelineInput): string => {
  const notableClaims = pipelineInput.scraping.notableClaims ?? [];
  const rawText = pipelineInput.extraction.rawText?.trim() ?? "";

  if (notableClaims.length > 0 && rawText.length === 0) {
    return toBulletList(notableClaims);
  }

  if (notableClaims.length === 0 && rawText.length > 0) {
    return truncate(rawText, 8000);
  }

  if (notableClaims.length > 0 && rawText.length > 0) {
    return [
      "Notable claims:",
      toBulletList(notableClaims),
      "",
      "Pitch deck/body text excerpt:",
      truncate(rawText, 8000),
    ].join("\n");
  }

  return DEFAULT_TEXT;
};

const buildKnownCompetitors = (
  agentContext: Record<string, unknown>,
  pipelineInput: ResearchPipelineInput,
): string => {
  const explicit = Array.isArray(agentContext.knownCompetitors)
    ? agentContext.knownCompetitors
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];

  const fromClaims = pipelineInput.scraping.notableClaims
    .filter((claim) => /(competitor|alternative|vs\.?|compare)/i.test(claim))
    .map((claim) => claim.trim());

  return toBulletList(Array.from(new Set([...explicit, ...fromClaims])));
};

const buildAdminGuidance = (
  adminFeedback: ResearchFeedbackPromptContextItem[],
): string => {
  if (adminFeedback.length === 0) {
    return "No additional admin guidance.";
  }

  return adminFeedback
    .map((item) => {
      const date = item.createdAt.toISOString().slice(0, 10);
      return `- [${item.scope}] (${date}) ${item.feedback}`;
    })
    .join("\n");
};

export const buildResearchPromptVariables = (input: {
  key: ResearchAgentKey;
  agentName: string;
  pipelineInput: ResearchPipelineInput;
  agentContext: Record<string, unknown>;
  adminFeedback: ResearchFeedbackPromptContextItem[];
}): {
  promptContext: Record<string, unknown>;
  templateVariables: ResearchTemplateVariables;
} => {
  const { pipelineInput, agentContext, adminFeedback } = input;
  const { extraction, scraping } = pipelineInput;
  const startupFormContext = extraction.startupContext ?? {};
  const websiteHeadings =
    scraping.website?.headings
      .map((item) => item.trim())
      .filter((item) => item.length > 0) ?? [];

  const companyName = firstNonEmpty(extraction.companyName) ?? DEFAULT_TEXT;
  const sector =
    firstNonEmpty(
      startupFormContext.sectorIndustry ?? undefined,
      startupFormContext.sectorIndustryGroup ?? undefined,
      extraction.industry,
    ) ?? DEFAULT_TEXT;
  const website =
    firstNonEmpty(extraction.website, scraping.websiteUrl ?? undefined) ??
    DEFAULT_TEXT;
  const founderNames = toBulletList(extraction.founderNames);
  const teamMembers = buildTeamMembersSummary(pipelineInput);
  const deckClaims = buildDeckClaims(pipelineInput);
  const adminGuidance = buildAdminGuidance(adminFeedback);
  const location = firstNonEmpty(extraction.location) ?? DEFAULT_TEXT;
  const rawText = extraction.rawText ?? "";
  const claimedTam = extractClaimLine(
    rawText,
    /(tam|sam|som|total addressable market|serviceable addressable market|serviceable obtainable market|market size)/i,
  );
  const claimedGrowthRate = extractClaimLine(
    rawText,
    /(cagr|growth|year[- ]over[- ]year|yoy|%)/i,
  );
  const targetMarket =
    firstNonEmpty(
      typeof agentContext.targetMarket === "string"
        ? agentContext.targetMarket
        : undefined,
      extraction.tagline,
    ) ?? DEFAULT_TEXT;
  const productDescription =
    firstNonEmpty(
      startupFormContext.productDescription ?? undefined,
      typeof agentContext.productDescription === "string"
        ? agentContext.productDescription
        : undefined,
      extraction.tagline,
      extraction.rawText,
    ) ?? DEFAULT_TEXT;
  const claimedTechStack = extractTechSignals(
    rawText,
    websiteHeadings,
    startupFormContext.technologyReadinessLevel,
  );
  const knownCompetitors = buildKnownCompetitors(agentContext, pipelineInput);
  const claimedDifferentiation =
    firstNonEmpty(extraction.tagline, scraping.notableClaims[0]) ?? DEFAULT_TEXT;

  const rp = pipelineInput.researchParameters;
  const orchestratorGuidance =
    firstNonEmpty(pipelineInput.orchestratorGuidance) ??
    "No orchestrator guidance available.";

  const promptContext = {
    ...agentContext,
    orchestratorGuidance,
    startupFormContext,
    adminFeedback: adminFeedback.map((item) => ({
      scope: item.scope,
      feedback: item.feedback,
      createdAt: item.createdAt.toISOString(),
    })),
  };

  return {
    promptContext,
    templateVariables: {
      contextJson: `<user_provided_data>\n${JSON.stringify(promptContext)}\n</user_provided_data>`,
      agentName: input.agentName,
      agentKey: input.key,
      companyName,
      sector,
      website,
      founderNames,
      teamMembers,
      deckClaims,
      adminGuidance,
      location,
      claimedTam: rp?.claimedMetrics?.tam ?? claimedTam,
      claimedGrowthRate: rp?.claimedMetrics?.growthRate ?? claimedGrowthRate,
      targetMarket: rp?.specificMarket || targetMarket,
      productDescription: truncate(rp?.productDescription || productDescription, 8000),
      claimedTechStack,
      knownCompetitors: rp?.knownCompetitors?.length
        ? toBulletList(rp.knownCompetitors)
        : knownCompetitors,
      claimedDifferentiation,
      targetCustomers: rp?.targetCustomers || DEFAULT_TEXT,
      geographicFocus: rp?.geographicFocus || DEFAULT_TEXT,
      businessModel: rp?.businessModel || DEFAULT_TEXT,
      fundingStage: rp?.fundingStage || DEFAULT_TEXT,
      orchestratorGuidance,
    },
  };
};
