import { describe, expect, it, mock } from "bun:test";
import { LensContentRouterService } from "../lens-content-router.service";
import { PipelinePhase } from "../../interfaces/pipeline.interface";
import { DocumentCategory } from "../../interfaces/document-classification.interface";
import type { PipelineStateService } from "../../services/pipeline-state.service";
import type {
  EnrichmentResult,
  ExtractionResult,
  ScrapingResult,
} from "../../interfaces/phase-results.interface";

/**
 * DS-E2-F1-S3 — verify the per-lens scoping. The router should:
 *  - route market/problem/solution/competitors to market lens only
 *  - route team section + team profiles + TEAM_HR docs to team lens only
 *  - route traction/financials + tractionSignals + FINANCIAL docs to traction lens only
 *  - never leak the wrong content to a lens
 */
describe("LensContentRouterService", () => {
  const fakeExtraction: ExtractionResult = {
    companyName: "Acme",
    description: "Acme builds robots",
    tagline: "",
    founderNames: [],
    industry: "Robotics",
    stage: "seed",
    location: "SF",
    website: "https://acme.test",
    rawText:
      "We sell robots into a $50B market. Our team has former Tesla engineers. Customers: Ford, GM. ARR is $1.2M.",
    deckStructuredData: {
      extractedAt: "2026-05-24T00:00:00Z",
      market: {
        tam: "$50B",
        sam: "$8B",
        som: "$200M",
        marketGrowthRate: "23% CAGR",
        tamKpi: null,
        sourcePages: [7],
      },
      problem: {
        statement: "Manufacturing labor shortage",
        painPoints: ["Hiring is hard", "Wages rising"],
        sourcePages: [3],
      },
      solution: {
        statement: "Autonomous arms",
        keyDifferentiators: ["No retooling needed"],
        sourcePages: [4],
      },
      competitors: {
        namedCompetitors: [
          { name: "Symbotic", positioning: "Warehouse only" },
        ],
        moat: "Software stack",
        sourcePages: [9],
      },
      team: {
        founderCount: 3,
        teamSize: "12",
        keyMembers: [{ name: "Alice Chen", role: "CEO" }],
        sourcePages: [11],
      },
      traction: {
        customers: "5 paying",
        users: null,
        churnRate: "0%",
        notableClaims: ["3 LOIs from Fortune 500"],
        sourcePages: [12],
      },
      financials: {
        arr: "$1.2M",
        mrr: null,
        revenue: "$1.4M",
        growthRate: "40%",
        growthRatePeriod: "QoQ",
        grossMargin: "60%",
        burnRate: null,
        runway: "18 months",
        ltv: null,
        cac: null,
        nrr: null,
        arrKpi: null,
        growthRateKpi: null,
        grossMarginKpi: null,
        sourcePages: [13],
      },
      fundraising: {
        askAmount: null,
        valuation: null,
        roundType: null,
        useOfFunds: [],
        previousFunding: null,
        sourcePages: [],
      },
      product: {
        stage: null,
        description: null,
        keyFeatures: [],
        sourcePages: [],
      },
    },
    supportingDocTexts: [
      {
        fileName: "financials_2026q1.xlsx",
        contentType: "application/vnd.ms-excel",
        category: DocumentCategory.FINANCIAL,
        text: "Q1 ARR: $1.2M; QoQ growth: 40%",
        truncated: false,
      },
      {
        fileName: "alice_cv.pdf",
        contentType: "application/pdf",
        category: DocumentCategory.TEAM_HR,
        text: "Alice Chen — Ex-Tesla Autopilot lead, MIT MechE",
        truncated: false,
      },
      {
        fileName: "industry_report.pdf",
        contentType: "application/pdf",
        category: DocumentCategory.MARKET_RESEARCH,
        text: "Global robotics market projected to reach $80B by 2030",
        truncated: false,
      },
    ],
  };

  const fakeEnrichment: EnrichmentResult = {
    discoveredFounders: [
      {
        name: "Bob Lin",
        role: "CTO",
        linkedinUrl: "https://linkedin.com/in/boblin",
        confidence: 0.9,
      },
    ],
    fundingHistory: [
      { round: "seed", amount: 2000000, currency: "USD", source: "crunchbase.com" },
    ],
    pitchDeckUrls: [],
    socialProfiles: { crunchbaseUrl: "https://crunchbase.com/acme" },
    productSignals: { pricing: "$50k/yr", customers: ["Ford", "GM"] },
    tractionSignals: {
      employeeCount: 14,
      webTrafficEstimate: "12k/mo",
    },
    fieldsEnriched: [],
    fieldsStillMissing: [],
    fieldsCorrected: [],
    correctionDetails: [],
    sources: [],
    dbFieldsUpdated: [],
  };

  const fakeScraping: ScrapingResult = {
    websiteUrl: "https://acme.test",
    websiteSummary: "Robotics automation for manufacturing.",
    teamMembers: [
      {
        name: "Alice Chen",
        role: "CEO",
        enrichmentStatus: "success",
        linkedinProfile: {
          headline: "CEO @ Acme",
          summary: "Ex-Tesla, leading Acme's robotics push.",
          currentCompany: { name: "Acme", title: "CEO" },
          experience: [
            {
              title: "Lead Engineer",
              company: "Tesla",
              duration: "2018-2024",
            },
          ],
          education: [
            { school: "MIT", degree: "MS", field: "MechE" },
          ],
        },
      },
    ],
    notableClaims: [],
    scrapeErrors: [],
    website: {
      url: "https://acme.test",
      title: "Acme",
      description: "Robotics automation",
      fullText: "",
      headings: ["Robots for factories", "Customers"],
      subpages: [],
      links: [],
      teamBios: [{ name: "Alice Chen", role: "CEO", bio: "Founded Acme in 2024" }],
      pricing: { plans: [{ name: "Enterprise", price: "$50k/yr", features: [] }] },
      customerLogos: ["ford.png", "gm.png"],
      testimonials: [{ quote: "Game changer", author: "Ford CTO" }],
      metadata: {
        scrapedAt: "2026-05-24T00:00:00Z",
        pageCount: 4,
        hasAboutPage: true,
        hasTeamPage: true,
        hasPricingPage: true,
      },
    },
  };

  function makeRouter() {
    const pipelineState = {
      getPhaseResult: mock(async (_id: string, phase: PipelinePhase) => {
        if (phase === PipelinePhase.EXTRACTION) return fakeExtraction;
        if (phase === PipelinePhase.ENRICHMENT) return fakeEnrichment;
        if (phase === PipelinePhase.SCRAPING) return fakeScraping;
        return null;
      }),
    } as unknown as PipelineStateService;
    return new LensContentRouterService(pipelineState);
  }

  it("market lens gets market/problem/solution/competitors deck sections + market research doc, NOT team/traction/financials", async () => {
    const r = makeRouter();
    const b = await r.buildForLens("market", "s1");

    expect(b.deckSectionsBlock).toContain("Market sizing");
    expect(b.deckSectionsBlock).toContain("$50B");
    expect(b.deckSectionsBlock).toContain("Problem");
    expect(b.deckSectionsBlock).toContain("Solution");
    expect(b.deckSectionsBlock).toContain("Competitors");
    expect(b.deckSectionsBlock).toContain("Symbotic");
    expect(b.deckSectionsBlock).not.toContain("Traction");
    expect(b.deckSectionsBlock).not.toContain("ARR");
    expect(b.deckSectionsBlock).not.toContain("Team (from deck)");

    expect(b.enrichmentBlock).toContain("Funding history");
    expect(b.enrichmentBlock).toContain("crunchbase.com");
    expect(b.enrichmentBlock).not.toContain("Discovered founders");

    expect(b.supportingDocsBlock).toContain("industry_report.pdf");
    expect(b.supportingDocsBlock).not.toContain("alice_cv.pdf");
    expect(b.supportingDocsBlock).not.toContain("financials_2026q1.xlsx");

    expect(b.teamProfilesBlock).toBe("");
    expect(b.deckExcerptBlock).toContain("$50B");
  });

  it("team lens gets team deck section + LinkedIn profiles + team_hr doc, NOT financials/market", async () => {
    const r = makeRouter();
    const b = await r.buildForLens("team", "s1");

    expect(b.deckSectionsBlock).toContain("Team (from deck)");
    expect(b.deckSectionsBlock).toContain("Alice Chen");
    expect(b.deckSectionsBlock).not.toContain("Market sizing");
    expect(b.deckSectionsBlock).not.toContain("Traction (from deck)");

    expect(b.enrichmentBlock).toContain("Discovered founders");
    expect(b.enrichmentBlock).toContain("Bob Lin");
    expect(b.enrichmentBlock).not.toContain("Funding history");

    expect(b.scrapedBlock).toContain("Team bios");
    expect(b.scrapedBlock).toContain("Alice Chen");

    expect(b.teamProfilesBlock).toContain("Alice Chen");
    expect(b.teamProfilesBlock).toContain("Tesla");
    expect(b.teamProfilesBlock).toContain("MIT");

    expect(b.supportingDocsBlock).toContain("alice_cv.pdf");
    expect(b.supportingDocsBlock).not.toContain("financials_2026q1.xlsx");
    expect(b.supportingDocsBlock).not.toContain("industry_report.pdf");

    // Team lens also gets the raw deck excerpt — biased toward team
    // keywords like "former Tesla engineers" / founder backgrounds.
    expect(b.deckExcerptBlock).toContain("Tesla");
  });

  it("traction lens gets traction/financials deck sections + tractionSignals + financials doc, NOT team/market", async () => {
    const r = makeRouter();
    const b = await r.buildForLens("traction", "s1");

    expect(b.deckSectionsBlock).toContain("Traction (from deck)");
    expect(b.deckSectionsBlock).toContain("Financials (from deck)");
    expect(b.deckSectionsBlock).toContain("ARR");
    expect(b.deckSectionsBlock).toContain("$1.2M");
    expect(b.deckSectionsBlock).not.toContain("Market sizing");
    expect(b.deckSectionsBlock).not.toContain("Team (from deck)");

    expect(b.enrichmentBlock).toContain("Employee count");
    expect(b.enrichmentBlock).toContain("14");
    expect(b.enrichmentBlock).toContain("Named customers");
    expect(b.enrichmentBlock).not.toContain("Discovered founders");

    expect(b.scrapedBlock).toContain("Pricing plans");
    expect(b.scrapedBlock).toContain("Customer logos count");
    expect(b.scrapedBlock).toContain("Testimonial");

    expect(b.supportingDocsBlock).toContain("financials_2026q1.xlsx");
    expect(b.supportingDocsBlock).not.toContain("alice_cv.pdf");

    expect(b.teamProfilesBlock).toBe("");
  });

  it("returns empty blocks when pipeline state is missing", async () => {
    const pipelineState = {
      getPhaseResult: mock(async () => {
        throw new Error("no state");
      }),
    } as unknown as PipelineStateService;
    const r = new LensContentRouterService(pipelineState);
    const b = await r.buildForLens("market", "s1");
    expect(b.deckSectionsBlock).toBe("");
    expect(b.deckExcerptBlock).toBe("");
    expect(b.enrichmentBlock).toBe("");
    expect(b.scrapedBlock).toBe("");
    expect(b.supportingDocsBlock).toBe("");
    expect(b.teamProfilesBlock).toBe("");
  });
});
