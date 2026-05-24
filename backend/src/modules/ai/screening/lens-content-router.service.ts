import { Injectable, Logger } from "@nestjs/common";
import { PipelineStateService } from "../services/pipeline-state.service";
import { PipelinePhase } from "../interfaces/pipeline.interface";
import { DocumentCategory } from "../interfaces/document-classification.interface";
import type {
  EnrichedTeamMember,
  EnrichmentResult,
  ExtractionResult,
  ScrapingResult,
  SupportingDocText,
} from "../interfaces/phase-results.interface";
import type { DeckStructuredData } from "../schemas/deck-structured-data.schema";

/**
 * Pre-formatted content blocks that drop directly into the lens prompt
 * template (V3). Empty string means "no content for this lens" — the
 * prompt renders an empty section in that case.
 */
export interface LensContentBundle {
  deckSectionsBlock: string;
  deckExcerptBlock: string;
  enrichmentBlock: string;
  scrapedBlock: string;
  supportingDocsBlock: string;
  teamProfilesBlock: string;
}

export type LensKey = "market" | "team" | "traction";

/** Cap for the rawText excerpt threaded into each lens prompt. */
const DECK_EXCERPT_MAX_CHARS = 10_000;
/** Max number of supporting docs threaded into a single lens prompt. */
const SUPPORTING_DOCS_MAX_PER_LENS = 4;

/**
 * Which classified document categories each lens should see. Mirrors the
 * intent of `CATEGORY_AGENT_MAP` (which is keyed for DD evaluation agents)
 * but specifically targets the screening lenses. A doc may appear in
 * multiple lenses' lists — that's fine, it's just an excerpt.
 */
const SUPPORTING_DOC_CATEGORIES_PER_LENS: Record<LensKey, DocumentCategory[]> = {
  market: [
    DocumentCategory.MARKET_RESEARCH,
    DocumentCategory.BUSINESS_PLAN,
    DocumentCategory.TECHNICAL_PRODUCT,
  ],
  team: [DocumentCategory.TEAM_HR],
  traction: [
    DocumentCategory.FINANCIAL,
    DocumentCategory.CAP_TABLE,
    DocumentCategory.BUSINESS_PLAN,
  ],
};

/**
 * DS-E2-F1-S3 — route the right cached upstream content to the right lens.
 *
 * Before this router landed, screening lenses received only seven scalar
 * fields (startupName, sector, stage, description, contextNotes, thesis,
 * teamMembers) — none of the structured extraction output, none of the
 * enrichment signals, none of the scraped website data, and none of the
 * classified non-deck documents in the data room. This router reads the
 * cached phase results from `PipelineStateService` and formats per-lens
 * prompt blocks, scoped so each lens only sees what it actually needs.
 *
 * The output is pre-formatted markdown — each block is dropped verbatim
 * into the lens user prompt's `{{deckSectionsBlock}}` / etc. template
 * variables. Empty strings are safe; the template renders nothing.
 */
@Injectable()
export class LensContentRouterService {
  private readonly logger = new Logger(LensContentRouterService.name);

  constructor(private readonly pipelineState: PipelineStateService) {}

  async buildForLens(
    lensKey: LensKey,
    startupId: string,
  ): Promise<LensContentBundle> {
    const extraction = await this.safeGetExtraction(startupId);
    const enrichment = await this.safeGetEnrichment(startupId);
    const scraping = await this.safeGetScraping(startupId);

    const deck = extraction?.deckStructuredData ?? null;
    return {
      deckSectionsBlock: this.renderDeckSections(lensKey, deck),
      deckExcerptBlock: this.renderDeckExcerpt(lensKey, extraction),
      enrichmentBlock: this.renderEnrichment(lensKey, enrichment),
      scrapedBlock: this.renderScraped(lensKey, scraping),
      supportingDocsBlock: this.renderSupportingDocs(
        lensKey,
        extraction?.supportingDocTexts ?? [],
      ),
      teamProfilesBlock:
        lensKey === "team"
          ? this.renderTeamProfiles(scraping?.teamMembers ?? [])
          : "",
    };
  }

