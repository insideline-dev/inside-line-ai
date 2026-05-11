import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "../../../database/database.module";
import {
  FundingEnrichmentService,
  FUNDING_HISTORY_PROVIDERS,
} from "./funding-enrichment.service";
import { FundingEnrichmentController } from "./funding-enrichment.controller";
import { CrunchbaseProvider } from "./providers/crunchbase.provider";
import { EdgarProvider } from "./providers/edgar.provider";
import { PressReleaseProvider } from "./providers/press-release.provider";
import type { FundingHistoryProvider } from "./interfaces/funding-history-provider.interface";

@Module({
  imports: [ConfigModule, DatabaseModule],
  controllers: [FundingEnrichmentController],
  providers: [
    CrunchbaseProvider,
    EdgarProvider,
    PressReleaseProvider,
    {
      provide: FUNDING_HISTORY_PROVIDERS,
      inject: [CrunchbaseProvider, EdgarProvider, PressReleaseProvider],
      useFactory: (
        crunchbase: CrunchbaseProvider,
        edgar: EdgarProvider,
        press: PressReleaseProvider,
      ): FundingHistoryProvider[] => [crunchbase, edgar, press],
    },
    FundingEnrichmentService,
  ],
  exports: [FundingEnrichmentService],
})
export class FundingEnrichmentModule {}
