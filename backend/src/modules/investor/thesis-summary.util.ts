/**
 * Pure, rule-based thesis summary builder.
 *
 * Extracted as a standalone function so it can be used both by ThesisService
 * (as AI fallback) and InvestorMatchingService (when thesisSummary is null).
 */
export function buildThesisSummary(thesis: Record<string, unknown>): string {
  const sections: string[] = [];

  const readString = (value: unknown): string | null => {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const readStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  };

  const readNumber = (value: unknown): number | null => {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };

  const narrative = readString(thesis.thesisNarrative);
  if (narrative) {
    sections.push(narrative);
  }

  const notes = readString(thesis.notes);
  if (notes) {
    sections.push(`Notes: ${notes}`);
  }

  const formatList = (values: string[]): string | null => {
    if (values.length === 0) {
      return null;
    }

    return values.join(', ');
  };

  const industries = formatList(readStringArray(thesis.industries));
  if (industries) {
    sections.push(`Focus industries: ${industries}.`);
  }

  const stages = formatList(readStringArray(thesis.stages));
  if (stages) {
    sections.push(`Preferred stages: ${stages}.`);
  }

  const geographies = formatList(readStringArray(thesis.geographicFocus));
  if (geographies) {
    sections.push(`Geographic focus: ${geographies}.`);
  }

  const checkSizeMin = readNumber(thesis.checkSizeMin);
  const checkSizeMax = readNumber(thesis.checkSizeMax);
  if (
    typeof checkSizeMin === 'number' ||
    typeof checkSizeMax === 'number'
  ) {
    const minText =
      typeof checkSizeMin === 'number'
        ? checkSizeMin.toLocaleString('en-US')
        : 'any';
    const maxText =
      typeof checkSizeMax === 'number'
        ? checkSizeMax.toLocaleString('en-US')
        : 'any';
    sections.push(`Check size: ${minText} to ${maxText} USD.`);
  }

  const businessModels = formatList(readStringArray(thesis.businessModels));
  if (businessModels) {
    sections.push(`Business model preference: ${businessModels}.`);
  }

  const mustHaveFeatures = formatList(
    readStringArray(thesis.mustHaveFeatures),
  );
  if (mustHaveFeatures) {
    sections.push(`Must-have signals: ${mustHaveFeatures}.`);
  }

  const dealBreakers = formatList(readStringArray(thesis.dealBreakers));
  if (dealBreakers) {
    sections.push(`Deal breakers: ${dealBreakers}.`);
  }

  const antiPortfolio = readString(thesis.antiPortfolio);
  if (antiPortfolio) {
    sections.push(`Anti-portfolio constraints: ${antiPortfolio}.`);
  }

  if (sections.length === 0) {
    return 'General investment thesis — no specific criteria provided.';
  }

  return sections.join(' ').replace(/\s+/g, ' ').trim().slice(0, 2000);
}
