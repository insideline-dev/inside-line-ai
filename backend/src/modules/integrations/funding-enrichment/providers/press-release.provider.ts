import { Injectable, Logger } from "@nestjs/common";
import type {
  FundingHistoryProvider,
  FundingProviderHints,
  RawFundingRound,
} from "../interfaces/funding-history-provider.interface";

/**
 * Press-release fallback provider. When `BRAVE_SEARCH_API_KEY` is set (it
 * lives in env already for general research), this provider would issue a
 * Brave search for `"<company name>" "Series X" raised` and use the
 * existing AI extraction pipeline to pull structured rounds out of the
 * top results.
 *
 * STUB IMPLEMENTATION — `isConfigured()` is always true so this provider
 * always participates in the orchestrator (its `fetchRounds` returns `[]`
 * by default), satisfying the "graceful fallback" requirement when both
 * Crunchbase and EDGAR are unconfigured. The live AI-extract path will
 * be wired in a follow-up.
 *
 * NOTE: This provider name "press_release" matches the source-entry
 * provider enum so persistence remains consistent.
 */
@Injectable()
export class PressReleaseProvider implements FundingHistoryProvider {
  readonly providerName = "press_release" as const;
  private readonly logger = new Logger(PressReleaseProvider.name);

  isConfigured(): boolean {
    return true;
  }

  async fetchRounds(hints: FundingProviderHints): Promise<RawFundingRound[]> {
    // TODO(DG-E11-F1-S1 follow-up): wire Brave-search + AiProviderService
    // structured-extract path. For now we return [] so the orchestrator
    // produces the canonical "no public funding history found" UI state.
    this.logger.debug(
      `PressReleaseProvider stub invoked for "${hints.name}" — AI extract path not yet implemented`,
    );
    return [];
  }
}
