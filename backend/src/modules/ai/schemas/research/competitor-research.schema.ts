import { z } from "zod";

type LooseObject = Record<string, unknown>;

const nullToUndefined = (value: unknown): unknown =>
  value === null ? undefined : value;

const normalizeHttpUrl = (value: unknown): string | undefined => {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }

  let candidate = value.trim();
  if (!candidate || candidate.toLowerCase() === "unknown") {
    return undefined;
  }

  candidate = candidate
    .replace(/^[["'<(]+/, "")
    .replace(/["'>)\]]+$/, "")
    .replace(/&amp;/gi, "&");

  if (!candidate) {
    return undefined;
  }

  if (/^www\./i.test(candidate)) {
    candidate = `https://${candidate}`;
  } else if (
    !/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate) &&
    /^[\w.-]+\.[a-z]{2,}(?:[/?#]|$)/i.test(candidate)
  ) {
    candidate = `https://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
};

const optionalUrl = z.preprocess(
  normalizeHttpUrl,
  z.string().url().optional(),
);

const optionalNonNegativeNumber = z.preprocess(
  nullToUndefined,
  z.number().nonnegative().optional(),
);

const optionalString = z.preprocess(
  nullToUndefined,
  z.string().optional(),
);

const optionalLooseString = z.preprocess((value) => {
  if (value == null) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}, z.string().optional());

const optionalThreatLevel = z.preprocess(
  nullToUndefined,
  z.enum(["high", "medium", "low"]).optional(),
);

const requiredStringFromNull = (fallback: string) =>
  z.preprocess(
    (value) => (value == null ? fallback : value),
    z.string().min(1),
  );

const stringArray = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [],
  z.array(z.string()),
).default([]);

const urlArray = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value
          .map((item) => normalizeHttpUrl(item))
          .filter((item): item is string => Boolean(item))
      : [],
  z.array(z.string().url()),
).default([]);

const isObjectRecord = (value: unknown): value is LooseObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asObjectRecord = (value: unknown): LooseObject | undefined =>
  isObjectRecord(value) ? value : undefined;

const asObjectArray = (value: unknown): LooseObject[] =>
  Array.isArray(value)
    ? value.filter((item): item is LooseObject => isObjectRecord(item))
    : [];

const asString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const asUrlString = (value: unknown): string | undefined => {
  const candidate = asString(value);
  if (!candidate || candidate.toLowerCase() === "unknown") {
    return undefined;
  }
  return /^https?:\/\//i.test(candidate) ? candidate : undefined;
};

const asStringArraySafe = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => asString(item)).filter((item): item is string => Boolean(item))
    : [];

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || /[-+]/.test(trimmed) || /\bto\b/i.test(trimmed)) {
      return undefined;
    }
    const digitsOnly = trimmed.replace(/[$,]/g, "");
    if (!digitsOnly) {
      return undefined;
    }
    const parsed = Number(digitsOnly);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const joinSentences = (parts: Array<string | undefined>): string =>
  parts.filter((part): part is string => Boolean(part)).join(" ");

const normalizeCompetitorKey = (name: string): string =>
  name.trim().toLowerCase();

const buildCanonicalCompetitorResearch = (input: LooseObject): LooseObject => {
  const competitorIdentification = asObjectRecord(input.competitorIdentification);
  const competitorProfiles = asObjectArray(input.competitorProfiles);
  const featureComparisonMatrix = asObjectArray(input.featureComparisonMatrix);
  const competitiveDynamics = asObjectRecord(input.competitiveDynamics);

  const directEntries = asObjectArray(competitorIdentification?.directCompetitors);
  const indirectEntries = asObjectArray(competitorIdentification?.indirectCompetitors);
  const emergingThreatEntries = asObjectArray(competitorIdentification?.emergingThreats);

  const directByName = new Map<string, LooseObject>();
  for (const entry of directEntries) {
    const name = asString(entry.name);
    if (!name) {
      continue;
    }
    directByName.set(normalizeCompetitorKey(name), entry);
  }

  const profileByName = new Map<string, LooseObject>();
  for (const profile of competitorProfiles) {
    const name = asString(profile.name);
    if (!name) {
      continue;
    }
    profileByName.set(normalizeCompetitorKey(name), profile);
  }

  const orderedCompetitorNames: string[] = [];
  for (const entry of directEntries) {
    const name = asString(entry.name);
    if (!name) {
      continue;
    }
    const key = normalizeCompetitorKey(name);
    if (!orderedCompetitorNames.some((candidate) => normalizeCompetitorKey(candidate) === key)) {
      orderedCompetitorNames.push(name);
    }
  }
  for (const profile of competitorProfiles) {
    const name = asString(profile.name);
    if (!name) {
      continue;
    }
    const key = normalizeCompetitorKey(name);
    if (!orderedCompetitorNames.some((candidate) => normalizeCompetitorKey(candidate) === key)) {
      orderedCompetitorNames.push(name);
    }
  }

  const competitors = orderedCompetitorNames.map((name) => {
    const key = normalizeCompetitorKey(name);
    const direct = directByName.get(key);
    const profile = profileByName.get(key);
    const funding = asObjectRecord(profile?.funding);
    const team = asObjectRecord(profile?.team);
    const product = asObjectRecord(profile?.product);
    const positioning = asObjectRecord(profile?.positioning);
    const traction = asObjectRecord(profile?.traction);

    const description =
      asString(direct?.reasoning) ??
      asString(positioning?.messaging) ??
      asString(product?.techApproach) ??
      "Description unavailable";

    const productOverview =
      asString(product?.techApproach) ??
      asString(positioning?.messaging) ??
      asString(direct?.reasoning) ??
      "Product overview unavailable";

    const coreFeatures = asStringArraySafe(product?.coreFeatures);
    const recentLaunches = asString(product?.recentLaunches);
    const keyInvestors = asStringArraySafe(funding?.keyInvestors);

    const fundingObject =
      asString(funding?.totalRaised) ||
      asString(funding?.lastRound) ||
      asString(funding?.lastRoundDate) ||
      keyInvestors.length
        ? {
            totalRaised: asString(funding?.totalRaised),
            lastRound: asString(funding?.lastRound),
            lastRoundDate: asString(funding?.lastRoundDate),
            keyInvestors,
          }
        : undefined;

    const companySize = asString(team?.size);

    return {
      name,
      description,
      website: asUrlString(direct?.website) ?? asUrlString(profile?.website),
      fundingRaised: asNumber(funding?.totalRaised),
      fundingStage: asString(funding?.lastRound),
      employeeCount: asNumber(companySize),
      productOverview,
      keyFeatures: coreFeatures,
      pricing: profile?.pricing,
      targetMarket: asString(positioning?.messaging),
      differentiators: [],
      weaknesses: [],
      threatLevel: undefined,
      funding: fundingObject,
      productFeatures: coreFeatures,
      recentNews: recentLaunches ? [recentLaunches] : [],
      marketShare: joinSentences([
        asString(traction?.metrics),
        asString(traction?.reviewCounts),
      ]) || undefined,
    };
  });

  const indirectCompetitors = [
    ...indirectEntries.map((entry) => ({
      name: asString(entry.name) ?? "Unknown competitor",
      description:
        asString(entry.reasoning) ?? asString(entry.description) ?? "Description unavailable",
      whyIndirect:
        asString(entry.reasoning) ??
        asString(entry.whyIndirect) ??
        "Indirect relationship not specified",
      threatLevel: undefined,
      website: asUrlString(entry.website),
    })),
    ...emergingThreatEntries.map((entry) => ({
      name: asString(entry.name) ?? "Unknown competitor",
      description:
        asString(entry.reasoning) ?? "Potential adjacent entrant or expansion threat",
      whyIndirect:
        asString(entry.reasoning) ?? "Potential adjacent entrant or expansion threat",
      threatLevel: "medium" as const,
      website: asUrlString(entry.website),
    })),
  ];

  const directNames = competitors.map((competitor) => competitor.name);
  const evidenceSectionCounts = competitiveDynamics
    ? [
        "marketShareSignals",
        "barriersToEntry",
        "networkEffects",
        "switchingCosts",
        "consolidationActivity",
      ].map((key) => ({
        key,
        count: asObjectArray(competitiveDynamics[key]).length,
      }))
    : [];

  const evidenceSummary = evidenceSectionCounts
    .filter((section) => section.count > 0)
    .map((section) => `${section.key}:${section.count}`)
    .join(", ");

  const matrixSummary =
    featureComparisonMatrix.length > 0
      ? `Feature comparison matrix covers ${featureComparisonMatrix.length} features.`
      : undefined;

  const marketPositioning =
    directNames.length > 0
      ? `Primary competitive set includes ${directNames.slice(0, 5).join(", ")}.`
      : "";

  const competitiveLandscapeSummary = joinSentences([
    competitors.length
      ? `Mapped ${competitors.length} direct competitor profiles.`
      : undefined,
    indirectCompetitors.length
      ? `Mapped ${indirectCompetitors.length} indirect or emerging threats.`
      : undefined,
    matrixSummary,
    evidenceSummary ? `Dynamics evidence captured across ${evidenceSummary}.` : undefined,
  ]);

  return {
    competitors,
    indirectCompetitors,
    marketPositioning,
    competitiveLandscapeSummary,
    sources: input.sources,
  };
};

const normalizeCompetitorResearchPayload = (value: unknown): unknown => {
  if (!isObjectRecord(value)) {
    return value;
  }

  const looksLegacy =
    "competitors" in value ||
    "indirectCompetitors" in value ||
    "marketPositioning" in value ||
    "competitiveLandscapeSummary" in value;
  if (looksLegacy) {
    return value;
  }

  const looksRich =
    "competitorIdentification" in value ||
    "competitorProfiles" in value ||
    "featureComparisonMatrix" in value ||
    "competitiveDynamics" in value;

  if (!looksRich) {
    return value;
  }

  return buildCanonicalCompetitorResearch(value);
};

export const CompetitorDetailSchema = z.object({
  name: requiredStringFromNull("Unknown competitor"),
  description: requiredStringFromNull("Description unavailable"),
  website: optionalUrl,
  fundingRaised: optionalNonNegativeNumber,
  fundingStage: optionalString,
  employeeCount: optionalNonNegativeNumber,
  productOverview: requiredStringFromNull("Product overview unavailable"),
  keyFeatures: stringArray,
  pricing: optionalLooseString,
  targetMarket: optionalString,
  differentiators: stringArray,
  weaknesses: stringArray,
  threatLevel: optionalThreatLevel,
  funding: z.object({
    totalRaised: optionalString,
    lastRound: optionalString,
    lastRoundDate: optionalString,
    keyInvestors: stringArray,
  }).optional(),
  productFeatures: stringArray,
  recentNews: stringArray,
  marketShare: optionalString,
});

export const IndirectCompetitorDetailSchema = z.object({
  name: requiredStringFromNull("Unknown competitor"),
  description: requiredStringFromNull("Description unavailable"),
  whyIndirect: requiredStringFromNull("Indirect relationship not specified"),
  threatLevel: optionalThreatLevel,
  website: optionalUrl,
});

export const CompetitorResearchObjectSchema = z.object({
  competitors: z.array(CompetitorDetailSchema).default([]),
  indirectCompetitors: z.array(IndirectCompetitorDetailSchema).default([]),
  marketPositioning: z.string().default(""),
  competitiveLandscapeSummary: z.string().default(""),
  sources: urlArray,
});

export const CompetitorResearchSchema = z.preprocess(
  normalizeCompetitorResearchPayload,
  CompetitorResearchObjectSchema,
);

export type CompetitorResearch = z.infer<typeof CompetitorResearchSchema>;