  private async safeGetExtraction(
    startupId: string,
  ): Promise<ExtractionResult | null> {
    try {
      return await this.pipelineState.getPhaseResult(
        startupId,
        PipelinePhase.EXTRACTION,
      );
    } catch (err) {
      this.logger.debug(
        `No extraction state for ${startupId}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  private async safeGetEnrichment(
    startupId: string,
  ): Promise<EnrichmentResult | null> {
    try {
      return await this.pipelineState.getPhaseResult(
        startupId,
        PipelinePhase.ENRICHMENT,
      );
    } catch (err) {
      this.logger.debug(
        `No enrichment state for ${startupId}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  private async safeGetScraping(
    startupId: string,
  ): Promise<ScrapingResult | null> {
    try {
      return await this.pipelineState.getPhaseResult(
        startupId,
        PipelinePhase.SCRAPING,
      );
    } catch (err) {
      this.logger.debug(
        `No scraping state for ${startupId}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // ───── deck-structured-data renderers ─────────────────────────────────────

  private renderDeckSections(
    lensKey: LensKey,
    deck: DeckStructuredData | null,
  ): string {
    if (!deck) return "";

    const lines: string[] = [];

    if (lensKey === "market") {
      const market = deck.market;
      const marketBullets: string[] = [];
      if (market?.tam) marketBullets.push(`- TAM: ${market.tam}`);
      if (market?.sam) marketBullets.push(`- SAM: ${market.sam}`);
      if (market?.som) marketBullets.push(`- SOM: ${market.som}`);
      if (market?.marketGrowthRate)
        marketBullets.push(`- Growth rate: ${market.marketGrowthRate}`);
      if (marketBullets.length > 0) {
        lines.push(this.sectionHeader("Market sizing", market?.sourcePages));
        lines.push(...marketBullets);
      }

      const problem = deck.problem;
      if (problem?.statement || (problem?.painPoints?.length ?? 0) > 0) {
        lines.push("");
        lines.push(this.sectionHeader("Problem", problem?.sourcePages));
        if (problem?.statement) lines.push(`- Statement: ${problem.statement}`);
        for (const pp of problem?.painPoints ?? []) lines.push(`- Pain: ${pp}`);
      }

      const solution = deck.solution;
      if (solution?.statement || (solution?.keyDifferentiators?.length ?? 0) > 0) {
        lines.push("");
        lines.push(this.sectionHeader("Solution", solution?.sourcePages));
        if (solution?.statement) lines.push(`- ${solution.statement}`);
        for (const d of solution?.keyDifferentiators ?? [])
          lines.push(`- Differentiator: ${d}`);
      }

      const competitors = deck.competitors;
      const compList = competitors?.namedCompetitors ?? [];
      if (compList.length > 0 || competitors?.moat) {
        lines.push("");
        lines.push(this.sectionHeader("Competitors", competitors?.sourcePages));
        for (const c of compList) {
          lines.push(
            c.positioning
              ? `- ${c.name} — ${c.positioning}`
              : `- ${c.name}`,
          );
        }
        if (competitors?.moat) lines.push(`- Stated moat: ${competitors.moat}`);
      }
    }

    if (lensKey === "team") {
      const team = deck.team;
      const teamBullets: string[] = [];
      if (team?.founderCount != null)
        teamBullets.push(`- Founder count: ${team.founderCount}`);
      if (team?.teamSize) teamBullets.push(`- Team size: ${team.teamSize}`);
      for (const m of team?.keyMembers ?? []) {
        teamBullets.push(
          m.role ? `- ${m.name} — ${m.role}` : `- ${m.name}`,
        );
      }
      if (teamBullets.length > 0) {
        lines.push(this.sectionHeader("Team (from deck)", team?.sourcePages));
        lines.push(...teamBullets);
      }
    }

    if (lensKey === "traction") {
      const t = deck.traction;
      const tractionBullets: string[] = [];
      if (t?.customers) tractionBullets.push(`- Customers: ${t.customers}`);
      if (t?.users) tractionBullets.push(`- Users: ${t.users}`);
      if (t?.churnRate) tractionBullets.push(`- Churn rate: ${t.churnRate}`);
      for (const claim of t?.notableClaims ?? [])
        tractionBullets.push(`- Notable claim: ${claim}`);
      if (tractionBullets.length > 0) {
        lines.push(this.sectionHeader("Traction (from deck)", t?.sourcePages));
        lines.push(...tractionBullets);
      }

      const f = deck.financials;
      const finBullets: string[] = [];
      if (f?.arr) finBullets.push(`- ARR: ${f.arr}`);
      if (f?.mrr) finBullets.push(`- MRR: ${f.mrr}`);
      if (f?.revenue) finBullets.push(`- Revenue: ${f.revenue}`);
      if (f?.growthRate)
        finBullets.push(
          `- Growth rate: ${f.growthRate}${f.growthRatePeriod ? ` (${f.growthRatePeriod})` : ""}`,
        );
      if (f?.grossMargin) finBullets.push(`- Gross margin: ${f.grossMargin}`);
      if (f?.burnRate) finBullets.push(`- Burn rate: ${f.burnRate}`);
      if (f?.runway) finBullets.push(`- Runway: ${f.runway}`);
      if (f?.ltv) finBullets.push(`- LTV: ${f.ltv}`);
      if (f?.cac) finBullets.push(`- CAC: ${f.cac}`);
      if (f?.nrr) finBullets.push(`- NRR: ${f.nrr}`);
      if (finBullets.length > 0) {
        if (lines.length > 0) lines.push("");
        lines.push(this.sectionHeader("Financials (from deck)", f?.sourcePages));
        lines.push(...finBullets);
      }
    }

    if (lines.length === 0) return "";
    return ["=== DECK SECTIONS ===", ...lines].join("\n");
  }

  private sectionHeader(title: string, sourcePages: number[] | undefined): string {
    if (sourcePages && sourcePages.length > 0) {
      return `${title} (deck p.${sourcePages.join(", p.")})`;
    }
    return title;
  }

  private renderDeckExcerpt(
    lensKey: LensKey,
    extraction: ExtractionResult | null,
  ): string {
    if (!extraction) return "";
    const raw = (extraction.rawText ?? "").trim();
    if (raw.length === 0) return "";

    // Cheap topic-bias: bias which slice of the deck to keep per lens. We
    // don't have per-page topic labels, so this is a heuristic — search for
    // lens-relevant keywords and prefer the regions around them. Falls back
    // to a head excerpt if nothing matches.
    const keywords: Record<LensKey, RegExp> = {
      market: /(market|tam|sam|som|industry|growth|cagr|competitor|landscape)/i,
      team: /(team|founder|ceo|cto|hire|advisor|background|previously)/i,
      traction: /(traction|customer|revenue|arr|mrr|users|growth|pilot|churn|ltv|cac|burn|runway|pipeline)/i,
    };

    const excerpt = this.biasedExcerpt(raw, keywords[lensKey], DECK_EXCERPT_MAX_CHARS);
    if (!excerpt) return "";
    return ["=== DECK TEXT EXCERPT ===", excerpt].join("\n");
  }

  private biasedExcerpt(text: string, keywordRe: RegExp, maxChars: number): string {
    if (text.length <= maxChars) return text;

    // Find first keyword hit; take a window around it. If no hit, fall back
    // to the head of the document (which usually carries the executive
    // summary).
    const match = keywordRe.exec(text);
    if (!match) return text.slice(0, maxChars);

    const halfWindow = Math.floor(maxChars / 2);
    const start = Math.max(0, match.index - halfWindow);
    const end = Math.min(text.length, start + maxChars);
    const prefix = start > 0 ? "[…] " : "";
    const suffix = end < text.length ? " […]" : "";
    return prefix + text.slice(start, end) + suffix;
  }

  // ───── enrichment renderers ───────────────────────────────────────────────

  private renderEnrichment(
    lensKey: LensKey,
    enrichment: EnrichmentResult | null,
  ): string {
    if (!enrichment) return "";

    const lines: string[] = [];

    if (lensKey === "market") {
      if (enrichment.industry?.value)
        lines.push(
          `- Industry (enriched, confidence ${enrichment.industry.confidence}): ${enrichment.industry.value}`,
        );
      if (enrichment.sectorIndustry?.value)
        lines.push(
          `- Sector (enriched): ${enrichment.sectorIndustry.value}`,
        );
      if (enrichment.fundingHistory?.length) {
        lines.push("- Funding history:");
        for (const f of enrichment.fundingHistory.slice(0, 5)) {
          const amt = f.amount ? ` ${f.amount}${f.currency ?? ""}` : "";
          const date = f.date ? ` (${f.date})` : "";
          lines.push(`  · ${f.round}${amt}${date} — source: ${f.source}`);
        }
      }
      const socials = enrichment.socialProfiles;
      if (socials?.crunchbaseUrl)
        lines.push(`- Crunchbase: ${socials.crunchbaseUrl}`);
      if (socials?.linkedinCompanyUrl)
        lines.push(`- LinkedIn (company): ${socials.linkedinCompanyUrl}`);
    }

    if (lensKey === "team") {
      const discovered = enrichment.discoveredFounders ?? [];
      if (discovered.length > 0) {
        lines.push("- Discovered founders (web enrichment):");
        for (const f of discovered) {
          const role = f.role ? ` (${f.role})` : "";
          const li = f.linkedinUrl ? ` — ${f.linkedinUrl}` : "";
          lines.push(`  · ${f.name}${role}${li} [confidence ${f.confidence}]`);
        }
      }
    }

    if (lensKey === "traction") {
      const t = enrichment.tractionSignals;
      if (t?.employeeCount != null)
        lines.push(`- Employee count (enriched): ${t.employeeCount}`);
      if (t?.webTrafficEstimate)
        lines.push(`- Web traffic estimate: ${t.webTrafficEstimate}`);
      if (t?.appStoreRating)
        lines.push(`- App store rating: ${t.appStoreRating}`);
      if (t?.socialFollowers) {
        const followers = Object.entries(t.socialFollowers)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ");
        if (followers) lines.push(`- Social followers: ${followers}`);
      }
      const p = enrichment.productSignals;
      if (p?.pricing) lines.push(`- Pricing (enriched): ${p.pricing}`);
      if (p?.customers?.length)
        lines.push(`- Named customers: ${p.customers.join(", ")}`);
      if (p?.techStack?.length)
        lines.push(`- Tech stack: ${p.techStack.join(", ")}`);
    }

    if (lines.length === 0) return "";
    return ["=== ENRICHED DATA ===", ...lines].join("\n");
  }

  // ───── scraping renderers ─────────────────────────────────────────────────

  private renderScraped(
    lensKey: LensKey,
    scraping: ScrapingResult | null,
  ): string {
    if (!scraping) return "";

    const lines: string[] = [];

    if (lensKey === "market") {
      if (scraping.websiteSummary)
        lines.push(`- Website summary: ${scraping.websiteSummary}`);
      const site = scraping.website;
      if (site?.description) lines.push(`- Site description: ${site.description}`);
      const headings = (site?.headings ?? []).slice(0, 8);
      if (headings.length > 0)
        lines.push(`- Top headings: ${headings.join(" | ")}`);
      for (const claim of (scraping.notableClaims ?? []).slice(0, 6))
        lines.push(`- Notable claim: ${claim}`);
    }

    if (lensKey === "team") {
      const bios = scraping.website?.teamBios ?? [];
      if (bios.length > 0) {
        lines.push("- Team bios (from website):");
        for (const b of bios.slice(0, 8)) {
          const role = b.role ? ` (${b.role})` : "";
          const bio = b.bio ? `: ${b.bio.slice(0, 240)}` : "";
          lines.push(`  · ${b.name}${role}${bio}`);
        }
      }
    }

    if (lensKey === "traction") {
      const pricing = scraping.website?.pricing;
      if (pricing?.plans?.length) {
        lines.push("- Pricing plans (from website):");
        for (const plan of pricing.plans.slice(0, 4)) {
          lines.push(`  · ${plan.name} — ${plan.price}`);
        }
      }
      const customers = scraping.website?.customerLogos ?? [];
      if (customers.length > 0)
        lines.push(`- Customer logos count: ${customers.length}`);
      const testimonials = scraping.website?.testimonials ?? [];
      for (const t of testimonials.slice(0, 3)) {
        lines.push(`- Testimonial — ${t.author}: "${t.quote.slice(0, 240)}"`);
      }
    }

    if (lines.length === 0) return "";
    return ["=== WEBSITE / SCRAPED EVIDENCE ===", ...lines].join("\n");
  }

  // ───── supporting docs renderers ──────────────────────────────────────────

  private renderSupportingDocs(
    lensKey: LensKey,
    all: SupportingDocText[],
  ): string {
    if (all.length === 0) return "";

    const allowed = new Set(SUPPORTING_DOC_CATEGORIES_PER_LENS[lensKey]);
    const relevant = all
      .filter((d) => d.category != null && allowed.has(d.category))
      .slice(0, SUPPORTING_DOCS_MAX_PER_LENS);
    if (relevant.length === 0) return "";

    const blocks: string[] = ["=== SUPPORTING DOCUMENTS ==="];
    for (const doc of relevant) {
      blocks.push(
        `--- ${doc.fileName} (category=${doc.category ?? "unknown"}${
          doc.truncated ? ", truncated" : ""
        }) ---`,
      );
      blocks.push(doc.text);
    }
    return blocks.join("\n");
  }

  // ───── team profiles ──────────────────────────────────────────────────────

  private renderTeamProfiles(members: EnrichedTeamMember[]): string {
    const enriched = members.filter(
      (m) => m.linkedinProfile && m.enrichmentStatus === "success",
    );
    if (enriched.length === 0) return "";

    const blocks: string[] = ["=== TEAM PROFILES (LinkedIn-enriched) ==="];
    for (const m of enriched.slice(0, 8)) {
      const profile = m.linkedinProfile!;
      const lines: string[] = [];
      const role = m.role ? ` — ${m.role}` : "";
      lines.push(`* ${m.name}${role}`);
      if (profile.headline) lines.push(`  - Headline: ${profile.headline}`);
      if (profile.currentCompany?.name) {
        lines.push(
          `  - Current: ${profile.currentCompany.title} @ ${profile.currentCompany.name}`,
        );
      }
      const exp = (profile.experience ?? []).slice(0, 3);
      if (exp.length > 0) {
        lines.push("  - Past roles:");
        for (const e of exp) {
          lines.push(`    · ${e.title} @ ${e.company} (${e.duration})`);
        }
      }
      const edu = (profile.education ?? []).slice(0, 2);
      if (edu.length > 0) {
        lines.push("  - Education:");
        for (const e of edu) {
          const field = e.field ? `, ${e.field}` : "";
          lines.push(`    · ${e.degree}${field} — ${e.school}`);
        }
      }
      if (profile.summary) {
        lines.push(`  - Summary: ${profile.summary.slice(0, 240)}`);
      }
      blocks.push(lines.join("\n"));
    }
    return blocks.join("\n");
  }
}
