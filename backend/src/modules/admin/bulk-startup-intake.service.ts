import {
  Injectable,
  Logger,
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { StartupIntakeService } from '../startup/startup-intake.service';
import { StartupSourcePath } from '../startup/entities/startup.schema';

const MAX_BYTES = 1 * 1024 * 1024; // 1MB
const MAX_ROWS = 100;
const REQUIRED_HEADERS = ['company', 'website', 'founder_name', 'founder_email'] as const;
const OPTIONAL_HEADERS = ['deck_url', 'stage', 'funding_target'] as const;
const ALL_HEADERS = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS] as const;

export type BulkUploadRowStatus = 'created' | 'duplicate_merged' | 'failed';

export interface BulkUploadRowResult {
  rowIndex: number;
  company: string;
  status: BulkUploadRowStatus;
  startupId?: string;
  reason?: string;
}

export interface BulkUploadSummary {
  total: number;
  created: number;
  duplicate_merged: number;
  failed: number;
  rows: BulkUploadRowResult[];
}

interface ParsedRow {
  company: string;
  website: string;
  founder_name: string;
  founder_email: string;
  deck_url?: string;
  stage?: string;
  funding_target?: string;
}

@Injectable()
export class BulkStartupIntakeService {
  private readonly logger = new Logger(BulkStartupIntakeService.name);

  constructor(private readonly intake: StartupIntakeService) {}

  async processCsv(
    adminUserId: string,
    fileBuffer: Buffer,
  ): Promise<BulkUploadSummary> {
    if (fileBuffer.byteLength > MAX_BYTES) {
      throw new PayloadTooLargeException(
        `CSV must be <= ${Math.floor(MAX_BYTES / 1024)}KB`,
      );
    }

    const content = fileBuffer.toString('utf-8');
    const parsed = this.parseCsv(content);

    if (parsed.rows.length === 0) {
      throw new BadRequestException('CSV has no data rows');
    }

    if (parsed.rows.length > MAX_ROWS) {
      throw new PayloadTooLargeException(
        `Too many rows: ${parsed.rows.length} (max ${MAX_ROWS})`,
      );
    }

    const missingHeaders = REQUIRED_HEADERS.filter(
      (h) => !parsed.headers.includes(h),
    );
    if (missingHeaders.length > 0) {
      throw new BadRequestException(
        `Missing required column(s): ${missingHeaders.join(', ')}`,
      );
    }

    // Per-row processing (sequential — preserves dedupe ordering when two rows
    // in the same upload reference the same company; first wins as `created`,
    // subsequent rows resolve as `duplicate_merged`).
    const rows: BulkUploadRowResult[] = [];
    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i];
      const rowIndex = i + 2; // 1-based + header row
      rows.push(await this.processRow(adminUserId, rowIndex, row));
    }

    const summary: BulkUploadSummary = {
      total: rows.length,
      created: rows.filter((r) => r.status === 'created').length,
      duplicate_merged: rows.filter((r) => r.status === 'duplicate_merged').length,
      failed: rows.filter((r) => r.status === 'failed').length,
      rows,
    };

    this.logger.log(
      `Bulk upload by ${adminUserId}: total=${summary.total} created=${summary.created} duplicate=${summary.duplicate_merged} failed=${summary.failed}`,
    );

    return summary;
  }

  private async processRow(
    adminUserId: string,
    rowIndex: number,
    row: ParsedRow,
  ): Promise<BulkUploadRowResult> {
    const company = row.company?.trim() ?? '';
    if (!company) {
      return {
        rowIndex,
        company: '',
        status: 'failed',
        reason: 'company is required',
      };
    }

    const founderEmail = row.founder_email?.trim();
    if (!founderEmail || !this.isValidEmail(founderEmail)) {
      return {
        rowIndex,
        company,
        status: 'failed',
        reason: founderEmail
          ? 'founder_email is invalid'
          : 'founder_email is required',
      };
    }

    const website = row.website?.trim() ?? '';
    if (website && !this.isLikelyUrl(website)) {
      return {
        rowIndex,
        company,
        status: 'failed',
        reason: 'website must be a valid URL',
      };
    }

    const deckUrl = row.deck_url?.trim();
    if (deckUrl && !this.isLikelyUrl(deckUrl)) {
      return {
        rowIndex,
        company,
        status: 'failed',
        reason: 'deck_url must be a valid URL',
      };
    }

    try {
      const result = await this.intake.createStartup({
        adminUserId,
        companyName: company,
        fromEmail: founderEmail,
        fromName: row.founder_name?.trim() || undefined,
        bodyText: this.buildBodyText(row),
        pitchDeckPath: undefined,
        source: StartupSourcePath.ADMIN_CSV,
      });

      return {
        rowIndex,
        company,
        status: result.isDuplicate ? 'duplicate_merged' : 'created',
        startupId: result.startupId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[BulkUpload] row ${rowIndex} (${company}) failed: ${message}`,
      );
      return {
        rowIndex,
        company,
        status: 'failed',
        reason: message,
      };
    }
  }

  private buildBodyText(row: ParsedRow): string {
    const parts: string[] = [];
    if (row.website?.trim()) parts.push(`Website: ${row.website.trim()}`);
    if (row.deck_url?.trim()) parts.push(`Deck: ${row.deck_url.trim()}`);
    if (row.stage?.trim()) parts.push(`Stage: ${row.stage.trim()}`);
    if (row.funding_target?.trim())
      parts.push(`Funding target: ${row.funding_target.trim()}`);
    return parts.length > 0
      ? `Bulk upload row.\n${parts.join('\n')}`
      : 'Bulk upload row.';
  }

  private parseCsv(content: string): {
    headers: string[];
    rows: ParsedRow[];
  } {
    const lines = content
      .replace(/\r\n/g, '\n')
      .split('\n')
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      return { headers: [], rows: [] };
    }

    const rawHeaders = this.parseCsvLine(lines[0]).map((h) =>
      h.toLowerCase().replace(/\s+/g, '_'),
    );
    const headers = rawHeaders;

    const rows: ParsedRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCsvLine(lines[i]);
      // Skip blank lines (all-empty cells)
      if (values.every((v) => v.trim() === '')) continue;

      const record: Record<string, string> = {};
      headers.forEach((header, idx) => {
        record[header] = values[idx] ?? '';
      });

      rows.push({
        company: record.company ?? '',
        website: record.website ?? '',
        founder_name: record.founder_name ?? '',
        founder_email: record.founder_email ?? '',
        deck_url: record.deck_url ?? undefined,
        stage: record.stage ?? undefined,
        funding_target: record.funding_target ?? undefined,
      });
    }
    return { headers, rows };
  }

  private parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private isLikelyUrl(value: string): boolean {
    try {
      const u = new URL(value);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /** Public for documentation/test reuse. */
  static get supportedHeaders(): readonly string[] {
    return ALL_HEADERS;
  }
}
