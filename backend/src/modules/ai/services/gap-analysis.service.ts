import { Injectable } from "@nestjs/common";
import type {
  ExtractionResult,
  ScrapingResult,
} from "../interfaces/phase-results.interface";
import type {
  GapCategory,
  GapCategoryName,
  GapReport,
} from "../interfaces/gap-analysis.interface";

type Priority = GapCategory["priority"];

interface FieldCheck {
  name: string;
  present: boolean;
}

@Injectable()
export class GapAnalysisService {
  analyze(
    extraction: ExtractionResult,
    scraping: ScrapingResult,
  ): GapReport {
    const categories: GapCategory[] = [
      this.analyzeTeam(extraction, scraping),
      this.analyzeFinancials(extraction),
      this.analyzeTraction(extraction, scraping),
      this.analyzeMarket(extraction, scraping),
      this.analyzeProduct(extraction, scraping),
      this.analyzeCompetitiveLandscape(extraction, scraping),
    ];

    const overallCompleteness = Math.round(
      categories.reduce((sum, c) => sum + c.completenessScore, 0) /
        categories.length,
    );

    const topPriorities = categories
      .filter((c) => c.priority === "critical" || c.priority === "high")
      .flatMap((c) => c.researchDirectives.slice(0, 2));

    return { overallCompleteness, categories, topPriorities };
  }

  // ---------------------------------------------------------------------------
  // Category analyzers
  // ---------------------------------------------------------------------------

  private analyzeTeam(
    extraction: ExtractionResult,
    scraping: ScrapingResult,
  ): GapCategory {
    const hasFounders = extraction.founderNames.length > 0;
    const enrichedMembers = scraping.teamMembers.filter(
      (m) => m.enrichmentStatus === "success",
    );
    const hasLinkedIn = scraping.teamMembers.some((m) => m.linkedinUrl);
    const hasTeamBios =
      (scraping.website?.teamBios?.length ?? 0) > 0;

    const fields = this.checkFields([
      { name: "founderNames", present: hasFounders },
      { name: "teamMembers.enrichment", present: enrichedMembers.length > 0 },
      { name: "linkedinProfiles", present: hasLinkedIn },
      { name: "websiteTeamBios", present: hasTeamBios },
    ]);

    const directives: string[] = [];
    if (!hasLinkedIn && hasFounders) {
      for (const name of extraction.founderNames) {
        directives.push(`Search for LinkedIn profile of ${name}`);
      }
    }
    if (!hasFounders) {
      directives.push(
        `Research founding team of ${extraction.companyName}`,
      );
    }
    if (enrichedMembers.length === 0 && hasFounders) {
      directives.push(
        `Research professional background of founders at ${extraction.companyName}`,
      );
    }

    const score = this.computeScore(fields);

    let priority: Priority;
    if (!hasFounders) priority = "critical";
    else if (!hasLinkedIn) priority = "high";
    else priority = this.derivePriority(score);

    return this.buildCategory("team", score, fields, directives, priority);
  }

  private analyzeFinancials(extraction: ExtractionResult): GapCategory {
    const ctx = extraction.startupContext;

    const fields = this.checkFields([
      { name: "fundingAsk", present: extraction.fundingAsk != null },
      { name: "valuation", present: extraction.valuation != null },
      { name: "hasPreviousFunding", present: ctx?.hasPreviousFunding != null },
      {
        name: "previousFundingAmount",
        present: ctx?.previousFundingAmount != null,
      },
      { name: "roundCurrency", present: !!ctx?.roundCurrency },
    ]);

    const directives: string[] = [];
    if (extraction.fundingAsk == null) {
      directives.push(
        `Search for funding history of ${extraction.companyName} on Crunchbase`,
      );
    }
    if (extraction.valuation == null) {
      directives.push(
        `Research ${extraction.companyName} valuation and funding rounds`,
      );
    }

    const score = this.computeScore(fields);
    const priority: Priority =
      extraction.fundingAsk == null ? "high" : this.derivePriority(score);

    return this.buildCategory(
      "financials",
      score,
      fields,
      directives,
      priority,
    );
  }

  private analyzeTraction(
    extraction: ExtractionResult,
    scraping: ScrapingResult,
  ): GapCategory {
    const hasWebsite = !!scraping.website;
    const hasProductDesc = !!extraction.startupContext?.productDescription;
    const hasCustomerLogos =
      (scraping.website?.customerLogos?.length ?? 0) > 0;
    const hasTestimonials =
      (scraping.website?.testimonials?.length ?? 0) > 0;

    const fields = this.checkFields([
      { name: "website", present: hasWebsite },
      { name: "productDescription", present: hasProductDesc },
      { name: "customerLogos", present: hasCustomerLogos },
      { name: "testimonials", present: hasTestimonials },
    ]);

    const directives: string[] = [];
    if (!hasCustomerLogos && !hasTestimonials) {
      directives.push(
        `Search for ${extraction.companyName} customer reviews on G2 and Capterra`,
      );
    }
    directives.push(
      `Research traction metrics for ${extraction.companyName}`,
    );

    const score = this.computeScore(fields);
    const priority: Priority =
      !hasWebsite && !hasProductDesc ? "high" : this.derivePriority(score);

    return this.buildCategory(
      "traction",
      score,
      fields,
      directives,
      priority,
    );
  }

