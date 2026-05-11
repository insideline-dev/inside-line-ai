import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  FundingHistoryProvider,
  FundingProviderHints,
  RawFundingRound,
} from "../interfaces/funding-history-provider.interface";

/**
 * Crunchbase v4 API client.
 *
 * STUB IMPLEMENTATION — when `CRUNCHBASE_API_KEY` is set this would call the
 * real `funding_rounds` search endpoint. The wire shape mapping is sketched
 * below but the live request is deliberately not implemented yet (see
 * follow-up TODO in YUSUP_PROJECT_MEMORY).
 *
 * Until the real call is wired:
 * - `isConfigured()` returns true only when both `CRUNCHBASE_API_KEY` and
 *   `CRUNCHBASE_API_BASE_URL` are set AND a sandbox response file path is
 *   provided via env. In production with a real key, this client would
 *   issue an HTTP request.
 * - For tests, callers should construct this provider with a manual
 *   fixture loader (see `crunchbase-stub.factory.ts`).
 */
@Injectable()
export class CrunchbaseProvider implements FundingHistoryProvider {
  readonly providerName = "crunchbase" as const;
  private readonly logger = new Logger(CrunchbaseProvider.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const apiKey = this.config.get<string>("CRUNCHBASE_API_KEY");
    return typeof apiKey === "string" && apiKey.length > 0;
  }

  async fetchRounds(hints: FundingProviderHints): Promise<RawFundingRound[]> {
    if (!this.isConfigured()) {
      return [];
    }

    // TODO(DG-E11-F1-S1 follow-up): wire real Crunchbase v4 client.
    // Endpoint: POST {base}/searches/funding_rounds
    // Request body shape:
    //   { field_ids: [...], query: [{ type: "predicate", field_id:
    //     "funded_organization_name", operator_id: "eq", values: [hints.name] }] }
    // Response items map to RawFundingRound via:
    //   roundType: properties.investment_type
    //   announcedAt: properties.announced_on
    //   amount: properties.money_raised.value
    //   currency: properties.money_raised.currency
    //   valuationPostMoney: properties.post_money_valuation?.value
    //   leadInvestor: derived from properties.lead_investor_identifiers[0]
    //   investors: properties.investor_identifiers.map(i => i.value)
    //   source.sourceUrl: `https://www.crunchbase.com/funding_round/${permalink}`
    //
    // The integration is gated behind the env-key check above so this
    // function returns nothing in environments without sandbox credentials.
    this.logger.debug(
      `CrunchbaseProvider stub invoked for "${hints.name}" — real HTTP path not yet implemented`,
    );
    return [];
  }
}
