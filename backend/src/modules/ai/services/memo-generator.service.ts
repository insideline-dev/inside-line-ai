import { Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import { StorageService } from "../../../storage/storage.service";
import { ASSET_TYPES } from "../../../storage/storage.config";
import { PdfService } from "../../startup/pdf.service";
import { startup } from "../../startup/entities";
import type { SynthesisResult } from "../interfaces/phase-results.interface";

export interface MemoUploadResult {
  investorMemoUrl: string;
  founderReportUrl: string;
  investorMemoKey: string;
  founderReportKey: string;
}

@Injectable()
export class MemoGeneratorService {
  constructor(
    private drizzle: DrizzleService,
    private pdfService: PdfService,
    private storage: StorageService,
  ) {}

  async generateAndUpload(
    startupId: string,
    synthesis: SynthesisResult,
  ): Promise<MemoUploadResult> {
    const [record] = await this.drizzle.db
      .select({ id: startup.id, userId: startup.userId })
      .from(startup)
      .where(eq(startup.id, startupId));

    if (!record) {
      throw new NotFoundException(`Startup ${startupId} not found`);
    }

    const investorMemoPdf = await this.pdfService.generateMemo(
      startupId,
      record.userId,
    );
    const founderReportPdf = await this.pdfService.generateReport(
      startupId,
      record.userId,
    );

    const investorUpload = await this.storage.uploadGeneratedContent(
      record.userId,
      ASSET_TYPES.DOCUMENT,
      investorMemoPdf,
      "application/pdf",
      startupId,
      {
        memoType: "investor",
        recommendation: synthesis.recommendation,
      },
    );

    const founderUpload = await this.storage.uploadGeneratedContent(
      record.userId,
      ASSET_TYPES.DOCUMENT,
      founderReportPdf,
      "application/pdf",
      startupId,
      {
        memoType: "founder",
        recommendation: synthesis.recommendation,
      },
    );

    return {
      investorMemoUrl: investorUpload.url,
      founderReportUrl: founderUpload.url,
      investorMemoKey: investorUpload.key,
      founderReportKey: founderUpload.key,
    };
  }
}
