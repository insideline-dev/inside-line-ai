import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { BulkStartupIntakeService } from '../bulk-startup-intake.service';
import {
  StartupIntakeService,
  type StartupIntakeParams,
  type StartupIntakeResult,
} from '../../startup/startup-intake.service';
import { StartupStatus } from '../../startup/entities/startup.schema';

describe('BulkStartupIntakeService', () => {
  let service: BulkStartupIntakeService;
  let intake: { createStartup: jest.Mock };

  const ADMIN_ID = '00000000-0000-0000-0000-000000000001';

  beforeEach(async () => {
    intake = {
      createStartup: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BulkStartupIntakeService,
        {
          provide: StartupIntakeService,
          useValue: intake,
        },
      ],
    }).compile();

    service = module.get<BulkStartupIntakeService>(BulkStartupIntakeService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function buf(csv: string): Buffer {
    return Buffer.from(csv, 'utf-8');
  }

  function ok(id: string, name: string, isDuplicate = false): StartupIntakeResult {
    return {
      startupId: id,
      startupName: name,
      isDuplicate,
      status: StartupStatus.SUBMITTED,
    };
  }

  describe('header validation', () => {
    it('rejects CSV with missing required columns', async () => {
      const csv = `company,website\nFoo,https://foo.com`;
      await expect(service.processCsv(ADMIN_ID, buf(csv))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('mentions the missing column names in the error', async () => {
      const csv = `company,website\nFoo,https://foo.com`;
      try {
        await service.processCsv(ADMIN_ID, buf(csv));
        throw new Error('expected to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const message = (err as BadRequestException).message;
        expect(message).toContain('founder_name');
        expect(message).toContain('founder_email');
      }
    });

    it('rejects an empty CSV with only a header row', async () => {
      const csv = `company,website,founder_name,founder_email`;
      await expect(service.processCsv(ADMIN_ID, buf(csv))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('size limits', () => {
    it('rejects payload > 1MB', async () => {
      const big = Buffer.alloc(1024 * 1024 + 1, 'a');
      await expect(service.processCsv(ADMIN_ID, big)).rejects.toBeInstanceOf(
        PayloadTooLargeException,
      );
    });

    it('rejects more than 100 data rows', async () => {
      const header = 'company,website,founder_name,founder_email';
      const lines = [header];
      for (let i = 0; i < 101; i++) {
        lines.push(`Co${i},https://co${i}.com,Founder ${i},f${i}@example.com`);
      }
      await expect(
        service.processCsv(ADMIN_ID, buf(lines.join('\n'))),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
    });
  });

  describe('per-row processing', () => {
    it('routes each row through StartupIntakeService.createStartup with source=admin-csv', async () => {
      intake.createStartup.mockImplementation(async (params: StartupIntakeParams) =>
        ok('id-' + params.companyName, params.companyName),
      );
      const csv = `company,website,founder_name,founder_email
Acme,https://acme.com,Alice,alice@acme.com`;
      const summary = await service.processCsv(ADMIN_ID, buf(csv));
      expect(summary.total).toBe(1);
      expect(summary.created).toBe(1);
      expect(summary.rows[0].status).toBe('created');
      expect(summary.rows[0].startupId).toBe('id-Acme');
      expect(intake.createStartup).toHaveBeenCalledWith(
        expect.objectContaining({
          adminUserId: ADMIN_ID,
          companyName: 'Acme',
          fromEmail: 'alice@acme.com',
          fromName: 'Alice',
          source: 'admin-csv',
        }),
      );
    });

    it('reports duplicate_merged when intake reports duplicate', async () => {
      intake.createStartup.mockResolvedValue(ok('existing-id', 'Acme', true));
      const csv = `company,website,founder_name,founder_email
Acme,https://acme.com,Alice,alice@acme.com`;
      const summary = await service.processCsv(ADMIN_ID, buf(csv));
      expect(summary.duplicate_merged).toBe(1);
      expect(summary.rows[0].status).toBe('duplicate_merged');
      expect(summary.rows[0].startupId).toBe('existing-id');
    });

    it('marks rows missing required fields as failed without calling intake', async () => {
      const csv = `company,website,founder_name,founder_email
,https://acme.com,Alice,alice@acme.com
Acme,https://acme.com,Alice,not-an-email
NoEmail,https://noemail.com,Bob,`;
      const summary = await service.processCsv(ADMIN_ID, buf(csv));
      expect(summary.failed).toBe(3);
      expect(summary.created).toBe(0);
      expect(intake.createStartup).not.toHaveBeenCalled();
      expect(summary.rows[0].reason).toContain('company');
      expect(summary.rows[1].reason).toContain('founder_email');
      expect(summary.rows[2].reason).toContain('founder_email');
    });

    it('marks invalid website URLs as failed', async () => {
      const csv = `company,website,founder_name,founder_email
Acme,not-a-url,Alice,alice@acme.com`;
      const summary = await service.processCsv(ADMIN_ID, buf(csv));
      expect(summary.failed).toBe(1);
      expect(summary.rows[0].reason).toContain('website');
      expect(intake.createStartup).not.toHaveBeenCalled();
    });

    it('aggregates mixed outcomes across rows', async () => {
      intake.createStartup
        .mockResolvedValueOnce(ok('id-1', 'Path Robotics'))
        .mockResolvedValueOnce(ok('existing', 'Path Robotics', true))
        .mockResolvedValueOnce(ok('id-3', 'Helios Labs'));
      const csv = `company,website,founder_name,founder_email
Path Robotics,https://pathrobotics.com,Alice,alice@pr.com
Path Robotics,https://pathrobotics.com,Alice,alice@pr.com
Helios Labs,https://helios.example,Bob,bob@helios.example
,https://x.com,Carol,carol@x.com`;
      const summary = await service.processCsv(ADMIN_ID, buf(csv));
      expect(summary.total).toBe(4);
      expect(summary.created).toBe(2);
      expect(summary.duplicate_merged).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.rows.map((r) => r.rowIndex)).toEqual([2, 3, 4, 5]);
    });

    it('captures intake errors as failed rows with reason', async () => {
      intake.createStartup.mockRejectedValue(new Error('pipeline blew up'));
      const csv = `company,website,founder_name,founder_email
Acme,https://acme.com,Alice,alice@acme.com`;
      const summary = await service.processCsv(ADMIN_ID, buf(csv));
      expect(summary.failed).toBe(1);
      expect(summary.rows[0].reason).toBe('pipeline blew up');
    });
  });

  describe('CSV parsing', () => {
    it('handles quoted fields with commas inside', async () => {
      intake.createStartup.mockResolvedValue(ok('id-1', 'Acme, Inc.'));
      const csv = `company,website,founder_name,founder_email
"Acme, Inc.",https://acme.com,Alice,alice@acme.com`;
      const summary = await service.processCsv(ADMIN_ID, buf(csv));
      expect(summary.created).toBe(1);
      expect(intake.createStartup).toHaveBeenCalledWith(
        expect.objectContaining({ companyName: 'Acme, Inc.' }),
      );
    });

    it('forwards optional deck_url / stage / funding_target into bodyText', async () => {
      intake.createStartup.mockResolvedValue(ok('id-1', 'Acme'));
      const csv = `company,website,founder_name,founder_email,deck_url,stage,funding_target
Acme,https://acme.com,Alice,alice@acme.com,https://decks.example/d.pdf,seed,500000`;
      await service.processCsv(ADMIN_ID, buf(csv));
      const call = intake.createStartup.mock.calls[0]?.[0] as StartupIntakeParams;
      expect(call.bodyText).toContain('Deck: https://decks.example/d.pdf');
      expect(call.bodyText).toContain('Stage: seed');
      expect(call.bodyText).toContain('Funding target: 500000');
    });

    it('tolerates CRLF line endings and trailing blank rows', async () => {
      intake.createStartup.mockResolvedValue(ok('id-1', 'Acme'));
      const csv = `company,website,founder_name,founder_email\r\nAcme,https://acme.com,Alice,alice@acme.com\r\n\r\n`;
      const summary = await service.processCsv(ADMIN_ID, buf(csv));
      expect(summary.total).toBe(1);
      expect(summary.created).toBe(1);
    });
  });
});
