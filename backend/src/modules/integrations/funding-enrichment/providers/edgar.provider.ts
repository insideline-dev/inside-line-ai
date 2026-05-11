import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  FundingHistoryProvider,
  FundingProviderHints,
  RawFundingRound,
} from "../interfaces/funding-history-provider.interface";

/**
 * SEC EDGAR public-filings client. Targets Form D notices of exempt
 * offerings — the cheapest US public source for round size + investor
 * info on private companies. The full-text search endpoint is
 * `https://efts.sec.gov/LATEST/search-index?q=...&forms=D`.
 *
 * STUB IMPLEMENTATION — when `EDGAR_USER_AGENT` is set this would call
 * the live full-text search endpoint then walk to the actual Form D
 * filing for amount / investor parsing. The mapping is sketched below
 * but the live HTTP call is deliberately not implemented yet (see
 * follow-up TODO in YUSUP_PROJECT_MEMORY).
 *
 * Until the live call is wired:
 * - `isConfigured()` requires `EDGAR_USER_AGENT` so we never hit SEC
 *   anonymously (SEC bans clients without identifying UA strings).
 * - `fetchRounds()` returns `[]` so the orchestrator simply reports
 *   "no canonical match" for now.
 */
@Injectable()
export class EdgarProvider implements FundingHistoryProvider {
  readonly providerName = "public_filing" as const;
  private readonly logger = new Logger(EdgarProvider.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const userAgent = this.config.get<string>("EDGAR_USER_AGENT");
    return typeof userAgent === "string" && userAgent.length > 0;
  }

  async fetchRounds(hints: FundingProviderHints): Promise<RawFundingRound[]> {
    if (!this.isConfigured()) {
      return [];
    }

    // EDGAR only carries US-domiciled filings. If we know the country and
    // it's not US, bail before issuing a request.
    if (hints.country && hints.country.toUpperCase() !== "US") {
      this.logger.debug(
        `EdgarProvider skipped — startup country ${hints.country} not US`,
      );
      return [];
    }

    // TODO(DG-E11-F1-S1 follow-up): wire real EDGAR full-text search.
    // Endpoint: GET https://efts.sec.gov/LATEST/search-index?q="${name}"&forms=D
    // Then for each hit, GET the filing JSON and parse Form D Item 13
    // (total amount sold) + Item 7 (related-persons / investors). Map:
    //   roundType: derive from offering description ("seed", "series_a"...)
    //   announcedAt: filing.sale_first_date or filed_at
    //   amount: filing.total_amount_sold
    //   currency: "USD"
    //   leadInvestor: null (Form D doesn't structurally call this out)
    //   investors: filing.related_persons.map(p => p.name)
    //   source.sourceUrl: filing.filing_html_url
    //
    // The live path stays disabled until the SEC client + parser are
    // hardened against rate limits and partial filings.
    this.logger.debug(
      `EdgarProvider stub invoked for "${hints.name}" — real HTTP path not yet implemented`,
    );
    return [];
  }
}
