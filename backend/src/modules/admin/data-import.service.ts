import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { user, UserRole } from '../../auth/entities/auth.schema';
import { startup, StartupStatus, StartupStage } from '../startup/entities/startup.schema';
import { deriveStartupGeography } from '../geography';
import { ExportUsersQuery, ExportStartupsQuery } from './dto';

interface CsvRow {
  [key: string]: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
}

@Injectable()
export class DataImportService {
  private readonly logger = new Logger(DataImportService.name);

  constructor(private drizzle: DrizzleService) {}

  async importUsers(csvContent: string): Promise<ImportResult> {
    const rows = this.parseCsv(csvContent);
    const result: ImportResult = { imported: 0, skipped: 0, errors: [] };

    if (rows.length === 0) {
      throw new BadRequestException('CSV file is empty');
    }

    const requiredHeaders = ['email', 'name'];
    const headers = Object.keys(rows[0]);
    const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));
    if (missingHeaders.length > 0) {
      throw new BadRequestException(
        `Missing required headers: ${missingHeaders.join(', ')}`,
      );
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // Account for header row and 0-index

      try {
        // Validate email
        if (!row.email || !this.isValidEmail(row.email)) {
          result.errors.push({ row: rowNum, error: 'Invalid email' });
          result.skipped++;
          continue;
        }

        // Validate name
        if (!row.name || row.name.trim().length < 1) {
          result.errors.push({ row: rowNum, error: 'Name is required' });
          result.skipped++;
          continue;
        }

        // Check if user already exists
        const [existing] = await this.drizzle.db
          .select({ id: user.id })
          .from(user)
          .where(eq(user.email, row.email.toLowerCase()))
          .limit(1);

        if (existing) {
          result.errors.push({ row: rowNum, error: 'Email already exists' });
          result.skipped++;
          continue;
        }

        // Validate role if provided
        const role = row.role?.toLowerCase();
        if (role && !Object.values(UserRole).includes(role as UserRole)) {
          result.errors.push({ row: rowNum, error: 'Invalid role' });
          result.skipped++;
          continue;
        }

        await this.drizzle.db.insert(user).values({
          email: row.email.toLowerCase(),
          name: row.name.trim(),
          role: (role as UserRole) || UserRole.FOUNDER,
          emailVerified: false,
        });

        result.imported++;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push({ row: rowNum, error: message });
        result.skipped++;
      }
    }

    this.logger.log(
      `Imported ${result.imported} users, skipped ${result.skipped}`,
    );
    return result;
  }

  async importStartups(csvContent: string): Promise<ImportResult> {
    const rows = this.parseCsv(csvContent);
    const result: ImportResult = { imported: 0, skipped: 0, errors: [] };

    if (rows.length === 0) {
      throw new BadRequestException('CSV file is empty');
    }

    const requiredHeaders = [
      'user_email',
      'name',
      'tagline',
      'description',
      'website',
      'location',
      'industry',
      'stage',
      'funding_target',
      'team_size',
    ];
    const headers = Object.keys(rows[0]);
    const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));
    if (missingHeaders.length > 0) {
      throw new BadRequestException(
        `Missing required headers: ${missingHeaders.join(', ')}`,
      );
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      try {
        // Find user by email
        const [foundUser] = await this.drizzle.db
          .select({ id: user.id })
          .from(user)
          .where(eq(user.email, row.user_email?.toLowerCase()))
          .limit(1);

        if (!foundUser) {
          result.errors.push({ row: rowNum, error: 'User email not found' });
          result.skipped++;
          continue;
        }

        // Validate stage
        const stage = row.stage?.toLowerCase().replace('_', '-');
        if (!Object.values(StartupStage).includes(stage as StartupStage)) {
          result.errors.push({ row: rowNum, error: 'Invalid stage' });
          result.skipped++;
          continue;
        }

        // Validate numbers
        const fundingTarget = parseInt(row.funding_target, 10);
        const teamSize = parseInt(row.team_size, 10);
        if (isNaN(fundingTarget) || fundingTarget <= 0) {
          result.errors.push({ row: rowNum, error: 'Invalid funding_target' });
          result.skipped++;
          continue;
        }
        if (isNaN(teamSize) || teamSize <= 0) {
          result.errors.push({ row: rowNum, error: 'Invalid team_size' });
          result.skipped++;
          continue;
        }

        const slug = this.generateSlug(row.name);
        const geography = deriveStartupGeography(row.location.trim());

        await this.drizzle.db.insert(startup).values({
          userId: foundUser.id,
          name: row.name.trim(),
          slug,
          tagline: row.tagline.trim(),
          description: row.description.trim(),
          website: row.website.trim(),
          location: row.location.trim(),
          normalizedRegion: geography.normalizedRegion,
          geoCountryCode: geography.countryCode,
          geoLevel1: geography.level1,
          geoLevel2: geography.level2,
          geoLevel3: geography.level3,
          geoPath: geography.path,
          industry: row.industry.trim(),
          stage: stage as StartupStage,
          fundingTarget,
          teamSize,
          status: StartupStatus.DRAFT,
        });

        result.imported++;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push({ row: rowNum, error: message });
        result.skipped++;
      }
    }

    this.logger.log(
      `Imported ${result.imported} startups, skipped ${result.skipped}`,
    );
    return result;
  }

  async exportUsers(query?: ExportUsersQuery): Promise<string> {
    const conditions = query?.role ? eq(user.role, query.role) : undefined;

    const users = await this.drizzle.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(conditions);

    const headers = ['id', 'name', 'email', 'role', 'email_verified', 'created_at'];
    const csvRows = [headers.join(',')];

    for (const u of users) {
      csvRows.push(
        [
          u.id,
          this.escapeCsvField(u.name),
          u.email,
          u.role,
          u.emailVerified,
          u.createdAt.toISOString(),
        ].join(','),
      );
    }

    return csvRows.join('\n');
  }

  async exportStartups(query?: ExportStartupsQuery): Promise<string> {
    const conditions = query?.status
      ? eq(startup.status, query.status)
      : undefined;

    const startups = await this.drizzle.db
      .select()
      .from(startup)
      .where(conditions);

    const headers = [
      'id',
      'name',
      'slug',
      'tagline',
      'description',
      'website',
      'location',
      'industry',
      'stage',
      'funding_target',
      'team_size',
      'status',
      'created_at',
    ];
    const csvRows = [headers.join(',')];

    for (const s of startups) {
      csvRows.push(
        [
          s.id,
          this.escapeCsvField(s.name),
          s.slug,
          this.escapeCsvField(s.tagline),
          this.escapeCsvField(s.description),
          s.website,
          this.escapeCsvField(s.location),
          s.industry,
          s.stage,
          s.fundingTarget,
          s.teamSize,
          s.status,
          s.createdAt.toISOString(),
        ].join(','),
      );
    }

    return csvRows.join('\n');
  }

  private parseCsv(content: string): CsvRow[] {
    const lines = content.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = this.parseCsvLine(lines[0]);
    const rows: CsvRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCsvLine(lines[i]);
      const row: CsvRow = {};

      headers.forEach((header, index) => {
        row[header.toLowerCase().replace(/\s+/g, '_')] = values[index] ?? '';
      });

      rows.push(row);
    }

    return rows;
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

  private escapeCsvField(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    // Add random suffix to avoid collisions
    const suffix = Math.random().toString(36).substring(2, 8);
    return `${base}-${suffix}`;
  }
}