  private analyzeMarket(
    extraction: ExtractionResult,
    scraping: ScrapingResult,
  ): GapCategory {
    const industryKnown =
      !!extraction.industry && extraction.industry !== "Pending extraction";
    const hasMarketClaims = scraping.notableClaims.some(
      (c) =>
        c.toLowerCase().includes("market") ||
        c.toLowerCase().includes("tam") ||
        c.toLowerCase().includes("sam"),
    );
    const hasMarketSizeInText =
      extraction.rawText.toLowerCase().includes("market size") ||
      extraction.rawText.toLowerCase().includes("total addressable");

    const fields = this.checkFields([
      { name: "industry", present: industryKnown },
      { name: "marketClaimsFromScraping", present: hasMarketClaims },
      { name: "marketSizeInRawText", present: hasMarketSizeInText },
    ]);

    const industry = industryKnown ? extraction.industry : "their";

    const directives: string[] = [];
    directives.push(`Research TAM/SAM/SOM for ${industry} market`);
    directives.push(
      `Search for market reports in ${industry} sector`,
    );

    const score = this.computeScore(fields);
    const priority: Priority = !industryKnown
      ? "high"
      : this.derivePriority(score);

    return this.buildCategory("market", score, fields, directives, priority);
  }

  private analyzeProduct(
    extraction: ExtractionResult,
    scraping: ScrapingResult,
  ): GapCategory {
    const hasWebsite = !!extraction.website;
    const hasPricing = !!scraping.website?.pricing;
    const hasProductPages =
      scraping.website?.subpages?.some(
        (p) =>
          p.title.toLowerCase().includes("product") ||
          p.url.toLowerCase().includes("product"),
      ) ?? false;
    const hasDemoUrl = !!extraction.startupContext?.demoUrl;

    const fields = this.checkFields([
      { name: "website", present: hasWebsite },
      { name: "pricingData", present: hasPricing },
      { name: "productSubpages", present: hasProductPages },
      { name: "demoUrl", present: hasDemoUrl },
    ]);

    const directives: string[] = [];
    directives.push(
      `Research product features and pricing for ${extraction.companyName}`,
    );
    directives.push(
      `Search for ${extraction.companyName} on Product Hunt and similar platforms`,
    );

    const score = this.computeScore(fields);
    const priority: Priority = !hasWebsite
      ? "high"
      : this.derivePriority(score);

    return this.buildCategory("product", score, fields, directives, priority);
  }

  private analyzeCompetitiveLandscape(
    extraction: ExtractionResult,
    scraping: ScrapingResult,
  ): GapCategory {
    const hasCustomerLogos =
      (scraping.website?.customerLogos?.length ?? 0) > 0;
    const hasTestimonials =
      (scraping.website?.testimonials?.length ?? 0) > 0;
    const hasCompetitorMentions =
      extraction.rawText.toLowerCase().includes("competitor") ||
      extraction.rawText.toLowerCase().includes("competitive");

    const fields = this.checkFields([
      { name: "customerLogos", present: hasCustomerLogos },
      { name: "testimonials", present: hasTestimonials },
      { name: "competitorMentionsInText", present: hasCompetitorMentions },
    ]);

    const industry =
      extraction.industry && extraction.industry !== "Pending extraction"
        ? extraction.industry
        : "their";

    const directives: string[] = [];
    directives.push(
      `Search for competitors of ${extraction.companyName} in ${industry}`,
    );
    directives.push(
      `Research competitive landscape for ${industry} startups`,
    );

    const score = this.computeScore(fields);

    return this.buildCategory(
      "competitiveLandscape",
      score,
      fields,
      directives,
      this.derivePriority(score),
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private checkFields(
    checks: FieldCheck[],
  ): { available: string[]; missing: string[] } {
    const available: string[] = [];
    const missing: string[] = [];
    for (const { name, present } of checks) {
      (present ? available : missing).push(name);
    }
    return { available, missing };
  }

  private computeScore(fields: { available: string[]; missing: string[] }): number {
    const total = fields.available.length + fields.missing.length;
    if (total === 0) return 0;
    return Math.round((fields.available.length / total) * 100);
  }

  private derivePriority(score: number): Priority {
    if (score <= 20) return "critical";
    if (score <= 40) return "high";
    if (score <= 70) return "medium";
    return "low";
  }

  private buildCategory(
    category: GapCategoryName,
    completenessScore: number,
    fields: { available: string[]; missing: string[] },
    researchDirectives: string[],
    priority: Priority,
  ): GapCategory {
    return {
      category,
      completenessScore,
      availableFields: fields.available,
      missingFields: fields.missing,
      researchDirectives,
      priority,
    };
  }
}
