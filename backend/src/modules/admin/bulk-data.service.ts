import { Injectable } from '@nestjs/common';
import { DataImportService } from './data-import.service';
import type { ExportStartupsQueryDto } from './dto';

@Injectable()
export class BulkDataService {
  constructor(private dataImportService: DataImportService) {}

  async importStartups(csvBuffer: Buffer) {
    const content = csvBuffer.toString('utf-8');
    return this.dataImportService.importStartups(content);
  }

  async exportStartups(filters?: ExportStartupsQueryDto) {
    const csv = await this.dataImportService.exportStartups(filters);
    return Buffer.from(csv, 'utf-8');
  }
}
